# Handoff: from prototype to production

This document separates what the prototype proves from what a production team must build. Effort: S (days), M (1–3 weeks), L (a month or more).

## What the prototype proves

1. **Rules as code work for these programs.** Six DC programs, including categorical eligibility (LIHEAP certification, qualifying benefits), a greater-of limit (200% FPG vs 60% SMI), and pre-weatherization gating, fit a small deterministic engine with readable checks. 25 tests cover the published income tables for sizes 1–9 and the edge cases.
2. **Missing data should be "unknown," not "no."** Three-valued logic lets the app say "needs income" instead of wrongly denying, and still approve on a categorical path when income is missing.
3. **Claude is useful at the edges, not the center.** Reading documents into a fixed schema and explaining a decision in plain language both work with Haiku at well under a cent per call. The decision itself stays in code.
4. **Explanations can be checked mechanically.** Rejecting any explanation that introduces a number not present in the rule checks is cheap and catches the most damaging failure.
5. **Real public data is enough to target outreach.** LEAD tract-level energy burden highlights where eligible households are likely concentrated before any household data exists.

## Essential for production

| Item | Why | Effort |
| --- | --- | --- |
| Server-side records (Postgres) with per-organization scoping | Records currently live in the browser | M |
| Real identity and role enforcement on the server | Roles are enforced in the client only | M |
| Audit log written server-side in the same transaction as each change | The browser chain proves the method, not the custody | S |
| Rule versioning with effective dates and approval | Limits change every year (HHS in January, LIHEAP SMI in October, HUD in spring) | M |
| Verified income sources (agency data-sharing, payroll APIs) where agreements exist | Documents are a fallback, not the goal of "verify once" | L |
| Consent records per data-sharing purpose, revocable | Required before sharing one verification across programs | S |
| Data retention and deletion policy for documents and extracted fields | Regulated data | S |
| Program staff review of every rule and assumption | Two programs are modeled assumptions today | S |
| Accessibility audit and translations reviewed by native speakers (Spanish, Amharic) | Households served | M |

## Not essential, or drop

- The tamper demo button (keep verification, remove the demo).
- Synthetic document generator (keep for staff training only).
- Per-browser sandboxes (replace with seeded staging environments).

## Open questions for program staff

1. Which agencies will accept another program's verification, and for how long (DOEE accepts LIHEAP eligibility from the past year for Solar for All; others?)
2. Who is the system of record for household size when documents disagree?
3. What evidence is required for "responsible for energy costs" when the account is in another name?
4. Do deferral conditions need inspector confirmation before routing to repair?
5. What should a caseworker see when a household is eligible but funding is exhausted?

## Cost

Measured design target: extraction about $0.0006 and explanation about $0.0002 per call on Claude Haiku 5.5. Daily caps hold total spend under $90/month even under sustained use.
