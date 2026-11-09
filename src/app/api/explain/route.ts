import { NextResponse } from "next/server";
import { z } from "zod";
import { evaluate, seed } from "@/lib/engine";
import {
  explainWithClaude,
  ServiceUnavailableError,
  UsageLimitError,
} from "@/server/claude";

const requestSchema = z.object({
  householdId: z.string().regex(/^HH-\d{4}$/),
  programId: z.string().max(40),
});

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 1000)
    return NextResponse.json({ error: "Request too large" }, { status: 413 });
  let input: z.infer<typeof requestSchema>;
  try {
    const body = await request.text();
    if (body.length > 1000)
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    input = requestSchema.parse(JSON.parse(body));
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const household = seed().find((item) => item.id === input.householdId);
  const result =
    household &&
    evaluate(household).find((item) => item.program.id === input.programId);
  if (!result)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ip =
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  try {
    const explanation = await explainWithClaude({
      ip,
      program: result.program.name,
      outcome: result.outcome,
      reason: result.reason,
      threshold: result.threshold ?? 0,
      savings: result.savings,
    });
    return NextResponse.json(explanation, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof UsageLimitError)
      return NextResponse.json(
        { error: "Request limit reached" },
        { status: 429 },
      );
    if (error instanceof ServiceUnavailableError)
      return NextResponse.json(
        { error: "Explanation unavailable" },
        { status: 503 },
      );
    return NextResponse.json(
      { error: "Explanation unavailable" },
      { status: 502 },
    );
  }
}
