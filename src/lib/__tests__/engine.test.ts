import { describe, expect, it } from "vitest";
import { ami, evaluate, fpg, seed, smi, type Household } from "../engine";
import geometry from "../../data/generated/dc-tracts.geo.json";
import statistics from "../../data/generated/dc-tract-stats.json";

const base = seed()[0];

describe("DC map data", () => {
  it("joins every displayed tract and locates every seeded household", () => {
    const tracts = statistics.tracts as Record<
      string,
      { lowIncomeUnits: number }
    >;
    expect(geometry.features.length).toBeGreaterThan(200);
    expect(
      geometry.features.every((feature) => !!tracts[feature.properties.geoid]),
    ).toBe(true);
    const households = seed();
    expect(households).toHaveLength(240);
    expect(
      households.every(
        (household) => tracts[household.tract]?.lowIncomeUnits > 0,
      ),
    ).toBe(true);
    expect(seed()).toEqual(households);
  });
});
function check(changes: Partial<Household>) {
  const household: Household = {
    ...base,
    size: 4,
    income: 60000,
    tenure: "renter",
    resident: true,
    utility: "capitol",
    benefits: [],
    deferrals: [],
    certified: false,
    ...changes,
  };
  return Object.fromEntries(
    evaluate(household).map((result) => [result.program.id, result.outcome]),
  );
}

describe("income tables", () => {
  it("matches the published values for household sizes 1 through 9", () => {
    expect(Array.from({ length: 9 }, (_, i) => fpg(i + 1))).toEqual([
      15960, 21640, 27320, 33000, 38680, 44360, 50040, 55720, 61400,
    ]);
    expect(Array.from({ length: 9 }, (_, i) => smi(i + 1))).toEqual([
      63024, 82416, 101808, 121200, 140592, 159984, 163620, 167256, 170892,
    ]);
    expect(Array.from({ length: 9 }, (_, i) => ami(i + 1))).toEqual([
      91800, 104900, 118000, 131100, 144250, 157350, 170450, 183550, 196650,
    ]);
  });
});

describe("eligibility examples", () => {
  it("A: common low-income renter", () =>
    expect(check({})).toMatchObject({
      "dc-liheap": "eligible",
      "dc-solar-for-all": "eligible",
      "dc-wap": "eligible",
      "dcseu-iq": "eligible",
      "utility-discount": "eligible",
      "home-repair": "ineligible",
    }));
  it("B: owner with roof repair", () =>
    expect(
      check({
        size: 1,
        income: 70000,
        tenure: "owner",
        deferrals: ["roof_leak"],
      }),
    ).toMatchObject({
      "dc-liheap": "ineligible",
      "dc-solar-for-all": "eligible",
      "dc-wap": "ineligible",
      "dcseu-iq": "eligible",
      "utility-discount": "ineligible",
      "home-repair": "eligible",
    }));
  it("C: SSI benefit qualifies for efficiency", () =>
    expect(check({ size: 2, income: 110000, benefits: ["SSI"] })).toMatchObject(
      {
        "dc-liheap": "ineligible",
        "dc-solar-for-all": "ineligible",
        "dc-wap": "ineligible",
        "dcseu-iq": "eligible",
      },
    ));
  it("D: missing income needs information", () =>
    expect(check({ size: 3, income: null })).toMatchObject({
      "dc-liheap": "needs_info",
      "dc-solar-for-all": "needs_info",
      "dc-wap": "needs_info",
      "dcseu-iq": "needs_info",
      "utility-discount": "needs_info",
      "home-repair": "ineligible",
    }));
  it("D2: SSI resolves efficiency despite missing income", () =>
    expect(
      check({ size: 3, income: null, benefits: ["SSI"] })["dcseu-iq"],
    ).toBe("eligible"));
  it("E: household size nine uses extended tables", () =>
    expect(check({ size: 9, income: 170000 })).toMatchObject({
      "dc-liheap": "eligible",
      "dc-solar-for-all": "eligible",
      "dc-wap": "eligible",
    }));
  it("F: nonresident does not qualify", () =>
    expect(
      Object.values(check({ resident: false })).every(
        (value) => value === "ineligible",
      ),
    ).toBe(true));
  it("G: repair defers weatherization", () =>
    expect(
      check({ income: 50000, tenure: "owner", deferrals: ["mold"] }),
    ).toMatchObject({
      "dc-wap": "deferred",
      "home-repair": "eligible",
      "dc-liheap": "eligible",
    }));
  it("H: recent LIHEAP certification qualifies for solar", () =>
    expect(check({ income: 140000, certified: true })).toMatchObject({
      "dc-solar-for-all": "eligible",
      "dc-liheap": "ineligible",
      "dcseu-iq": "ineligible",
    }));
  it("I: weatherization uses higher SMI threshold", () =>
    expect(check({ size: 6, income: 100000, tenure: "owner" })["dc-wap"]).toBe(
      "eligible",
    ));
});
