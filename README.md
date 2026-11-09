# Threshold

**Verify once. See every program.** An eligibility workbench for six Washington, DC energy programs, built on public data, deterministic rules, and the Claude API.

Live: https://threshold-hazel.vercel.app

## What it shows

| View | What you can do |
| --- | --- |
| Overview | Households, verified share, eligible-but-not-contacted gap, modeled savings |
| Energy map | DOE LEAD energy burden for 204 DC census tracts; click a tract to filter the queue |
| Households | Search, filter by outcome, export CSV, open a household |
| Household | Per-program decision with every rule check, Claude explanation, facts and their sources, program sequence, history |
| Intake | Generate a fictional pay stub, utility bill, or benefit letter (or upload one); Claude reads it; you review; the rules decide live |
| Pipeline | Move households through enrollment stages; submission is blocked until facts are verified |
| Programs & rules | Change any fact and watch all six rules re-evaluate; load the test cases |
| Activity | SHA-256 hash-chained log with one-click verification and a tamper demo |

Roles (caseworker, program admin, auditor) change navigation and permissions. Auditors see masked names and cannot edit.

## How AI is used, and where it is not

```
Document image ──► Claude Haiku (forced tool output) ──► zod validation ──► review form
                                                                              │ caseworker confirms
Household facts ───────────────────────────────────────────────────────► rules engine ──► decision + checks
                                                                                              │
                                                     Claude Haiku explains the checks ◄───────┘
                                                     (numbers verified against the checks)
```

- **Claude never decides eligibility.** `src/lib/engine.ts` evaluates every program with three-valued logic (met, not met, unknown) and records each check.
- **Extraction** uses a single forced tool (`record_extraction`) whose schema is the zod schema in `src/lib/extraction.ts`. Text in the image is treated as data. Income is annualized by code, not by the model. Images are processed in memory and never stored.
- **Explanations** are checked: every number in Claude's answer must appear in the rule checks, or the app shows a plain rules summary instead.
- **The server recomputes** the decision before explaining it; the browser never supplies an outcome.

## Data

Real public data for the map and limits; synthetic households sampled from the real tract distributions. See [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

- 2026 HHS poverty guidelines; DC 60% state median income (LIHEAP FFY2027); DC 80% AMI (DCSEU)
- DOE LEAD Tool 2022 tract data (CC BY 4.0) and 2022 Census cartographic tracts

## Security

- Anthropic key is server-only (`server-only` import, CI check that no client file references it)
- Per-IP rate limit (12/min) and spend reservations against daily caps ($3 global, $0.40 per IP) in Upstash Redis before any model call
- Same-origin check, streamed body size caps, zod validation, PNG/JPEG magic-byte check on uploads
- CSP, HSTS, COOP/CORP, frame denial, no `X-Powered-By`
- Tracked-file guard in CI blocks secrets and local planning files

## Run locally

    pnpm install
    pnpm dev

Optional env for AI features: `ANTHROPIC_API_KEY`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`. Without them the app works and AI buttons return a clear "unavailable" message.

    pnpm test          # rules, traces, extraction mapping, audit chain
    pnpm data:build    # rebuild tract data from the public downloads

## Scope

This is a prototype. Records live in the browser. What production needs, and what it does not, is in [docs/HANDOFF.md](docs/HANDOFF.md).

Independent prototype. Not affiliated with any agency, utility, or nonprofit named here. All household records are synthetic.

## Credits

UI components adapted from ObsidianUI (MIT). Data: U.S. DOE LEAD Tool 2022 (Ma & Vimont, 2024), CC BY 4.0, doi:10.25984/2504170.
