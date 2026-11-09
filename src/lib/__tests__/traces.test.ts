import { describe, expect, it } from "vitest";
import { evaluate, seed, type Household } from "../engine";
import { annualize, extractionSchema, sniffImage, toPrefill } from "../extraction";
import { nextEntry, verifyChain, type AuditEntry } from "../audit-chain";

const base: Household = {
  ...seed()[0],
  size: 4,
  income: 60000,
  tenure: "renter",
  resident: true,
  utility: "capitol",
  benefits: [],
  deferrals: [],
  certified: false,
};
const byId = (h: Household) => Object.fromEntries(evaluate(h).map((r) => [r.program.id, r]));

describe("rule traces", () => {
  it("explains every decision with labelled checks", () => {
    for (const result of evaluate(base)) {
      expect(result.checks.length).toBeGreaterThan(0);
      expect(result.checks.every((c) => c.label.length > 0)).toBe(true);
    }
    const liheap = byId(base)["dc-liheap"];
    expect(liheap.checks[1]).toEqual({
      label: "Annual income $60,000 ≤ $121,200 (60% SMI for 4 people)",
      pass: true,
    });
  });

  it("marks missing income as unknown rather than failed", () => {
    const liheap = byId({ ...base, income: null })["dc-liheap"];
    expect(liheap.outcome).toBe("needs_info");
    expect(liheap.checks.some((c) => c.pass === null)).toBe(true);
  });

  it("shows the categorical path that made a household eligible", () => {
    const eff = byId({ ...base, income: 200000, benefits: ["SSI"] })["dcseu-iq"];
    expect(eff.outcome).toBe("eligible");
    expect(eff.checks.find((c) => c.label.includes("qualifying benefit"))?.pass).toBe(true);
  });

  it("records the pre-weatherization gate", () => {
    const wap = byId({ ...base, income: 50000, tenure: "owner", deferrals: ["mold"] })["dc-wap"];
    expect(wap.outcome).toBe("deferred");
    expect(wap.checks.at(-1)).toEqual({ label: "Gate: repairs must be completed first", pass: false });
  });

  it("flags modeled programs as assumptions", () => {
    const flagged = evaluate(base).filter((r) => r.assumption).map((r) => r.program.id);
    expect(flagged.sort()).toEqual(["home-repair", "utility-discount"]);
  });
});

describe("document extraction mapping", () => {
  it("annualizes pay by frequency", () => {
    expect(annualize(1000, "weekly")).toBe(52000);
    expect(annualize(1000, "biweekly")).toBe(26000);
    expect(annualize(1000, "semimonthly")).toBe(24000);
    expect(annualize(1000, "monthly")).toBe(12000);
  });

  it("turns a pay stub into income with the weaker confidence", () => {
    const x = extractionSchema.parse({
      documentKind: "pay_stub",
      fullName: { value: "Avery Cole", confidence: 0.98, evidence: "Employee Avery Cole" },
      grossPay: { value: 1850, confidence: 0.95, evidence: "Gross pay this period $1,850.00" },
      payFrequency: { value: "biweekly", confidence: 0.7, evidence: "Pay frequency Biweekly" },
      warnings: [],
    });
    const p = toPrefill(x);
    expect(p.income).toBe(48100);
    expect(p.name).toBe("Avery Cole");
    expect(p.provenance.income.confidence).toBe(0.7);
  });

  it("maps a benefit letter to a categorical benefit", () => {
    const p = toPrefill(
      extractionSchema.parse({
        documentKind: "benefit_letter",
        benefitProgram: { value: "SSI", confidence: 0.9, evidence: "Program SSI" },
        householdSize: { value: 3, confidence: 0.9, evidence: "Household size 3" },
        warnings: [],
      }),
    );
    expect(p.benefits).toEqual(["SSI"]);
    expect(p.size).toBe(3);
    expect(p.income).toBeUndefined();
  });

  it("rejects malformed model output", () => {
    expect(
      extractionSchema.safeParse({ documentKind: "pay_stub", zip: { value: "2000", confidence: 1, evidence: "" }, warnings: [] }).success,
    ).toBe(false);
  });

  it("accepts only PNG and JPEG by magic bytes", () => {
    expect(sniffImage("iVBORw0KGgoAAAANSUhEUg")).toBe("image/png");
    expect(sniffImage("/9j/4AAQSkZJRgABAQ")).toBe("image/jpeg");
    expect(sniffImage(Buffer.from("<svg onload=alert(1)>").toString("base64"))).toBeNull();
  });
});

describe("hash-chained activity log", () => {
  async function chain(n: number) {
    const out: AuditEntry[] = [];
    for (let i = 0; i < n; i++)
      out.push(await nextEntry(out.at(-1), { role: "caseworker", action: "a", entity: `HH-000${i}`, detail: "d" }));
    return out;
  }
  it("verifies an untouched chain", async () => {
    expect(await verifyChain(await chain(5))).toEqual({ ok: true, checked: 5 });
  });
  it("detects an edited entry", async () => {
    const entries = await chain(5);
    entries[2] = { ...entries[2], detail: "changed" };
    expect(await verifyChain(entries)).toMatchObject({ ok: false, brokenAt: 3 });
  });
  it("detects a deleted entry", async () => {
    const entries = await chain(5);
    entries.splice(1, 1);
    expect(await verifyChain(entries)).toMatchObject({ ok: false, brokenAt: 3 });
  });
});
