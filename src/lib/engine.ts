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
export type Result = {
  program: (typeof programs)[number];
  outcome: Outcome;
  reason: string;
  savings: number;
  threshold?: number;
};
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
export function evaluate(h: Household): Result[] {
  const missing = h.income === null;
  const qualifies = (limit: number): Outcome =>
    missing ? "needs_info" : h.income! <= limit ? "eligible" : "ineligible";
  const resident = (value: Outcome): Outcome =>
    h.resident ? value : "ineligible";
  const liheap = resident(qualifies(smi(h.size)));
  const discount = resident(h.utility !== "capitol" ? "ineligible" : liheap);
  const repair = resident(
    h.tenure !== "owner" || !h.deferrals.length
      ? "ineligible"
      : qualifies(ami(h.size)),
  );
  const wapBase = resident(qualifies(Math.max(fpg(h.size) * 2, smi(h.size))));
  const wap =
    wapBase === "eligible" && h.deferrals.length ? "deferred" : wapBase;
  const efficiency = resident(
    h.benefits.some((b) =>
      ["SSI", "LIHEAP", "CRIAC_CAP", "LRP", "UTILITY_DISCOUNT"].includes(b),
    )
      ? "eligible"
      : qualifies(ami(h.size)),
  );
  const solar = resident(
    h.utility !== "capitol"
      ? "ineligible"
      : h.certified
        ? "eligible"
        : qualifies(ami(h.size)),
  );
  const outcomes: Outcome[] = [
    liheap,
    discount,
    repair,
    wap,
    efficiency,
    solar,
  ];
  const thresholds = [
    smi(h.size),
    smi(h.size),
    ami(h.size),
    Math.max(fpg(h.size) * 2, smi(h.size)),
    ami(h.size),
    ami(h.size),
  ];
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
  return Array.from({ length: 240 }, (_, i) => {
    const size = 1 + Math.floor(rand() * 6),
      income = Math.round((14000 + rand() * 125000) / 10) * 10;
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
    const annualElectric = 950 + Math.round(rand() * 1500),
      annualEnergy = annualElectric + Math.round(rand() * 1100);
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
      tract: `1100100${String(100 + Math.floor(rand() * 90)).slice(-3)}`,
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
