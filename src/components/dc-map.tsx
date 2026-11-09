"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { geoMercator, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import type { Household } from "@/lib/engine";
import geometry from "@/data/generated/dc-tracts.geo.json";
import statistics from "@/data/generated/dc-tract-stats.json";

type Tract = {
  name: string;
  centroid: number[];
  lowIncomeUnits: number;
  lowIncomeBurden: number;
  brackets: Record<
    string,
    {
      units: number;
      avgIncome: number;
      avgElec: number;
      avgGas: number;
      avgOther: number;
    }
  >;
};
const tracts = statistics.tracts as Record<string, Tract>;
const colors = [
  "#e8f3df",
  "#bcdca8",
  "#82b989",
  "#4f8c67",
  "#276046",
  "#153f35",
];
function color(burden: number) {
  return colors[
    burden < 0.04
      ? 0
      : burden < 0.06
        ? 1
        : burden < 0.08
          ? 2
          : burden < 0.1
            ? 3
            : burden < 0.14
              ? 4
              : 5
  ];
}

export default function DCMap({ households }: { households: Household[] }) {
  const [selected, setSelected] = useState("");
  const [hovered, setHovered] = useState("");
  const [pins, setPins] = useState(true);
  const features = (
    geometry as FeatureCollection<Geometry, { geoid: string; name: string }>
  ).features;
  const projection = useMemo(
    () => geoMercator().fitSize([760, 560], geometry as FeatureCollection),
    [],
  );
  const path = geoPath(projection);
  const picked = selected ? tracts[selected] : null;
  const focus = hovered ? tracts[hovered] : null;
  return (
    <div className="map-layout">
      <div className="card map-card">
        <div className="map-toolbar">
          <div>
            <strong>Low-income energy burden</strong>
            <small>DOE LEAD Tool 2022 · Census tracts</small>
          </div>
          <label>
            <input
              type="checkbox"
              checked={pins}
              onChange={(e) => setPins(e.target.checked)}
            />{" "}
            Household pins
          </label>
        </div>
        <svg
          viewBox="0 0 760 560"
          role="img"
          aria-label="Washington DC census tracts colored by energy burden"
          className="dc-map"
        >
          <g>
            {features.map((feature) => {
              const geoid = feature.properties.geoid;
              const tract = tracts[geoid];
              return (
                <path
                  key={geoid}
                  d={path(feature) || ""}
                  fill={color(tract?.lowIncomeBurden || 0)}
                  className={selected === geoid ? "selected" : ""}
                  tabIndex={0}
                  role="button"
                  aria-label={`${feature.properties.name}, ${((tract?.lowIncomeBurden || 0) * 100).toFixed(1)} percent burden`}
                  onMouseEnter={() => setHovered(geoid)}
                  onMouseLeave={() => setHovered("")}
                  onClick={() => setSelected(geoid)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(geoid);
                    }
                  }}
                />
              );
            })}
          </g>
          {pins &&
            households.map((h) => {
              const center = tracts[h.tract]?.centroid;
              if (!center) return null;
              const point = projection(center as [number, number]);
              return point ? (
                <circle
                  key={h.id}
                  cx={point[0]}
                  cy={point[1]}
                  r="2.5"
                  fill="#ed8048"
                  opacity=".8"
                >
                  <title>{h.id}</title>
                </circle>
              ) : null;
            })}
        </svg>
        <div className="map-legend">
          <span>Lower</span>
          {colors.map((c, i) => (
            <i key={i} style={{ background: c }} />
          ))}
          <span>Higher</span>
        </div>
        {focus && (
          <div className="map-hover">
            {focus.name} · {(focus.lowIncomeBurden * 100).toFixed(1)}% burden
          </div>
        )}
      </div>
      <aside className="card tract-panel">
        {picked ? (
          <>
            <small>SELECTED TRACT</small>
            <h3>{picked.name}</h3>
            <div className="tract-metric">
              <strong>{(picked.lowIncomeBurden * 100).toFixed(1)}%</strong>
              <span>low-income energy burden</span>
            </div>
            <div className="statrow">
              <span>Low-income housing units</span>
              <b>{picked.lowIncomeUnits.toLocaleString()}</b>
            </div>
            <h4>Income brackets</h4>
            {Object.entries(picked.brackets).map(([key, value]) => (
              <div className="statrow" key={key}>
                <span>{key.replace("b", "").replace("_", "–")}% AMI</span>
                <b>{value.units.toLocaleString()} units</b>
              </div>
            ))}
            <h4>Households in this demo</h4>
            {households
              .filter((h) => h.tract === selected)
              .slice(0, 8)
              .map((h) => (
                <p key={h.id}>
                  <Link href={"/app/households/" + h.id}>{h.id} ↗</Link>
                </p>
              ))}
            <Link
              className="map-filter"
              href={"/app/households?tract=" + selected}
            >
              Open household queue →
            </Link>
          </>
        ) : (
          <>
            <small>SELECT A TRACT</small>
            <h3>Explore the District</h3>
            <p>
              Click a tract to see its energy burden, housing units, and sample
              households.
            </p>
            <div className="tract-metric">
              <strong>{Object.keys(tracts).length}</strong>
              <span>tracts with LEAD data</span>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
