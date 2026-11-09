import { z } from "zod";

export const payFrequencies = [
  "weekly",
  "biweekly",
  "semimonthly",
  "monthly",
  "annual",
] as const;
export type PayFrequency = (typeof payFrequencies)[number];

const periodsPerYear: Record<PayFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
  annual: 1,
};

export function annualize(amount: number, frequency: PayFrequency) {
  return Math.round(amount * periodsPerYear[frequency]);
}

const confidence = z.number().min(0).max(1);
const field = <T extends z.ZodTypeAny>(value: T) =>
  z.object({ value, confidence, evidence: z.string().max(160) }).optional();

/** Shape Claude must return through the record_extraction tool. */
export const extractionSchema = z.object({
  documentKind: z.enum(["utility_bill", "pay_stub", "benefit_letter", "unknown"]),
  fullName: field(z.string().max(80)),
  addressLine: field(z.string().max(120)),
  zip: field(z.string().regex(/^\d{5}$/)),
  householdSize: field(z.number().int().min(1).max(12)),
  grossPay: field(z.number().min(0).max(1_000_000)),
  payFrequency: field(z.enum(payFrequencies)),
  benefitProgram: field(z.enum(["SNAP", "TANF", "SSI", "LIHEAP", "OTHER"])),
  monthlyBenefit: field(z.number().min(0).max(100_000)),
  amountDue: field(z.number().min(0).max(100_000)),
  warnings: z.array(z.string().max(200)).max(10),
});
export type Extraction = z.infer<typeof extractionSchema>;

export type Prefill = {
  name?: string;
  zip?: string;
  size?: number;
  income?: number;
  benefits: string[];
  provenance: Record<string, { source: string; confidence: number; evidence: string }>;
};

/** Deterministic mapping from extracted fields to household facts. */
export function toPrefill(x: Extraction): Prefill {
  const out: Prefill = { benefits: [], provenance: {} };
  const note = (fact: string, c: number, evidence: string) => {
    out.provenance[fact] = { source: x.documentKind, confidence: c, evidence };
  };
  if (x.fullName) {
    out.name = x.fullName.value;
    note("name", x.fullName.confidence, x.fullName.evidence);
  }
  if (x.zip) {
    out.zip = x.zip.value;
    note("zip", x.zip.confidence, x.zip.evidence);
  }
  if (x.householdSize) {
    out.size = x.householdSize.value;
    note("size", x.householdSize.confidence, x.householdSize.evidence);
  }
  if (x.grossPay && x.payFrequency) {
    out.income = annualize(x.grossPay.value, x.payFrequency.value);
    note(
      "income",
      Math.min(x.grossPay.confidence, x.payFrequency.confidence),
      `${x.grossPay.evidence} · ${x.payFrequency.value}`,
    );
  }
  if (x.benefitProgram && x.benefitProgram.value !== "OTHER") {
    out.benefits.push(x.benefitProgram.value);
    note("benefits", x.benefitProgram.confidence, x.benefitProgram.evidence);
  }
  return out;
}

/** Strict base64 image check by magic bytes (PNG or JPEG only). */
export function sniffImage(base64: string): "image/png" | "image/jpeg" | null {
  const head = Buffer.from(base64.slice(0, 16), "base64");
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47)
    return "image/png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  return null;
}
