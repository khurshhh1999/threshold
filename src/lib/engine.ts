import tractData from "../data/generated/dc-tract-stats.json";

export type Household = {
  id: string;
  name: string;
  size: number;
  income: number | null;
  tenure: "owner" | "renter";
  resident: boolean;
  utility: string;
  benefits: string[];
  deferrals: string[];
  certified: boolean;
  annualEnergy: number;
  annualElectric: number;
  tract: string;
  zip: string;
  status: string;
  verified: boolean;
  created: string;
  provenance?: Record<string, { source: string; confidence: number; evidence: string }>;
};
export const programs = [
  {
    id: "dc-liheap",
    name: "Energy Bill Assistance",
    short: "LIHEAP",
    stage: "Immediate",
  },
  {
    id: "utility-discount",
    name: "Utility Bill Discount",
    short: "Bill discount",
    stage: "Immediate",
  },
  {
    id: "home-repair",
    name: "Pre-Weatherization Home Repair",
    short: "Home repair",
    stage: "Repair",
  },
  {
    id: "dc-wap",
    name: "Weatherization Assistance",
    short: "Weatherization",
    stage: "Weatherization",
  },
  {
    id: "dcseu-iq",
    name: "Income-Qualified Efficiency Upgrades",
    short: "Efficiency",
    stage: "Efficiency",
  },
  {
    id: "dc-solar-for-all",
    name: "Community Solar",
    short: "Solar",
    stage: "Solar",
  },
] as const;
export type Outcome = "eligible" | "ineligible" | "needs_info" | "deferred";
export type Check = { label: string; pass: boolean | null };
export type Result = {
  program: (typeof programs)[number];
  outcome: Outcome;
  reason: string;
  savings: number;
  threshold?: number;
  checks: Check[];
  assumption?: boolean;
};
export const categoricalBenefits = [
  "SSI",
  "LIHEAP",
  "CRIAC_CAP",
  "LRP",
  "UTILITY_DISCOUNT",
] as const;
export function fpg(size: number) {
  return 15960 + Math.max(0, size - 1) * 5680;
}
export function smi(size: number) {
  return Math.round(
    121200 *
      (size <= 6
        ? [0, 0.52, 0.68, 0.84, 1, 1.16, 1.32][size]
        : 1.32 + 0.03 * (size - 6)),
  );
}
export function ami(size: number) {
  return (
    Math.ceil(
      (131100 *
        (size <= 4 ? [0.0, 0.7, 0.8, 0.9, 1][size] : 1 + 0.1 * (size - 4))) /
        50,
    ) * 50
  );
}
const tri = (checks: Check[], mode: "all" | "any"): boolean | null => {
  const values = checks.map((c) => c.pass);
  if (mode === "all") {
    if (values.includes(false)) return false;
    return values.includes(null) ? null : true;
  }
  if (values.includes(true)) return true;
  return values.includes(null) ? null : false;
};
const toOutcome = (value: boolean | null): Outcome =>
  value === null ? "needs_info" : value ? "eligible" : "ineligible";

export function evaluate(h: Household): Result[] {
  const people = `${h.size} ${h.size === 1 ? "person" : "people"}`;
  const incomeCheck = (limit: number, name: string): Check => ({
    label:
      h.income === null
        ? `Annual income is missing (limit ${money(limit)}, ${name} for ${people})`
        : `Annual income ${money(h.income)} ≤ ${money(limit)} (${name} for ${people})`,
    pass: h.income === null ? null : h.income <= limit,
  });
  const resident: Check = { label: "Lives in the District", pass: h.resident };
  const utility: Check = {
    label: "Electric customer of Capitol Light & Power",
    pass: h.utility === "capitol",
  };
  const smiLimit = smi(h.size);
  const amiLimit = ami(h.size);
  const wapLimit = Math.max(fpg(h.size) * 2, smiLimit);
  const hasDeferral: Check = {
    label: h.deferrals.length
      ? `Home condition needs repair: ${h.deferrals.join(", ").replaceAll("_", " ")}`
      : "No home condition needing repair",
    pass: h.deferrals.length > 0,
  };

  const liheapChecks = [resident, incomeCheck(smiLimit, "60% SMI")];
  const liheap = toOutcome(tri(liheapChecks, "all"));

  const discountChecks: Check[] = [
    resident,
    utility,
    { label: "Eligible for Energy Bill Assistance", pass: liheap === "needs_info" ? null : liheap === "eligible" },
  ];
  const discount = toOutcome(tri(discountChecks, "all"));

  const repairChecks: Check[] = [
    resident,
    { label: `Owns the home (${h.tenure})`, pass: h.tenure === "owner" },
    hasDeferral,
    incomeCheck(amiLimit, "80% AMI"),
  ];
  const repair = toOutcome(tri(repairChecks, "all"));

  const wapIncome = incomeCheck(
    wapLimit,
    wapLimit === smiLimit ? "greater of 200% FPG and 60% SMI" : "200% FPG",
  );
  const wapChecks: Check[] = [resident, wapIncome];
  const wapBase = toOutcome(tri(wapChecks, "all"));
  const wap: Outcome =
    wapBase === "eligible" && h.deferrals.length ? "deferred" : wapBase;
  if (wapBase === "eligible")
    wapChecks.push({
      label: h.deferrals.length
        ? "Gate: repairs must be completed first"
        : "Gate: no health and safety repairs pending",
      pass: !h.deferrals.length,
    });

  const benefitsHeld = h.benefits.filter((b) =>
    (categoricalBenefits as readonly string[]).includes(b),
  );
  const efficiencyPath: Check[] = [
    incomeCheck(amiLimit, "80% AMI"),
    {
      label: benefitsHeld.length
        ? `Receives a qualifying benefit (${benefitsHeld.join(", ")})`
        : "Receives a qualifying benefit (SSI, LIHEAP, CRIAC CAP, LRP, utility discount)",
      pass: benefitsHeld.length > 0,
    },
  ];
  const efficiencyChecks: Check[] = [
    resident,
    { label: "Either income or benefit path is met", pass: tri(efficiencyPath, "any") },
    ...efficiencyPath.map((c) => ({ ...c, label: "  · " + c.label })),
  ];
  const efficiency = toOutcome(tri(efficiencyChecks.slice(0, 2), "all"));

  const solarPath: Check[] = [
    incomeCheck(amiLimit, "80% AMI"),
    {
      label: "LIHEAP certified within the past 12 months",
      pass: h.certified,
    },
  ];
  const solarChecks: Check[] = [
    resident,
    utility,
    { label: "Either income or LIHEAP path is met", pass: tri(solarPath, "any") },
    ...solarPath.map((c) => ({ ...c, label: "  · " + c.label })),
  ];
  const solar = toOutcome(tri(solarChecks.slice(0, 3), "all"));

  const outcomes: Outcome[] = [liheap, discount, repair, wap, efficiency, solar];
  const checks = [liheapChecks, discountChecks, repairChecks, wapChecks, efficiencyChecks, solarChecks];
  const thresholds = [smiLimit, smiLimit, amiLimit, wapLimit, amiLimit, amiLimit];
  const savings = [
    Math.min(1800, Math.max(250, Math.round(h.annualEnergy * 0.35))),
    Math.round(h.annualElectric * 0.25),
    0,
    Math.round(h.annualEnergy * 0.12),
    Math.round(h.annualEnergy * 0.08),
    Math.round(h.annualElectric * 0.5),
  ];
  return programs.map((program, i) => ({
    program,
    outcome: outcomes[i],
    threshold: thresholds[i],
    checks: checks[i],
    assumption: program.id === "utility-discount" || program.id === "home-repair",
    savings: outcomes[i] === "eligible" ? savings[i] : 0,
    reason:
      outcomes[i] === "deferred"
        ? "Health and safety repairs must be completed before weatherization."
        : outcomes[i] === "needs_info"
          ? "Annual income is needed to make this determination."
          : outcomes[i] === "eligible"
            ? `The available facts satisfy this program’s rules. Income limit: ${money(thresholds[i])}.`
            : `The available facts do not satisfy every rule. Income limit: ${money(thresholds[i])}.`,
  }));
}
export const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
export function seed(): Household[] {
  let x = 20261109;
  const rand = () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
  const first = [
    "Avery",
    "Jordan",
    "Morgan",
    "Taylor",
    "Casey",
    "Riley",
    "Drew",
    "Cameron",
    "Quinn",
    "Alex",
    "Jamie",
    "Sam",
  ];
  const last = [
    "Cole",
    "Reed",
    "Brooks",
    "Morgan",
    "Hayes",
    "Price",
    "Turner",
    "Bennett",
    "Parker",
    "Diaz",
    "Rivera",
    "Kim",
  ];
  const zips = [
    "20001",
    "20002",
    "20003",
    "20009",
    "20010",
    "20011",
    "20019",
    "20020",
    "20032",
  ];
  const tractEntries = Object.entries(tractData.tracts).filter(
    ([, tract]) => tract.lowIncomeUnits > 0,
  );
  const totalTractWeight = tractEntries.reduce(
    (sum, [, tract]) => sum + tract.lowIncomeUnits,
    0,
  );
  const chooseWeighted = <T>(items: T[], weight: (item: T) => number): T => {
    const total = items.reduce((sum, item) => sum + weight(item), 0);
    let pick = rand() * total;
    for (const item of items) {
      pick -= weight(item);
      if (pick < 0) return item;
    }
    return items[items.length - 1];
  };
  return Array.from({ length: 240 }, (_, i) => {
    const [tractId, tract] = chooseWeighted(
      tractEntries,
      ([, item]) => item.lowIncomeUnits / totalTractWeight,
    );
    const bracketEntries = ["b0_30", "b30_60", "b60_80", "b80_100"]
      .map((key) => tract.brackets[key as keyof typeof tract.brackets])
      .filter(
        (item): item is NonNullable<typeof item> => !!item && item.units > 0,
      );
    const bracket = chooseWeighted(bracketEntries, (item) => item.units);
    const sizePick = rand();
    const size =
      sizePick < 0.3
        ? 1
        : sizePick < 0.55
          ? 2
          : sizePick < 0.73
            ? 3
            : sizePick < 0.87
              ? 4
              : sizePick < 0.95
                ? 5
                : 6;
    const sizeMultiplier = [0, 0.75, 0.9, 1, 1.1, 1.15, 1.2][size];
    const income =
      Math.round(
        (bracket.avgIncome * (0.8 + rand() * 0.4) * sizeMultiplier) / 10,
      ) * 10;
    const tenure = rand() < 0.65 ? "renter" : "owner";
    const deferrals =
      tenure === "owner" && rand() < 0.18
        ? [
            ["roof_leak", "mold", "knob_and_tube", "structural"][
              Math.floor(rand() * 4)
            ],
          ]
        : [];
    const benefits = income < fpg(size) * 1.3 && rand() < 0.6 ? ["SNAP"] : [];
    if (income < smi(size) && rand() < 0.35) benefits.push("LIHEAP");
    const annualElectric = Math.round(bracket.avgElec * (0.85 + rand() * 0.3));
    const annualGas = Math.round(bracket.avgGas * (0.85 + rand() * 0.3));
    const annualOther = Math.round(bracket.avgOther * (0.85 + rand() * 0.3));
    const annualEnergy = annualElectric + annualGas + annualOther;
    return {
      id: `HH-${String(i + 1).padStart(4, "0")}`,
      name: `${first[Math.floor(rand() * first.length)]} ${last[Math.floor(rand() * last.length)]}`,
      size,
      income,
      tenure,
      resident: true,
      utility: "capitol",
      benefits,
      deferrals,
      certified: benefits.includes("LIHEAP"),
      annualEnergy,
      annualElectric,
      tract: tractId,
      zip: zips[Math.floor(rand() * zips.length)],
      status: [
        "not_contacted",
        "screened",
        "docs_verified",
        "submitted",
        "approved",
        "active",
      ][Math.floor(rand() * 6)],
      verified: rand() < 0.7,
      created: new Date(
        Date.UTC(2026, 10, 9 - Math.floor(rand() * 120)),
      ).toISOString(),
    };
  });
}
