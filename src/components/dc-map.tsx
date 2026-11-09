"use client";
import { useMemo, useRef, useState, type FocusEvent, type MouseEvent } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { geoMercator, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import type { Household } from "@/lib/engine";
import geometry from "@/data/generated/dc-tracts.geo.json";
import statistics from "@/data/generated/dc-tract-stats.json";

type Bracket = {
  units: number;
  avgIncome: number;
  avgElec: number;
  avgGas: number;
  avgOther: number;
};
type Tract = {
  name: string;
  centroid: number[];
  lowIncomeUnits: number;
  lowIncomeBurden: number;
  brackets: Record<string, Bracket>;
};
type Metric = "burden" | "units" | "cost";

const tracts = statistics.tracts as Record<string, Tract>;
const lowIncomeBrackets = ["b0_30", "b30_60", "b60_80"];
const bracketOrder = [...lowIncomeBrackets, "b80_100", "b100_plus"];
const colors = ["#e8f3df", "#bcdca8", "#82b989", "#4f8c67", "#276046", "#153f35"];
const noDataColor = "#eceee8";
const SIZE = 640;

const percent = (n: number) => `${(n * 100).toFixed(1)}%`;
const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const count = (n: number) => Math.round(n).toLocaleString("en-US");

/** Unit-weighted average annual energy costs for the brackets below 80% AMI. */
function lowIncomeCosts(tract: Tract) {
  const rows = lowIncomeBrackets
    .map((key) => tract.brackets[key])
    .filter((b): b is Bracket => Boolean(b) && b.units > 0);
  const units = rows.reduce((n, b) => n + b.units, 0) || 1;
  const average = (pick: (b: Bracket) => number) =>
    rows.reduce((n, b) => n + b.units * pick(b), 0) / units;
  const elec = average((b) => b.avgElec);
  const gas = average((b) => b.avgGas);
  const other = average((b) => b.avgOther);
  return { elec, gas, other, total: elec + gas + other, income: average((b) => b.avgIncome) };
}

const entries = Object.entries(tracts);
const withData = entries.filter(([, t]) => t.lowIncomeUnits > 0);
const costById = new Map(withData.map(([id, t]) => [id, lowIncomeCosts(t).total]));

/** Five rounded breaks that split the values into six similarly sized groups. */
function quantileBreaks(values: number[], step: number) {
  const sorted = [...values].sort((a, b) => a - b);
  const breaks = [1, 2, 3, 4, 5].map(
    (i) => Math.round(sorted[Math.floor((sorted.length * i) / 6)] / step) * step,
  );
  return breaks.map((b, i) => (i > 0 && b <= breaks[i - 1] ? breaks[i - 1] + step * (i + 1) : b));
}

const metrics: Record<
  Metric,
  { label: string; value: (id: string) => number; breaks: number[]; format: (n: number) => string }
> = {
  burden: {
    label: "Energy burden",
    value: (id) => tracts[id].lowIncomeBurden,
    breaks: [0.04, 0.06, 0.08, 0.1, 0.14],
    format: (n) => `${Math.round(n * 100)}%`,
  },
  units: {
    label: "Low-income homes",
    value: (id) => tracts[id].lowIncomeUnits,
    breaks: quantileBreaks(withData.map(([, t]) => t.lowIncomeUnits), 50),
    format: count,
  },
  cost: {
    label: "Energy cost",
    value: (id) => costById.get(id) ?? 0,
    breaks: quantileBreaks([...costById.values()], 50),
    format: usd,
  },
};
const metricKeys = Object.keys(metrics) as Metric[];

const bucket = (value: number, breaks: number[]) => {
  const index = breaks.findIndex((b) => value < b);
  return index === -1 ? breaks.length : index;
};

const district = (() => {
  let units = 0;
  let cost = 0;
  let income = 0;
  for (const [, tract] of withData) {
    const c = lowIncomeCosts(tract);
    units += tract.lowIncomeUnits;
    cost += tract.lowIncomeUnits * c.total;
    income += tract.lowIncomeUnits * c.income;
  }
  return {
    units,
    burden: income ? cost / income : 0,
    severe: withData.filter(([, t]) => t.lowIncomeBurden >= 0.1).length,
  };
})();

const highestBurden = [...withData]
  .sort(([, a], [, b]) => b.lowIncomeBurden - a.lowIncomeBurden)
  .slice(0, 10);

const bracketLabel = (key: string) =>
  key === "b100_plus" ? "100%+ AMI" : `${key.slice(1).replace("_", "–")}% AMI`;

const quadrants: { label: string; at: [number, number] }[] = [
  { label: "NW", at: [-77.06, 38.945] },
  { label: "NE", at: [-76.975, 38.93] },
  { label: "SE", at: [-76.975, 38.85] },
  { label: "SW", at: [-77.024, 38.868] },
];
const capitol: [number, number] = [-77.009, 38.8899];

type Hover = { id: string; x: number; y: number; flip: boolean };

export default function DCMap({ households }: { households: Household[] }) {
  const [selected, setSelected] = useState("");
  const [hover, setHover] = useState<Hover | null>(null);
  const [pins, setPins] = useState(true);
  const [metric, setMetric] = useState<Metric>("burden");
  const stageRef = useRef<HTMLDivElement>(null);

  const { shapes, project, viewBox } = useMemo(() => {
    const collection = geometry as FeatureCollection<Geometry, { geoid: string; name: string }>;
    const projection = geoMercator().fitExtent(
      [
        [16, 16],
        [SIZE - 16, SIZE - 16],
      ],
      collection,
    );
    const path = geoPath(projection);
    // Crop the frame to the District's outline so the map fills its card edge to edge.
    const [[x0, y0], [x1, y1]] = path.bounds(collection);
    return {
      project: projection,
      viewBox: `${x0 - 3} ${y0 - 3} ${x1 - x0 + 6} ${y1 - y0 + 6}`,
      shapes: collection.features.map((f) => ({
        id: f.properties.geoid,
        name: f.properties.name,
        d: path(f) || "",
      })),
    };
  }, []);

  const householdsByTract = useMemo(() => {
    const map = new Map<string, Household[]>();
    for (const h of households) map.set(h.tract, [...(map.get(h.tract) ?? []), h]);
    return map;
  }, [households]);

  const active = metrics[metric];
  const hasData = (id: string) => (tracts[id]?.lowIncomeUnits ?? 0) > 0;
  const fill = (id: string) =>
    hasData(id) ? colors[bucket(active.value(id), active.breaks)] : noDataColor;

  const place = (id: string, clientX: number, clientY: number) => {
    const box = stageRef.current?.getBoundingClientRect();
    if (!box) return;
    const x = clientX - box.left;
    setHover({ id, x, y: clientY - box.top, flip: x > box.width / 2 });
  };
  const onMove = (id: string) => (e: MouseEvent) => place(id, e.clientX, e.clientY);
  const onFocus = (id: string) => (e: FocusEvent<SVGPathElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    place(id, box.left + box.width / 2, box.top + box.height / 2);
  };

  const center = project(capitol);
  const picked = selected ? tracts[selected] : null;
  const pickedHouseholds = householdsByTract.get(selected) ?? [];
  const costs = picked ? lowIncomeCosts(picked) : null;
  const delta = picked ? (picked.lowIncomeBurden - district.burden) * 100 : 0;
  const hovered = hover ? tracts[hover.id] : null;
  const outlined = [selected, hover?.id].filter((id): id is string => Boolean(id));

  return (
    <>
      <div className="kpis map-stats">
        <div className="card kpi">
          <span>Low-income homes</span>
          <strong>{count(district.units)}</strong>
        </div>
        <div className="card kpi">
          <span>District energy burden</span>
          <strong>{percent(district.burden)}</strong>
        </div>
        <div className="card kpi">
          <span>Tracts at 10% or more</span>
          <strong>{district.severe}</strong>
        </div>
        <div className="card kpi">
          <span>Tracts with data</span>
          <strong>{withData.length}</strong>
        </div>
      </div>
      <div className="map-layout">
        <div className="card map-card">
          <div className="map-toolbar">
            <div className="segmented" role="group" aria-label="Map metric">
              {metricKeys.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={metric === key}
                  onClick={() => setMetric(key)}
                >
                  {metrics[key].label}
                </button>
              ))}
            </div>
            <label className="map-toggle">
              <input
                type="checkbox"
                checked={pins}
                onChange={(e) => setPins(e.target.checked)}
              />
              Households
            </label>
          </div>
          <div className="map-stage" ref={stageRef} onMouseLeave={() => setHover(null)}>
            <svg
              viewBox={viewBox}
              role="group"
              aria-label={`Washington DC census tracts colored by ${active.label.toLowerCase()}`}
              className="dc-map"
            >
              <defs>
                <clipPath id="dc-outline">
                  {shapes.map((s) => (
                    <path key={s.id} d={s.d} />
                  ))}
                </clipPath>
              </defs>
              <g>
                {shapes.map((s) => (
                  <path
                    key={s.id}
                    d={s.d}
                    fill={fill(s.id)}
                    tabIndex={0}
                    role="button"
                    aria-pressed={selected === s.id}
                    aria-label={`${s.name}, ${
                      hasData(s.id)
                        ? `${(tracts[s.id].lowIncomeBurden * 100).toFixed(1)} percent burden`
                        : "no data"
                    }`}
                    onMouseMove={onMove(s.id)}
                    onFocus={onFocus(s.id)}
                    onBlur={() => setHover(null)}
                    onClick={() => setSelected(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(s.id);
                      }
                    }}
                  />
                ))}
              </g>
              {center && (
                <g className="map-axes" clipPath="url(#dc-outline)">
                  <line x1={center[0]} x2={center[0]} y1={0} y2={SIZE} />
                  <line x1={0} x2={SIZE} y1={center[1]} y2={center[1]} />
                </g>
              )}
              {pins &&
                [...householdsByTract].map(([id, list]) => {
                  const c = tracts[id]?.centroid;
                  const point = c && project(c as [number, number]);
                  return point ? (
                    <circle
                      key={id}
                      className="map-pin"
                      cx={point[0]}
                      cy={point[1]}
                      r={2 + Math.sqrt(list.length) * 1.1}
                    />
                  ) : null;
                })}
              {shapes
                .filter((s) => outlined.includes(s.id))
                .map((s) => (
                  <path key={s.id} d={s.d} className="tract-outline" />
                ))}
              {quadrants.map((q) => {
                const point = project(q.at);
                return point ? (
                  <text key={q.label} x={point[0]} y={point[1]} className="map-quadrant">
                    {q.label}
                  </text>
                ) : null;
              })}
            </svg>
            {hover && hovered && (
              <div
                className="map-tip"
                style={{
                  left: hover.x,
                  top: hover.y,
                  transform: `translate(${hover.flip ? "calc(-100% - 14px)" : "14px"}, -50%)`,
                }}
              >
                <strong>{hovered.name}</strong>
                {hasData(hover.id) ? (
                  <dl>
                    <dt>Energy burden</dt>
                    <dd>{percent(hovered.lowIncomeBurden)}</dd>
                    <dt>Low-income homes</dt>
                    <dd>{count(hovered.lowIncomeUnits)}</dd>
                    <dt>Annual energy cost</dt>
                    <dd>{usd(costById.get(hover.id) ?? 0)}</dd>
                    <dt>Households</dt>
                    <dd>{householdsByTract.get(hover.id)?.length ?? 0}</dd>
                  </dl>
                ) : (
                  <span>No low-income homes reported</span>
                )}
              </div>
            )}
          </div>
          <div className="map-legend" aria-label={`${active.label} legend`}>
            {colors.map((c, i) => (
              <div key={c}>
                <i style={{ background: c }} />
                <span>
                  {i === 0
                    ? `< ${active.format(active.breaks[0])}`
                    : i === colors.length - 1
                      ? `${active.format(active.breaks[i - 1])}+`
                      : active.format(active.breaks[i - 1])}
                </span>
              </div>
            ))}
            <div className="no-data">
              <i style={{ background: noDataColor }} />
              <span>No data</span>
            </div>
          </div>
        </div>
        <aside className="card tract-panel">
          {picked && costs ? (
            <>
              <div className="tract-head">
                <h3>{picked.name}</h3>
                <button type="button" aria-label="Clear selection" onClick={() => setSelected("")}>
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
              <div className="tract-metric">
                <strong>{percent(picked.lowIncomeBurden)}</strong>
                <span>
                  {Math.abs(delta) < 0.05
                    ? "Same as the District"
                    : `${Math.abs(delta).toFixed(1)} pts ${delta > 0 ? "above" : "below"} the District`}
                </span>
              </div>
              <div className="statrow">
                <span>Low-income homes</span>
                <b>{count(picked.lowIncomeUnits)}</b>
              </div>
              <div className="statrow">
                <span>Avg. household income</span>
                <b>{usd(costs.income)}</b>
              </div>
              <h4>Annual energy cost · {usd(costs.total)}</h4>
              <div className="cost-bar" aria-hidden="true">
                <i className="elec" style={{ flexGrow: costs.elec }} />
                <i className="gas" style={{ flexGrow: costs.gas }} />
                <i className="other" style={{ flexGrow: costs.other }} />
              </div>
              <ul className="cost-key">
                <li>
                  <i className="elec" />
                  Electric <b>{usd(costs.elec)}</b>
                </li>
                <li>
                  <i className="gas" />
                  Gas <b>{usd(costs.gas)}</b>
                </li>
                <li>
                  <i className="other" />
                  Other <b>{usd(costs.other)}</b>
                </li>
              </ul>
              <h4>Burden by income</h4>
              <table className="bracket-table">
                <thead>
                  <tr>
                    <th scope="col">Income</th>
                    <th scope="col">Homes</th>
                    <th scope="col">Burden</th>
                  </tr>
                </thead>
                <tbody>
                  {bracketOrder
                    .filter((key) => picked.brackets[key])
                    .map((key) => {
                      const b = picked.brackets[key];
                      return (
                        <tr key={key} className="static">
                          <td>{bracketLabel(key)}</td>
                          <td>{count(b.units)}</td>
                          <td>
                            {b.units && b.avgIncome
                              ? percent((b.avgElec + b.avgGas + b.avgOther) / b.avgIncome)
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              {pickedHouseholds.length > 0 && (
                <>
                  <h4>Households · {pickedHouseholds.length}</h4>
                  <div className="tract-households">
                    {pickedHouseholds.slice(0, 8).map((h) => (
                      <Link key={h.id} href={"/app/households/" + h.id}>
                        {h.id}
                      </Link>
                    ))}
                  </div>
                  <Link className="map-filter" href={"/app/households?tract=" + selected}>
                    Open in household queue
                  </Link>
                </>
              )}
            </>
          ) : (
            <>
              <h3>Highest burden</h3>
              <ol className="rank-list">
                {highestBurden.map(([id, tract]) => (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => setSelected(id)}
                      onMouseEnter={() => setHover(null)}
                    >
                      <span>{tract.name.replace("Census Tract ", "Tract ")}</span>
                      <b>{percent(tract.lowIncomeBurden)}</b>
                      <i
                        style={{
                          width: `${(tract.lowIncomeBurden / highestBurden[0][1].lowIncomeBurden) * 100}%`,
                        }}
                      />
                    </button>
                  </li>
                ))}
              </ol>
              <p className="muted">Select any tract for its costs and income detail.</p>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
