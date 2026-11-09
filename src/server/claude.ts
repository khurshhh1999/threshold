import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { Redis } from "@upstash/redis";

const model = "claude-haiku-5-5";
const dailyLimit = 3;
const perIpDailyLimit = 0.4;

export class UsageLimitError extends Error {}
export class ServiceUnavailableError extends Error {}

function redisClient() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new ServiceUnavailableError("Redis is unavailable");
  return new Redis({ url, token });
}

export async function explainWithClaude(input: {
  ip: string;
  program: string;
  outcome: string;
  reason: string;
  threshold: number;
  savings: number;
}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new ServiceUnavailableError("Claude is unavailable");
  const redis = redisClient();
  const minute = Math.floor(Date.now() / 60000);
  const minuteKey = `ai:minute:${input.ip}:${minute}`;
  const calls = await redis.incr(minuteKey);
  if (calls === 1) await redis.expire(minuteKey, 120);
  if (calls > 12) throw new UsageLimitError("Too many requests");

  const day = new Date().toISOString().slice(0, 10);
  const globalKey = `ai:daily:${day}`;
  const ipKey = `ai:daily:${input.ip}:${day}`;
  const reserveUsd = 0.005;
  const globalSpend = await redis.incrbyfloat(globalKey, reserveUsd);
  if (globalSpend === reserveUsd) await redis.expire(globalKey, 172800);
  if (globalSpend > dailyLimit)
    throw new UsageLimitError("Daily limit reached");
  const ipSpend = await redis.incrbyfloat(ipKey, reserveUsd);
  if (ipSpend === reserveUsd) await redis.expire(ipKey, 172800);
  if (ipSpend > perIpDailyLimit)
    throw new UsageLimitError("Daily limit reached");

  const client = new Anthropic({ apiKey: key, timeout: 45000, maxRetries: 0 });
  const response = await client.messages.create({
    model,
    max_tokens: 250,
    system:
      "Explain this eligibility result to a caseworker in two short sentences. Use only the facts and numbers supplied. Do not add advice or new numbers. Do not make the eligibility decision yourself.",
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          program: input.program,
          outcome: input.outcome,
          reason: input.reason,
          incomeLimitUsd: input.threshold,
          estimatedAnnualSavingsUsd: input.savings,
        }),
      },
    ],
  });
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join(" ")
    .trim();
  if (!text) throw new ServiceUnavailableError("Claude returned no text");
  const allowed = new Set([input.threshold, input.savings].map(String));
  const numbers = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  if (numbers.some((value) => !allowed.has(value.replaceAll(",", "")))) {
    return { text: input.reason, source: "rules" as const };
  }
  return { text, source: "claude" as const };
}
