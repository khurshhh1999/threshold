import { evaluate, money, type Household } from "@/lib/engine";

export function PassportNotFound() {
  return (
    <main className="passport">
      <h1>Passport not found</h1>
    </main>
  );
}

export default function PassportView({ household }: { household: Household }) {
  const results = evaluate(household).filter(
    (r) => r.outcome === "eligible" || r.outcome === "deferred",
  );
  return (
    <main className="passport">
      <div className="eyebrow">THRESHOLD · HOUSEHOLD PASSPORT</div>
      <h1>Your energy options</h1>
      <p>
        {household.name.split(" ")[0]}, these programs may fit your household
        based on the information available.
      </p>
      {results.map((r) => (
        <article className="card" key={r.program.id}>
          <div className="row">
            <h2>{r.program.name}</h2>
            <span className={"badge " + r.outcome}>{r.outcome}</span>
          </div>
          <p>{r.reason}</p>
          {r.savings > 0 && (
            <strong>Modeled annual savings: {money(r.savings)}</strong>
          )}
        </article>
      ))}
      <p className="muted">
        Program staff must verify all facts before enrollment. Savings are
        modeled estimates.
      </p>
      <footer>
        Independent prototype. Not affiliated with any agency, utility, or
        nonprofit named here. All household records are synthetic.
      </footer>
    </main>
  );
}
