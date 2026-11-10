"use client";
import { useEffect, useMemo, useRef, useState } from "react";
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
  ArrowLeft,
  ChevronDown,
  Download,
  ExternalLink,
  X,
  Workflow,
} from "lucide-react";
import {
  DashboardShell,
  DashboardButton,
  DashboardConfirmDialog,
  DashboardFilterMenu,
  DashboardMenu,
  DashboardMenuContent,
  DashboardMenuLabel,
  DashboardMenuRadioGroup,
  DashboardMenuRadioItem,
  DashboardMenuTrigger,
} from "@/components/block/dashboard-shell";
import NumberFlow from "@number-flow/react";
import { Sparkline } from "@/components/analytics-dashboard/ui";
import {
  seed,
  evaluate,
  programs,
  money,
  type Household,
} from "@/lib/engine";
import RuleHarness from "@/components/rule-harness";
import CheckList from "@/components/check-list";
import Intake from "@/components/intake";

import { nextEntry, verifyChain, type AuditEntry } from "@/lib/audit-chain";
type Audit = AuditEntry;
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
const mask = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0] + ".")
    .join(" ");
const roles = [
  { value: "caseworker", label: "Caseworker" },
  { value: "program_admin", label: "Program admin" },
  { value: "auditor", label: "Auditor" },
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
  const [explanations, setExplanations] = useState<
      Record<string, { text: string; source: "claude" | "rules" }>
    >({}),
    [explaining, setExplaining] = useState(""),
    [search, setSearch] = useState(""),
    [tractFilter, setTractFilter] = useState(""),
    [outcome, setOutcome] = useState("all"),
    [role, setRole] = useState("caseworker"),
    [program, setProgram] = useState<string>(programs[0].id),
    [tab, setTab] = useState("Eligibility");
  const [notice, setNotice] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const changeRole = (next: string) => {
    setRole(next);
    try {
      localStorage.setItem("threshold-role", next);
    } catch {}
  };
  const auditRef = useRef<Audit[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    try {
      const saved = localStorage.getItem("threshold-households-v2");
      const log = localStorage.getItem("threshold-activity-v2");
      if (saved) setHouseholds(JSON.parse(saved));
      if (log) {
        const parsed = JSON.parse(log) as Audit[];
        setAudit(parsed);
        auditRef.current = parsed;
      }
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
      localStorage.setItem("threshold-activity-v2", JSON.stringify(audit));
  }, [audit, ready]);
  // Newest first in state; writes are serialized so every entry links to the one before it.
  const log = (action: string, entity: string, detail: string) => {
    queue.current = queue.current.then(async () => {
      const entry = await nextEntry(auditRef.current[0], {
        role,
        action,
        entity,
        detail,
      });
      auditRef.current = [entry, ...auditRef.current];
      setAudit(auditRef.current);
    });
    return queue.current;
  };
  const [chainStatus, setChainStatus] = useState("");
  const update = (id: string, patch: Partial<Household>) => {
    if (role === "auditor") {
      setNotice("Auditor access is read only.");
      return;
    }
    setHouseholds((h) => h.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    log("household.updated", id, JSON.stringify(patch));
  };
  const selected = households.find((h) => h.id === selectedId);
  const explain = async (h: Household, programId: string) => {
    setExplaining(programId);
    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId,
          household: {
            size: h.size,
            income: h.income,
            tenure: h.tenure,
            resident: h.resident,
            utility: h.utility,
            benefits: h.benefits,
            deferrals: h.deferrals,
            certified: h.certified,
            annualEnergy: h.annualEnergy,
            annualElectric: h.annualElectric,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Explanation unavailable");
      setExplanations((current) => ({
        ...current,
        [h.id + programId]: { text: data.text, source: data.source },
      }));
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
      weekly: Array.from({ length: 12 }, (_, i) => {
        const now = Date.UTC(2026, 10, 9);
        const end = now - (11 - i) * 7 * 864e5;
        return households.filter((h) => {
          const t = Date.parse(h.created);
          return t > end - 7 * 864e5 && t <= end;
        }).length;
      }),
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
          title: "Workspace",
          items: visibleNav.filter(
            (item) => !["audit", "settings"].includes(item.id),
          ),
        },
        {
          id: "system",
          title: "Admin",
          items: visibleNav.filter((item) =>
            ["audit", "settings"].includes(item.id),
          ),
        },
      ]}
      activeItemId={
        canView && view === "households" && selected ? "households" : view
      }
      title={name}
      tabs={
        selected && view === "households"
          ? ["Eligibility", "Facts", "Sequence", "History"].map((x) => ({
              value: x,
              label: x,
            }))
          : undefined
      }
      tab={tab}
      onTabChange={setTab}
      headerActions={
        <DashboardMenu>
          <DashboardMenuTrigger asChild>
            <DashboardButton variant="secondary" size="sm">
              {roles.find((r) => r.value === role)?.label}
              <ChevronDown size={14} aria-hidden="true" />
            </DashboardButton>
          </DashboardMenuTrigger>
          <DashboardMenuContent align="end">
            <DashboardMenuLabel>View as</DashboardMenuLabel>
            <DashboardMenuRadioGroup value={role} onValueChange={changeRole}>
              {roles.map((r) => (
                <DashboardMenuRadioItem key={r.value} value={r.value}>
                  {r.label}
                </DashboardMenuRadioItem>
              ))}
            </DashboardMenuRadioGroup>
          </DashboardMenuContent>
        </DashboardMenu>
      }
      sidebarFooter={
        <div className="sidebar-note">
          <ShieldCheck size={16} /> 6 program rules
          <br />
          <small>Income limits as of Nov 2026</small>
        </div>
      }
      linkComponent={Link}
      className="workbench"
    >
      {notice && (
        <div className="notice" onClick={() => setNotice("")}>
          {notice}
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
              <h2>Households and programs</h2>
              <p>Eligibility across six DC energy programs.</p>
            </div>
            <DashboardButton
              variant="primary"
              onClick={() => router.push("/app/households")}
            >
              Open queue
            </DashboardButton>
          </div>
          <div className="kpis">
            <div className="card kpi">
              <span>Households</span>
              <strong>
                <NumberFlow value={households.length} />
              </strong>
              <div className="kpi-foot">
                <small>New per week</small>
                <Sparkline data={stats.weekly} width={96} height={28} />
              </div>
            </div>
            <div className="card kpi">
              <span>Verified</span>
              <strong>
                <NumberFlow
                  value={stats.verified / 100}
                  format={{ style: "percent", maximumFractionDigits: 0 }}
                />
              </strong>
              <small>Facts confirmed by a caseworker</small>
            </div>
            <div className="card kpi">
              <span>Eligible, not contacted</span>
              <strong>
                <NumberFlow value={stats.gap} />
              </strong>
              <small>Qualify for at least one program</small>
            </div>
            <div className="card kpi">
              <span>Modeled annual savings</span>
              <strong>
                <NumberFlow
                  value={stats.savings}
                  format={{
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 0,
                  }}
                />
              </strong>
              <small>Approved and active households</small>
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
              <h2>Households</h2>
              <p>Search by name or reference, or filter by result.</p>
            </div>
            <DashboardButton onClick={csv}>
              <Download size={14} aria-hidden="true" /> Export CSV
            </DashboardButton>
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
                Tract {tractFilter} <X size={12} aria-label="Clear" />
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
                  <th>Ref</th>
                  <th>Name</th>
                  <th>Size</th>
                  <th>Income</th>
                  <th>Programs</th>
                  <th>Stage</th>
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
                        ? mask(h.name)
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
                    <td></td>
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
                <ArrowLeft size={13} aria-hidden="true" /> Household queue
              </Link>
              <h2>
                {role === "auditor"
                  ? mask(selected.name)
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
              Household view <ExternalLink size={12} aria-hidden="true" />
            </a>
          </div>
          <div className="detail-stats">
            <div className="card">
              <small>Energy burden</small>
              <strong>
                {selected.income
                  ? ((selected.annualEnergy / selected.income) * 100).toFixed(1)
                  : "—"}
                %
              </strong>
            </div>
            <div className="card">
              <small>Annual income</small>
              <strong>
                {selected.income === null ? "Missing" : money(selected.income)}
              </strong>
            </div>
            <div className="card">
              <small>Modeled savings</small>
              <strong>
                {money(evaluate(selected).reduce((n, r) => n + r.savings, 0))}
              </strong>
            </div>
          </div>
          {tab === "Eligibility" && (
            <div className="cards">
              {evaluate(selected).map((r) => (
                <article className="card" key={r.program.id}>
                  <div className="row">
                    <div>
                      <small>{r.program.stage}</small>
                      <h3>{r.program.name}</h3>
                    </div>
                    {badge(r.outcome)}
                  </div>
                  {r.assumption && (
                    <span className="assumption">Modeled assumption</span>
                  )}
                  <CheckList checks={r.checks} />
                  <button
                    className="explain-button"
                    disabled={explaining === r.program.id}
                    onClick={() => explain(selected, r.program.id)}
                  >
                    {explaining === r.program.id
                      ? "Explaining…"
                      : "Explain with Claude"}
                  </button>
                  {explanations[selected.id + r.program.id] && (
                    <p className="explanation">
                      {explanations[selected.id + r.program.id].text}
                      <small>
                        {explanations[selected.id + r.program.id].source ===
                        "claude"
                          ? "Written by Claude"
                          : "Rule summary"}
                      </small>
                    </p>
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
              {Object.entries(selected.provenance ?? {}).map(([fact, p]) => (
                <div className="statrow" key={fact}>
                  <span>Source of {fact}</span>
                  <small title={`“${p.evidence}”`}>
                    {p.source.replace("_", " ")} · Claude confidence{" "}
                    {Math.round(p.confidence * 100)}%
                  </small>
                </div>
              ))}
              {!selected.provenance && (
                <div className="statrow">
                  <span>Source</span>
                  <small>Seeded from DOE LEAD tract distributions</small>
                </div>
              )}
              <div className="statrow">
                <span>Facts verified</span>
                <button
                  onClick={() =>
                    update(selected.id, { verified: !selected.verified })
                  }
                >
                  {selected.verified ? "Verified" : "Mark verified"}
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
                  <small>{stage}</small>
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
                          Move forward 
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
              <h2>Programs & rules</h2>
              <p>
                Income limits and conditions for each program. Edit the
                facts on the left to test a case.
              </p>
            </div>
          </div>
          <RuleHarness />
        </>
      )}
      {canView && view === "intake" && (
        <>
          <div className="section-head">
            <div>
              <h2>Add a household</h2>
              <p>
                Start from a document or enter the facts by hand.
              </p>
            </div>
          </div>
          <Intake
            disabled={role !== "caseworker"}
            onCreate={(draft) => {
              const id =
                "HH-" +
                String(
                  Math.max(...households.map((x) => Number(x.id.slice(3)))) + 1,
                ).padStart(4, "0");
              const h: Household = {
                ...draft,
                id,
                status: "not_contacted",
                verified: false,
                created: new Date().toISOString(),
              };
              setHouseholds((x) => [h, ...x]);
              void log(
                "household.created",
                id,
                Object.keys(draft.provenance ?? {}).length
                  ? "Intake from document"
                  : "Manual intake",
              );
              router.push("/app/households/" + id);
            }}
          />
        </>
      )}
      {canView && view === "map" && (
        <>
          <div className="section-head">
            <div>
              <h2>DC energy burden</h2>
              <p>Share of income low-income households spend on energy.</p>
            </div>
          </div>
          <DCMap households={households} />
          <p className="map-source">
            Source:{" "}
            <a
              href="https://doi.org/10.25984/2504170"
              target="_blank"
              rel="noreferrer"
            >
              DOE LEAD Tool, 2022
            </a>{" "}
            (CC BY 4.0)
          </p>
        </>
      )}
      {canView && view === "audit" && (
        <>
          <div className="section-head">
            <div>
              <h2>Activity</h2>
              <p>
                Changes made in this browser. Each entry stores the hash of
                the previous one, so edits can be detected.
              </p>
            </div>
            <div className="row-buttons">
              <DashboardButton
                variant="primary"
                onClick={async () => {
                  const result = await verifyChain([...audit].reverse());
                  setChainStatus(
                    result.ok
                      ? `ok:All ${result.checked} entries verified.`
                      : `bad:Entry #${result.brokenAt} does not match its recorded hash.`,
                  );
                }}
              >
                Verify chain
              </DashboardButton>
              {audit.length > 0 && (
                <DashboardButton
                  variant="ghost"
                  onClick={() => {
                    const [last, ...rest] = auditRef.current;
                    const forged = [
                      { ...last, detail: last.detail + " (edited)" },
                      ...rest,
                    ];
                    auditRef.current = forged;
                    setAudit(forged);
                    setChainStatus("");
                  }}
                >
                  Edit latest entry (test)
                </DashboardButton>
              )}
              <DashboardButton
                onClick={() =>
                  download(
                    "threshold-activity.jsonl",
                    [...audit]
                      .reverse()
                      .map((a) => JSON.stringify(a))
                      .join("\n"),
                    "application/x-ndjson",
                  )
                }
              >
                Export JSONL 
              </DashboardButton>
            </div>
          </div>
          {chainStatus && (
            <div
              className={
                "chain-status " + (chainStatus.startsWith("ok:") ? "ok" : "bad")
              }
            >
              {chainStatus.slice(chainStatus.indexOf(":") + 1)}
            </div>
          )}
          <div className="table-wrap">
            {audit.length ? (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Time</th>
                    <th>Role</th>
                    <th>Action</th>
                    <th>Household</th>
                    <th>Detail</th>
                    <th>Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((a) => (
                    <tr key={a.seq + a.hash} className="static">
                      <td>{a.seq}</td>
                      <td>{new Date(a.at).toLocaleString()}</td>
                      <td>{a.role.replace("_", " ")}</td>
                      <td>{a.action}</td>
                      <td>{a.entity}</td>
                      <td className="detail-cell">{a.detail}</td>
                      <td>
                        <code title={a.hash}>{a.hash.slice(0, 10)}…</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted" style={{ padding: 20 }}>
                No activity yet.
              </p>
            )}
          </div>
        </>
      )}
      {canView && view === "settings" && (
        <>
          <div className="section-head">
            <div>
              <h2>Settings</h2>
            </div>
          </div>
          <div className="card settings">
            <h3>Role</h3>
            <p className="muted">
              Changes navigation and what can be edited.
            </p>
            <DashboardFilterMenu
              label="Role"
              value={role}
              onValueChange={changeRole}
              options={roles}
            />
            <h3>Data</h3>
            <p className="muted">
              Restore the original households and clear activity in this browser.
            </p>
            <DashboardButton
              variant="danger"
              onClick={() => setConfirmReset(true)}
            >
              Reset data
            </DashboardButton>
            <DashboardConfirmDialog
              open={confirmReset}
              onOpenChange={setConfirmReset}
              tone="danger"
              title="Reset households and activity?"
              description="This restores the original 240 households and clears the activity log in this browser."
              confirmLabel="Reset"
              onConfirm={() => {
                setHouseholds(seed());
                auditRef.current = [];
                setAudit([]);
                setChainStatus("");
              }}
            />
          </div>
        </>
      )}
    </DashboardShell>
  );
}
