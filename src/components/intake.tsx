"use client";
import { useMemo, useState } from "react";
import tractData from "@/data/generated/dc-tract-stats.json";
import { categoricalBenefits, evaluate, money, seed, type Household } from "@/lib/engine";
import type { Prefill } from "@/lib/extraction";
import CheckList from "@/components/check-list";
import { makeSyntheticDocument, type DocKind } from "@/components/synthetic-doc";

type Draft = Omit<Household, "id" | "status" | "verified" | "created">;
const benefitOptions = ["SNAP", "TANF", ...categoricalBenefits];
const deferralOptions = ["roof_leak", "mold", "knob_and_tube", "structural"];
const toggle = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

type TractStats = {
  name: string;
  lowIncomeUnits: number;
  brackets: Record<string, { avgElec: number; avgGas: number; avgOther: number } | undefined>;
};
const tracts = Object.entries(tractData.tracts as unknown as Record<string, TractStats>)
  .filter(([, t]) => t.lowIncomeUnits > 0)
  .sort((a, b) => a[1].name.localeCompare(b[1].name, "en", { numeric: true }));

function energyFor(tractId: string) {
  const b = tracts.find(([id]) => id === tractId)?.[1].brackets.b30_60;
  const elec = Math.round(b?.avgElec ?? 1500);
  return { annualElectric: elec, annualEnergy: Math.round(elec + (b?.avgGas ?? 600) + (b?.avgOther ?? 0)) };
}

export default function Intake({
  disabled,
  onCreate,
}: {
  disabled: boolean;
  onCreate: (draft: Draft) => void;
}) {
  const template = useMemo(() => seed()[0], []);
  const [kind, setKind] = useState<DocKind>("pay_stub");
  const [image, setImage] = useState("");
  const [status, setStatus] = useState<"idle" | "reading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft>({
    name: "",
    size: 2,
    income: 45000,
    tenure: "renter",
    resident: true,
    utility: "capitol",
    benefits: [],
    deferrals: [],
    certified: false,
    tract: tracts[0][0],
    zip: "20001",
    ...energyFor(tracts[0][0]),
    provenance: {},
  });
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const from = (fact: string) => {
    const p = draft.provenance?.[fact];
    return p ? (
      <span className={"prov" + (p.confidence < 0.6 ? " low" : "")} title={`“${p.evidence}”`}>
        {p.source.replace("_", " ")}, {Math.round(p.confidence * 100)}%
      </span>
    ) : null;
  };

  const upload = (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setStatus("error");
      setMessage("Upload a PNG or JPEG image.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setStatus("error");
      setMessage("Image too large (4 MB max).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImage(String(reader.result));
      setStatus("idle");
      setMessage("");
    };
    reader.readAsDataURL(file);
  };

  const extract = async () => {
    setStatus("reading");
    setMessage("Reading document…");
    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Extraction unavailable");
      const prefill = data.prefill as Prefill;
      setDraft((d) => ({
        ...d,
        name: prefill.name ?? d.name,
        zip: prefill.zip ?? d.zip,
        size: prefill.size ?? d.size,
        income: prefill.income ?? d.income,
        benefits: Array.from(new Set([...d.benefits, ...prefill.benefits])),
        provenance: { ...d.provenance, ...prefill.provenance },
      }));
      setWarnings(data.extraction.warnings ?? []);
      setStatus("done");
      const found = Object.keys(prefill.provenance).length;
      setMessage(
        found
          ? `Filled ${found} field${found === 1 ? "" : "s"}. Review each value before saving.`
          : "No household facts were found on this document.",
      );
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Extraction unavailable");
    }
  };

  const preview = evaluate({ ...template, ...draft });

  return (
    <div className="harness">
      <div className="card intake-ai">
        <h3>Document</h3>
        <p className="muted">
          Use a generated sample or upload a PNG or JPEG. Images are not stored.
        </p>
        <label>
          Document type
          <select value={kind} onChange={(e) => setKind(e.target.value as DocKind)}>
            <option value="pay_stub">Pay stub</option>
            <option value="utility_bill">Utility bill</option>
            <option value="benefit_letter">Benefit letter</option>
          </select>
        </label>
        <div className="row-buttons">
          <button type="button" onClick={() => setImage(makeSyntheticDocument(kind))}>
            Generate
          </button>
          <label className="file-button">
            Upload image
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => upload(e.target.files?.[0])}
            />
          </label>
        </div>
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="doc-preview" src={image} alt="Document to extract" />
        )}
        <button
          type="button"
          className="primary"
          disabled={!image || status === "reading" || disabled}
          onClick={extract}
        >
          {status === "reading" ? "Reading…" : "Read document"}
        </button>
        {message && <p className={status === "error" ? "error-text" : "muted"}>{message}</p>}
        {warnings.map((w) => (
          <p className="error-text" key={w}>
            {w}
          </p>
        ))}
      </div>

      <div className="intake-right">
        <form
          className="card intake-ai"
          onSubmit={(e) => {
            e.preventDefault();
            if (disabled || !draft.name.trim()) return;
            onCreate({ ...draft, name: draft.name.trim() });
          }}
        >
          <h3>Household facts</h3>
          <label>
            <span>Name {from("name")}</span>
            <input
              value={draft.name}
              required
              maxLength={80}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Full name"
            />
          </label>
          <div className="two">
            <label>
              <span>Household size {from("size")}</span>
              <input
                type="number"
                min={1}
                max={12}
                value={draft.size}
                onChange={(e) => set({ size: Math.min(12, Math.max(1, Number(e.target.value) || 1)) })}
              />
            </label>
            <label>
              <span>Annual income {from("income")}</span>
              <input
                type="number"
                min={0}
                value={draft.income ?? ""}
                onChange={(e) =>
                  set({ income: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })
                }
              />
            </label>
          </div>
          <div className="two">
            <label>
              Tenure
              <select value={draft.tenure} onChange={(e) => set({ tenure: e.target.value as Draft["tenure"] })}>
                <option value="renter">Renter</option>
                <option value="owner">Owner</option>
              </select>
            </label>
            <label>
              <span>ZIP code {from("zip")}</span>
              <input
                value={draft.zip}
                inputMode="numeric"
                pattern="\d{5}"
                maxLength={5}
                onChange={(e) => set({ zip: e.target.value.replace(/\D/g, "") })}
              />
            </label>
          </div>
          <label>
            Census tract
            <select
              value={draft.tract}
              onChange={(e) => set({ tract: e.target.value, ...energyFor(e.target.value) })}
            >
              {tracts.map(([id, t]) => (
                <option key={id} value={id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>Benefits received {from("benefits")}</legend>
            {benefitOptions.map((b) => (
              <label className="chip" key={b}>
                <input
                  type="checkbox"
                  checked={draft.benefits.includes(b)}
                  onChange={() => set({ benefits: toggle(draft.benefits, b) })}
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
                  checked={draft.deferrals.includes(d)}
                  onChange={() => set({ deferrals: toggle(draft.deferrals, d) })}
                />
                {d.replaceAll("_", " ")}
              </label>
            ))}
          </fieldset>
          <label className="inline">
            <input
              type="checkbox"
              checked={draft.certified}
              onChange={(e) => set({ certified: e.target.checked })}
            />
            LIHEAP certified in the last 12 months
          </label>
          <p className="muted">
            Estimated energy costs: {money(draft.annualEnergy)}/yr ({money(draft.annualElectric)} electric)
          </p>
          <button className="primary" disabled={disabled}>
            {disabled ? "Caseworker role required" : "Save household"}
          </button>
        </form>
        <div className="card">
          <h3>Results</h3>
          {preview
            .filter((r) => r.outcome !== "ineligible")
            .map((r) => (
              <div key={r.program.id} className="mini-result">
                <div className="row">
                  <b>{r.program.short}</b>
                  <span className={"badge " + r.outcome}>{r.outcome.replace("_", " ")}</span>
                </div>
                <CheckList checks={r.checks.filter((c) => !c.label.startsWith("  "))} />
              </div>
            ))}
          {preview.every((r) => r.outcome === "ineligible") && (
            <p className="muted">No programs match these facts yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
