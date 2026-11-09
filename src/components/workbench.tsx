"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DCMap from "@/components/dc-map";
import { usePathname, useRouter } from "next/navigation";
import {
  ClipboardList,
  FilePlus2,
  House,
  LayoutDashboard,
  Map,
  ScrollText,
  Settings2,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import {
  DashboardShell,
  DashboardButton,
  DashboardFilterMenu,
} from "@/components/block/dashboard-shell";
import { seed, evaluate, programs, money, type Household } from "@/lib/engine";

type Audit = { at: string; action: string; entity: string; detail: string };
const nav = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, href: "/app" },
  { id: "map", label: "Energy map", icon: Map, href: "/app/map" },
  {
    id: "households",
    label: "Households",
    icon: House,
    href: "/app/households",
  },
  { id: "intake", label: "Intake", icon: FilePlus2, href: "/app/intake" },
  { id: "pipeline", label: "Pipeline", icon: Workflow, href: "/app/pipeline" },
  {
    id: "rules",
    label: "Programs & rules",
    icon: ClipboardList,
    href: "/app/rules",
  },
  { id: "audit", label: "Activity", icon: ScrollText, href: "/app/audit" },
  { id: "settings", label: "Settings", icon: Settings2, href: "/app/settings" },
];
const badge = (s: string) => (
  <span className={"badge " + s}>{s.replaceAll("_", " ")}</span>
);
const download = (filename: string, body: string, type = "text/csv") => {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
export default function Workbench() {
  const path = usePathname(),
    router = useRouter(),
    parts = path.split("/").filter(Boolean),
    view = parts[1] || "overview",
    selectedId = parts[2];
  const [households, setHouseholds] = useState<Household[]>(() => seed()),
    [audit, setAudit] = useState<Audit[]>([]),
    [ready, setReady] = useState(false);
  const [explanations, setExplanations] = useState<Record<string, string>>({}),
    [explaining, setExplaining] = useState(""),
    [search, setSearch] = useState(""),
    [tractFilter, setTractFilter] = useState(""),
    [outcome, setOutcome] = useState("all"),
    [role, setRole] = useState("caseworker"),
    [program, setProgram] = useState<string>(programs[0].id),
    [tab, setTab] = useState("Eligibility");
  const [form, setForm] = useState({
      name: "",
      size: 2,
      income: 45000,
      tenure: "renter",
      zip: "20001",
    }),
    [notice, setNotice] = useState("");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("threshold-households-v2");
      const log = localStorage.getItem("threshold-activity");
      if (saved) setHouseholds(JSON.parse(saved));
      if (log) setAudit(JSON.parse(log));
      const savedRole = localStorage.getItem("threshold-role");
      if (savedRole) setRole(savedRole);
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    setTractFilter(
      new URLSearchParams(window.location.search).get("tract") || "",
    );
  }, [path]);
  useEffect(() => {
    if (ready)
      localStorage.setItem(
        "threshold-households-v2",
        JSON.stringify(households),
      );
  }, [households, ready]);
  useEffect(() => {
    if (ready)
      localStorage.setItem("threshold-activity", JSON.stringify(audit));
  }, [audit, ready]);
  const log = (action: string, entity: string, detail: string) =>
    setAudit((a) => [
      { at: new Date().toISOString(), action, entity, detail },
      ...a,
    ]);
  const update = (id: string, patch: Partial<Household>) => {
    if (role === "auditor") {
      setNotice("Auditor access is read only.");
      return;
    }
    setHouseholds((h) => h.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    log("household.updated", id, JSON.stringify(patch));
  };
  const selected = households.find((h) => h.id === selectedId);
  const explain = async (householdId: string, programId: string) => {
    setExplaining(programId);
    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId, programId }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Explanation unavailable");
      setExplanations((current) => ({ ...current, [programId]: data.text }));
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Explanation unavailable",
      );
    } finally {
      setExplaining("");
    }
  };
  const stats = useMemo(() => {
    const all = households.flatMap(evaluate);
    return {
      eligible: all.filter((x) => x.outcome === "eligible").length,
      gap: households.filter(
        (h) =>
          h.status === "not_contacted" &&
          evaluate(h).some((r) => r.outcome === "eligible"),
      ).length,
      savings: households
        .filter((h) => ["approved", "active"].includes(h.status))
        .reduce(
          (n, h) => n + evaluate(h).reduce((a, r) => a + r.savings, 0),
          0,
        ),
      verified:
        Math.round(
          (households.filter((h) => h.verified).length / households.length) *
            100,
        ) || 0,
    };
  }, [households]);
  const filtered = households.filter(
    (h) =>
      (h.id.toLowerCase().includes(search.toLowerCase()) ||
        h.name.toLowerCase().includes(search.toLowerCase())) &&
      (!tractFilter || h.tract === tractFilter) &&
      (outcome === "all" || evaluate(h).some((r) => r.outcome === outcome)),
  );
  const csv = () =>
    download(
      "threshold-households.csv",
      "Ref,Name,Size,Income,Tract,Status\n" +
        filtered
          .map((h) =>
            [h.id, h.name, h.size, h.income, h.tract, h.status].join(","),
          )
          .join("\n"),
    );
  const allowedViews =
    role === "auditor"
      ? ["overview", "households", "audit", "settings"]
      : role === "program_admin"
        ? [
            "overview",
            "map",
            "households",
            "pipeline",
            "rules",
            "audit",
            "settings",
          ]
        : [
            "overview",
            "map",
            "households",
            "intake",
            "pipeline",
            "rules",
            "settings",
          ];
  const visibleNav = nav.filter((item) => allowedViews.includes(item.id));
  const canView = allowedViews.includes(view);
  const name = selected
    ? selected.id
    : nav.find((n) => n.id === view)?.label || "Overview";
  return (
    <DashboardShell
      brand={{
        name: "Threshold",
        description: "DC ENERGY",
        logo: <span className="brand-mark">◈</span>,
      }}
      navigation={[
        {
          id: "workspace",
          title: "WORKSPACE",
          items: visibleNav.filter(
            (item) => !["audit", "settings"].includes(item.id),
          ),
        },
        {
          id: "system",
          title: "SYSTEM",
          items: visibleNav.filter((item) =>
            ["audit", "settings"].includes(item.id),
          ),
        },
      ]}
      activeItemId={
        canView && view === "households" && selected ? "households" : view
      }
      title={name}
      status="Sample data"
      statusTone="neutral"
      headerActions={
        <span className="role-pill">{role.replace("_", " ")}</span>
      }
      sidebarFooter={
        <div className="sidebar-note">
          <ShieldCheck size={16} /> Six program rules
          <br />
          <small>All records are synthetic</small>
        </div>
      }
      linkComponent={Link}
      className="workbench"
    >
      {notice && (
        <div className="notice" onClick={() => setNotice("")}>
          {notice} ×
        </div>
      )}
      {!canView && (
        <div className="card">
          <h2>View unavailable</h2>
          <p>This role cannot open this page.</p>
        </div>
      )}
      {canView && view === "overview" && (
        <>
          <div className="section-head">
            <div>
              <span className="eyebrow">OVERVIEW</span>
              <h2>Households and programs</h2>
              <p>240 sample households.</p>
            </div>
            <DashboardButton
              variant="primary"
              onClick={() => router.push("/app/households")}
            >
              Open queue ↗
            </DashboardButton>
          </div>
          <div className="kpis">
            <div className="card kpi">
              <span>HOUSEHOLDS</span>
              <strong>{households.length}</strong>
              <small>Sample records</small>
            </div>
            <div className="card kpi">
              <span>VERIFIED HOUSEHOLDS</span>
              <strong>{stats.verified}%</strong>
              <small>With verified facts</small>
            </div>
            <div className="card kpi">
              <span>NOT CONTACTED</span>
              <strong>{stats.gap}</strong>
              <small>Eligible for at least one program</small>
            </div>
            <div className="card kpi">
              <span>EST. ANNUAL SAVINGS</span>
              <strong>{money(stats.savings)}</strong>
              <small>For approved or active records</small>
            </div>
          </div>
          <div className="grid2">
            <div className="card">
              <h3>Eligible households by program</h3>
              <p className="muted">Number of households that meet each rule</p>
              {programs.map((p) => {
                const count = households.filter(
                  (h) =>
                    evaluate(h).find((r) => r.program.id === p.id)?.outcome ===
                    "eligible",
                ).length;
                return (
                  <div className="barrow" key={p.id}>
                    <span>{p.short}</span>
                    <div>
                      <i
                        style={{
                          width: `${(count / households.length) * 100}%`,
                        }}
                      />
                    </div>
                    <b>{count}</b>
                  </div>
                );
              })}
            </div>
            <div className="card">
              <h3>Enrollment stages</h3>
              <p className="muted">Stage recorded for each household</p>
              {[
                "not_contacted",
                "screened",
                "docs_verified",
                "submitted",
                "approved",
                "active",
              ].map((s) => (
                <div className="statrow" key={s}>
                  <span>{s.replaceAll("_", " ")}</span>
                  <b>{households.filter((h) => h.status === s).length}</b>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {canView && view === "households" && !selected && (
        <>
          <div className="section-head">
            <div>
              <span className="eyebrow">HOUSEHOLDS</span>
              <h2>Households</h2>
              <p>Search and filter sample households.</p>
            </div>
            <DashboardButton onClick={csv}>Export CSV ↓</DashboardButton>
          </div>
          <div className="toolbar">
            {tractFilter && (
              <button
                className="filter-chip"
                onClick={() => {
                  setTractFilter("");
                  router.replace("/app/households");
                }}
              >
                Tract {tractFilter} ×
              </button>
            )}
            <input
              placeholder="Search reference or name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <DashboardFilterMenu
              label="Outcome"
              value={outcome}
              onValueChange={setOutcome}
              options={[
                "all",
                "eligible",
                "deferred",
                "needs_info",
                "ineligible",
              ].map((x) => ({ value: x, label: x.replace("_", " ") }))}
            />
            <span className="muted">{filtered.length} households</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>REFERENCE</th>
                  <th>HOUSEHOLD</th>
                  <th>SIZE</th>
                  <th>INCOME</th>
                  <th>PROGRAMS</th>
                  <th>STAGE</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map((h) => (
                  <tr
                    key={h.id}
                    onClick={() => router.push("/app/households/" + h.id)}
                  >
                    <td>
                      <b>{h.id}</b>
                    </td>
                    <td>
                      {role === "auditor"
                        ? h.name.split(" ")[0] + " •••"
                        : h.name}
                    </td>
                    <td>{h.size}</td>
                    <td>{h.income === null ? "Missing" : money(h.income)}</td>
                    <td>
                      {
                        evaluate(h).filter((x) => x.outcome === "eligible")
                          .length
                      }{" "}
                      eligible
                    </td>
                    <td>{badge(h.status)}</td>
                    <td>↗</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 100 && (
            <p className="muted">
              Showing the first 100 results. Refine your search to see more.
            </p>
          )}
        </>
      )}
      {selected && view === "households" && (
        <>
          <div className="section-head">
            <div>
              <Link href="/app/households" className="back">
                ← Household queue
              </Link>
              <h2>
                {role === "auditor"
                  ? selected.name.split(" ")[0] + " •••"
                  : selected.name}
              </h2>
              <p>
                {selected.id} · Washington, DC {selected.zip} · Tract{" "}
                {selected.tract}
              </p>
            </div>
            <a
              className="small-link"
              href={"/passport/" + selected.id.toLowerCase()}
              target="_blank"
            >
              Open household view ↗
            </a>
          </div>
          <div className="detail-stats">
            <div className="card">
              <small>ENERGY BURDEN</small>
              <strong>
                {selected.income
                  ? ((selected.annualEnergy / selected.income) * 100).toFixed(1)
                  : "—"}
                %
              </strong>
            </div>
            <div className="card">
              <small>ANNUAL INCOME</small>
              <strong>
                {selected.income === null ? "Missing" : money(selected.income)}
              </strong>
            </div>
            <div className="card">
              <small>EST. SAVINGS</small>
              <strong>
                {money(evaluate(selected).reduce((n, r) => n + r.savings, 0))}
              </strong>
            </div>
          </div>
          <div className="tabs">
            {["Eligibility", "Facts", "Sequence", "History"].map((x) => (
              <button
                key={x}
                className={tab === x ? "active" : ""}
                onClick={() => setTab(x)}
              >
                {x}
              </button>
            ))}
          </div>
          {tab === "Eligibility" && (
            <div className="cards">
              {evaluate(selected).map((r) => (
                <article className="card" key={r.program.id}>
                  <div className="row">
                    <div>
                      <small>{r.program.stage.toUpperCase()}</small>
                      <h3>{r.program.name}</h3>
                    </div>
                    {badge(r.outcome)}
                  </div>
                  <p>{r.reason}</p>
                  {Number(selected.id.slice(3)) <= 240 && (
                    <button
                      className="explain-button"
                      disabled={explaining === r.program.id}
                      onClick={() => explain(selected.id, r.program.id)}
                    >
                      {explaining === r.program.id
                        ? "Explaining…"
                        : "Explain with Claude"}
                    </button>
                  )}
                  {explanations[r.program.id] && (
                    <p className="explanation">{explanations[r.program.id]}</p>
                  )}
                  <div className="row">
                    <span className="muted">
                      Income threshold {money(r.threshold || 0)}
                    </span>
                    <strong>
                      {r.savings ? money(r.savings) + "/yr" : "—"}
                    </strong>
                  </div>
                </article>
              ))}
            </div>
          )}
          {tab === "Facts" && (
            <div className="card fact-list">
              {[
                ["Household size", selected.size],
                [
                  "Annual income",
                  selected.income === null ? "Missing" : money(selected.income),
                ],
                ["Tenure", selected.tenure],
                ["Benefits", selected.benefits.join(", ") || "None"],
                [
                  "Deferral conditions",
                  selected.deferrals.join(", ") || "None",
                ],
                ["Electric utility", "Capitol Light & Power (fictional)"],
              ].map(([label, value]) => (
                <div className="statrow" key={label}>
                  <span>{label}</span>
                  <b>{value}</b>
                </div>
              ))}
              <div className="statrow">
                <span>Facts verified</span>
                <button
                  onClick={() =>
                    update(selected.id, { verified: !selected.verified })
                  }
                >
                  {selected.verified ? "Verified ✓" : "Mark verified"}
                </button>
              </div>
            </div>
          )}
          {tab === "Sequence" && (
            <div className="sequence">
              {[
                "Immediate",
                "Repair",
                "Weatherization",
                "Efficiency",
                "Solar",
              ].map((stage) => (
                <div className="card" key={stage}>
                  <small>{stage.toUpperCase()}</small>
                  {evaluate(selected)
                    .filter(
                      (r) =>
                        r.program.stage === stage &&
                        ["eligible", "deferred"].includes(r.outcome),
                    )
                    .map((r) => (
                      <p key={r.program.id}>
                        {r.program.short} {badge(r.outcome)}
                      </p>
                    ))}
                </div>
              ))}
            </div>
          )}
          {tab === "History" && (
            <div className="card">
              {audit.filter((a) => a.entity === selected.id).length ? (
                audit
                  .filter((a) => a.entity === selected.id)
                  .map((a, i) => (
                    <div className="statrow" key={i}>
                      <span>{a.action}</span>
                      <small>{new Date(a.at).toLocaleString()}</small>
                    </div>
                  ))
              ) : (
                <p className="muted">
                  No changes recorded in this browser session.
                </p>
              )}
            </div>
          )}
        </>
      )}
      {canView && view === "pipeline" && (
        <>
          <div className="section-head">
            <div>
              <span className="eyebrow">ENROLLMENT</span>
              <h2>Pipeline</h2>
            </div>
            <DashboardFilterMenu
              label="Program"
              value={program}
              onValueChange={setProgram}
              options={programs.map((p) => ({ value: p.id, label: p.short }))}
            />
          </div>
          <div className="kanban">
            {[
              "not_contacted",
              "screened",
              "docs_verified",
              "submitted",
              "approved",
              "active",
            ].map((stage, i) => (
              <div className="lane" key={stage}>
                <h3>
                  {stage.replaceAll("_", " ")}{" "}
                  <span>
                    {
                      households.filter(
                        (h) =>
                          h.status === stage &&
                          evaluate(h).find((r) => r.program.id === program)
                            ?.outcome === "eligible",
                      ).length
                    }
                  </span>
                </h3>
                {households
                  .filter(
                    (h) =>
                      h.status === stage &&
                      evaluate(h).find((r) => r.program.id === program)
                        ?.outcome === "eligible",
                  )
                  .slice(0, 12)
                  .map((h) => (
                    <div className="card kanban-card" key={h.id}>
                      <Link href={"/app/households/" + h.id}>
                        <b>{h.id}</b>
                      </Link>
                      <p>{h.name}</p>
                      <small>
                        {h.income
                          ? ((h.annualEnergy / h.income) * 100).toFixed(1)
                          : "—"}
                        % burden
                      </small>
                      {role !== "auditor" && i < 5 && (
                        <button
                          onClick={() => {
                            if (i >= 2 && !h.verified) {
                              setNotice(
                                "Verify household facts before submission.",
                              );
                              return;
                            }
                            update(h.id, {
                              status: [
                                "not_contacted",
                                "screened",
                                "docs_verified",
                                "submitted",
                                "approved",
                                "active",
                              ][i + 1],
                            });
                          }}
                        >
                          Move forward →
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </>
      )}
      {canView && view === "rules" && (
        <>
          <div className="section-head">
            <div>
              <span className="eyebrow">POLICY / DETERMINISTIC</span>
              <h2>Programs & rules</h2>
              <p>
                Income limits are computed from the published tables in the
                brief.
              </p>
            </div>
          </div>
          <div className="cards">
            {programs.map((p) => (
              <div className="card" key={p.id}>
                <div className="row">
                  <h3>{p.name}</h3>
                  <span className="badge eligible">v1</span>
                </div>
                <p>
                  {p.id === "dc-liheap"
                    ? "DC resident, responsible for energy costs, income at or below 60% SMI."
                    : p.id === "dc-solar-for-all"
                      ? "DC resident, fictional electric utility, income at or below 80% AMI or LIHEAP certified."
                      : p.id === "dc-wap"
                        ? "DC resident, income at or below the greater of 200% FPG or 60% SMI; home repairs may defer service."
                        : p.id === "dcseu-iq"
                          ? "DC resident, income at or below 80% AMI or qualifying benefits."
                          : p.id === "utility-discount"
                            ? "Modeled assumption: LIHEAP eligible and fictional electric utility."
                            : "Modeled assumption: owner, 80% AMI, and a home condition requiring repair."}
                </p>
                <small>
                  4-person limit:{" "}
                  {money(
                    p.id === "dc-liheap" ||
                      p.id === "utility-discount" ||
                      p.id === "dc-wap"
                      ? 121200
                      : 131100,
                  )}
                </small>
              </div>
            ))}
          </div>
        </>
      )}
      {canView && view === "intake" && (
        <>
          <div className="section-head">
            <div>
              <span className="eyebrow">INTAKE</span>
              <h2>Add a household</h2>
              <p>
                Enter synthetic facts to see deterministic program decisions.
              </p>
            </div>
          </div>
          <form
            className="card intake"
            onSubmit={(e) => {
              e.preventDefault();
              if (role !== "caseworker") return;
              if (!form.name.trim()) return;
              const id =
                "HH-" +
                String(
                  Math.max(...households.map((x) => Number(x.id.slice(3)))) + 1,
                ).padStart(4, "0");
              const h: Household = {
                id,
                name: form.name,
                size: form.size,
                income: form.income,
                tenure: form.tenure as "owner" | "renter",
                resident: true,
                utility: "capitol",
                benefits: [],
                deferrals: [],
                certified: false,
                annualEnergy: 2400,
                annualElectric: 1500,
                tract: households[0]?.tract ?? seed()[0].tract,
                zip: form.zip,
                status: "not_contacted",
                verified: false,
                created: new Date().toISOString(),
              };
              setHouseholds((x) => [h, ...x]);
              log("household.created", id, "Manual synthetic intake");
              router.push("/app/households/" + id);
            }}
          >
            <label>
              Name
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="Synthetic household name"
              />
            </label>
            <label>
              Household size
              <input
                type="number"
                min="1"
                value={form.size}
                onChange={(e) =>
                  setForm({ ...form, size: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Annual income
              <input
                type="number"
                min="0"
                value={form.income}
                onChange={(e) =>
                  setForm({ ...form, income: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Tenure
              <select
                value={form.tenure}
                onChange={(e) => setForm({ ...form, tenure: e.target.value })}
              >
                <option value="renter">Renter</option>
                <option value="owner">Owner</option>
              </select>
            </label>
            <label>
              ZIP code
              <input
                value={form.zip}
                onChange={(e) => setForm({ ...form, zip: e.target.value })}
              />
            </label>
            <button className="primary">Create household →</button>
          </form>
        </>
      )}
      {canView && view === "map" && (
        <>
          <div className="section-head">
            <div>
              <span className="eyebrow">DOE LEAD TOOL 2022</span>
              <h2>DC energy burden</h2>
              <p>Census tract data for low-income households.</p>
            </div>
          </div>
          <DCMap households={households} />
          <p className="muted">
            Data: U.S. DOE LEAD Tool 2022 (Ma & Vimont, 2024), CC BY 4.0,
            doi:10.25984/2504170. Census tract boundaries: U.S. Census Bureau.
          </p>
        </>
      )}
      {canView && view === "audit" && (
        <>
          <div className="section-head">
            <div>
              <span className="eyebrow">ACTIVITY</span>
              <h2>Browser activity</h2>
              <p>Changes made in this browser. Stored in this browser only.</p>
            </div>
            <DashboardButton
              onClick={() =>
                download(
                  "threshold-activity.jsonl",
                  audit.map((a) => JSON.stringify(a)).join("\n"),
                  "application/x-ndjson",
                )
              }
            >
              Export JSONL ↓
            </DashboardButton>
          </div>
          <div className="card">
            {audit.length ? (
              audit.map((a, i) => (
                <div className="statrow" key={i}>
                  <span>
                    {a.action} · {a.entity}
                  </span>
                  <small>{new Date(a.at).toLocaleString()}</small>
                </div>
              ))
            ) : (
              <p className="muted">No activity yet.</p>
            )}
          </div>
        </>
      )}
      {canView && view === "integrations" && (
        <div className="card">
          <h2>Claude explanations</h2>
          <p>
            Open a sample household, choose a program, and select “Explain with
            Claude.”
          </p>
          <Link href="/app/households/HH-0001">Open a household →</Link>
        </div>
      )}
      {canView && view === "settings" && (
        <>
          <div className="section-head">
            <div>
              <span className="eyebrow">PREFERENCES</span>
              <h2>Settings</h2>
            </div>
          </div>
          <div className="card settings">
            <h3>View as role</h3>
            <p className="muted">
              The role switch changes the local preview only. Server access
              controls require the backend.
            </p>
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                localStorage.setItem("threshold-role", e.target.value);
              }}
            >
              <option value="caseworker">Caseworker</option>
              <option value="program_admin">Program admin</option>
              <option value="auditor">Auditor</option>
            </select>
            <h3>Sandbox data</h3>
            <p className="muted">
              Reset the browser’s synthetic households and activity.
            </p>
            <DashboardButton
              variant="danger"
              onClick={() => {
                if (confirm("Reset this browser sandbox?")) {
                  setHouseholds(seed());
                  setAudit([]);
                }
              }}
            >
              Reset sandbox
            </DashboardButton>
          </div>
        </>
      )}
      <footer>
        Independent prototype. Not affiliated with any agency, utility, or
        nonprofit named here. All household records are synthetic.
      </footer>
    </DashboardShell>
  );
}
