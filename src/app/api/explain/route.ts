import { NextResponse } from "next/server";
import { z } from "zod";
import { categoricalBenefits, evaluate, programs, seed } from "@/lib/engine";
import { errorType, explainWithClaude, ruleSummary, UsageLimitError } from "@/server/claude";
import { clientIp, readCapped, sameOrigin } from "@/server/request";

const benefit = z.enum(["SNAP", "TANF", ...categoricalBenefits]);
const requestSchema = z.object({
  programId: z.enum(programs.map((p) => p.id) as [string, ...string[]]),
  household: z.object({
    size: z.number().int().min(1).max(12),
    income: z.number().int().min(0).max(1_000_000).nullable(),
    tenure: z.enum(["owner", "renter"]),
    resident: z.boolean(),
    utility: z.string().max(20),
    benefits: z.array(benefit).max(8),
    deferrals: z.array(z.enum(["roof_leak", "mold", "knob_and_tube", "structural"])).max(4),
    certified: z.boolean(),
    annualEnergy: z.number().min(0).max(50_000),
    annualElectric: z.number().min(0).max(50_000),
  }),
});

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Forbidden" }, 403);
  const body = await readCapped(request, 2000);
  if (body === null) return json({ error: "Request too large" }, 413);
  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(JSON.parse(body));
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  // The server re-runs the rules itself; the client never supplies an outcome.
  const result = evaluate({ ...seed()[0], ...input.household }).find(
    (item) => item.program.id === input.programId,
  );
  if (!result) return json({ error: "Not found" }, 404);
  try {
    const explanation = await explainWithClaude({
      ip: clientIp(request),
      program: result.program.name,
      outcome: result.outcome,
      checks: result.checks,
      savings: result.savings,
    });
    return json(explanation);
  } catch (error) {
    if (error instanceof UsageLimitError) return json({ error: "Request limit reached" }, 429);
    console.warn("explain_fallback", { errorType: errorType(error) });
    return json(ruleSummary(result.checks));
  }
}
