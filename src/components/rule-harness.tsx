"use client";
import { useMemo, useState } from "react";
import CheckList from "@/components/check-list";
import {
  ami,
  categoricalBenefits,
  evaluate,
  fpg,
  money,
  seed,
  smi,
  type Household,
} from "@/lib/engine";

const deferralOptions = ["roof_leak", "mold", "knob_and_tube", "structural"];
const benefitOptions = ["SNAP", "TANF", ...categoricalBenefits];

type Facts = Pick<
  Household,
  | "size"
  | "income"
  | "tenure"
  | "resident"
  | "benefits"
  | "deferrals"
  | "certified"
>;

const blank: Facts = {
  size: 4,
  income: 60000,
  tenure: "renter",
  resident: true,
  benefits: [],
  deferrals: [],
  certified: false,
};

export const goldenCases: { name: string; facts: Facts }[] = [
  { name: "A · Family of 4, $60,000, renter", facts: blank },
  {
    name: "B · Single owner, $70,000, roof leak",
    facts: { ...blank, size: 1, income: 70000, tenure: "owner", deferrals: ["roof_leak"] },
  },
  {
    name: "C · Couple, $110,000, receives SSI",
    facts: { ...blank, size: 2, income: 110000, benefits: ["SSI"] },
  },
  { name: "D · Income missing", facts: { ...blank, size: 3, income: null } },
  {
    name: "G · Owner with mold, $50,000",
    facts: { ...blank, income: 50000, tenure: "owner", deferrals: ["mold"] },
  },
  {
    name: "H · $140,000, LIHEAP certified",
    facts: { ...blank, income: 140000, certified: true },
  },
  { name: "F · Lives outside DC", facts: { ...blank, income: 30000, resident: false } },
];

const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

export default function RuleHarness() {
  const [facts, setFacts] = useState<Facts>(blank);
  const template = useMemo(() => seed()[0], []);
  const results = evaluate({ ...template, ...facts, utility: "capitol" });
  const set = (patch: Partial<Facts>) => setFacts((f) => ({ ...f, ...patch }));

  return (
    <div className="harness">
      <form className="card harness-form" onSubmit={(e) => e.preventDefault()}>
        <label>
          Load a test case
          <select
            onChange={(e) => {
              const found = goldenCases.find((c) => c.name === e.target.value);
              if (found) setFacts(found.facts);
            }}
            defaultValue=""
          >
            <option value="" disabled>
              Choose…
            </option>
            {goldenCases.map((c) => (
              <option key={c.name}>{c.name}</option>
            ))}
          </select>
        </label>
        <label>
          Household size
          <input
            type="number"
            min={1}
            max={12}
            value={facts.size}
            onChange={(e) =>
              set({ size: Math.min(12, Math.max(1, Number(e.target.value) || 1)) })
            }
          />
        </label>
        <label>
          Annual income
          <input
            type="number"
            min={0}
            step={500}
            disabled={facts.income === null}
            value={facts.income ?? ""}
            onChange={(e) => set({ income: Math.max(0, Number(e.target.value) || 0) })}
          />
        </label>
        <label className="inline">
          <input
            type="checkbox"
            checked={facts.income === null}
            onChange={(e) => set({ income: e.target.checked ? null : 45000 })}
          />
          Income not yet provided
        </label>
        <label>
          Tenure
          <select
            value={facts.tenure}
            onChange={(e) => set({ tenure: e.target.value as Facts["tenure"] })}
          >
            <option value="renter">Renter</option>
            <option value="owner">Owner</option>
          </select>
        </label>
        <label className="inline">
          <input
            type="checkbox"
            checked={facts.resident}
            onChange={(e) => set({ resident: e.target.checked })}
          />
          Lives in the District
        </label>
        <label className="inline">
          <input
            type="checkbox"
            checked={facts.certified}
            onChange={(e) => set({ certified: e.target.checked })}
          />
          LIHEAP certified in the last 12 months
        </label>
        <fieldset>
          <legend>Benefits received</legend>
          {benefitOptions.map((b) => (
            <label className="chip" key={b}>
              <input
                type="checkbox"
                checked={facts.benefits.includes(b)}
                onChange={() => set({ benefits: toggle(facts.benefits, b) })}
              />
              {b.replaceAll("_", " ")}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Home conditions</legend>
          {deferralOptions.map((d) => (
            <label className="chip" key={d}>
              <input
                type="checkbox"
                checked={facts.deferrals.includes(d)}
                onChange={() => set({ deferrals: toggle(facts.deferrals, d) })}
              />
              {d.replaceAll("_", " ")}
            </label>
          ))}
        </fieldset>
        <div className="limits">
          <span>200% FPG {money(fpg(facts.size) * 2)}</span>
          <span>60% SMI {money(smi(facts.size))}</span>
          <span>80% AMI {money(ami(facts.size))}</span>
        </div>
      </form>
      <div className="cards">
        {results.map((r) => (
          <article className="card" key={r.program.id}>
            <div className="row">
              <div>
                <small>{r.program.stage.toUpperCase()}</small>
                <h3>{r.program.name}</h3>
              </div>
              <span className={"badge " + r.outcome}>{r.outcome.replace("_", " ")}</span>
            </div>
            {r.assumption && <span className="assumption">Modeled assumption</span>}
            <CheckList checks={r.checks} />
          </article>
        ))}
      </div>
    </div>
  );
}
