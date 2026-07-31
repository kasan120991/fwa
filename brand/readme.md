# Francis Web Agency — Brand & Design System

**System: "Highlighter" · v1.1** · adopted 2026-07 · live everywhere (marketing site, ops app, portal, emails)

Ink on near-white paper, one bold sans (Geist), and a single citrine highlighter stroke used
like a marker on the page. Warm linen sections and one ink band per page do the rhythm; hairlines
do the depth. (The v1 deep-teal/Fraunces identity is retired and deleted.)

> **Source of truth:** `rebrand/system-spec.md` (full calibrated spec) + `voice-guide.md`
> (writing playbook). This readme is the working summary; when in doubt, read the spec.

## The one rule to remember

**Citrine (`#F2D318`) is never a text color and never wallpaper.** It appears as the marker
sweep on the honest clause, 2px rules, hover floods, and active markers — and text on citrine is
always ink. If citrine stops being the rarest thing on the page, it stops working.

## Who FWA is

Francis Web Agency builds websites and web apps that earn their keep — revenue infrastructure,
not brochures. Positioning: **"Growth Engine"** — sold on outcomes and ROI, for startups and
small businesses (home base: Valdosta / south Georgia). Services: marketing websites, custom web
apps, the AI receptionist, and SEO.

**Tagline:** *Your site should pay for itself.* (display contexts only; citrine sweep on
"pay for itself").

**The solo advantage:** the person you talk to is the person who builds it. Use it.

## CONTENT FUNDAMENTALS — how FWA writes

Full playbook: **`voice-guide.md`**. The short version: a sharp, plain-spoken peer who leads
with the reader's problem, backs every claim with a specific, and tells the truth even when it
costs the sale.

- Open on the reader's problem, not FWA's résumé.
- Specificity is the proof: "loads in under a second," "live in 4–6 weeks" — never "high-quality."
- Honesty as positioning: say when a refresh beats a rebuild.
- Dry wit, landed once per section. No emoji, no exclamation hype, no corporate filler
  (*leverage, seamless, unlock, empower, cutting-edge…*).
- Verifiable claims only — no fabricated stats.

**Casing (app UI):** Title Case for interface chrome (nav, titles, field labels, buttons,
chips); sentence case for prose, helper text, and toasts. `titleCase()` helper:
`server/src/utils/text.js`. Acronyms/codes keep their casing (SR-001, PDF, AI Receptionist).

## VISUAL FOUNDATIONS (condensed from `rebrand/system-spec.md`)

- **Color:** paper `#FCFCFA` ground · ink `#17181A` text/buttons/band · linen `#F4F2EB`
  alternating sections · citrine `#F2D318` accent (see the one rule) · muted `#55585C` body ·
  meta `#797D82` labels · line `#E3E4E1` hairlines. Dark ramp exists for the app only; the
  marketing site ships light-only. Warning is orange, never yellow.
- **Type:** ONE family — **Geist**. Display 700 (−0.03em, hero clamp 40–74px), headings 600
  (−0.015em), body 400. Ex-mono utility roles = Geist 600 UPPERCASE +0.08em in meta gray
  (eyebrows, metadata strips like `CS-004 · LAUNCHED 02/2026 · LCP 0.8S`); stat numerals
  Geist 700 `tabular-nums`. Mono itself is retired — it read "technical."
- **Spacing:** 8px scale; marketing container 1120px, sections 56–96px; app 1440px, 248px sidebar.
- **Radii:** 4 chips · 8 buttons/inputs · 12 cards · 16 bands/modals. **No pills.**
- **Elevation:** flat → hairline → surface contrast → ink band. Shadow only on
  popovers/dropdowns/modals — plus exactly one featured pricing card per pricing view.
- **Buttons:** the solid ink button speaks **once per view**; secondary = outline with citrine
  flood on hover; text CTA = ink 600 with 2px citrine underline. Dark ground: solid inverts to paper.
- **Structure:** one ink band per page (marketing). No index labels on content (S-01 / Step-02
  retired — numbers only where they mean something: prices, timelines, real IDs).
- **Motion:** 120–180ms color/border fades; the signature is the **marker paint** — citrine
  sweeps across text once (0.45s) on hover or scroll-entry. Max one per section. No bounces.
- **Focus:** 2px ink ring, 2px offset (paper ring in dark). Never citrine.

## LOGOS & MARKS

Canonical artwork: **`rebrand/logos/`** (see its README). The geometric-F mark is unchanged,
monochrome only: ink on paper/linen, white on ink. **App icon / avatar = ink mark on the citrine
tile** (`fwa-tile-citrine.svg`) — the one place citrine carries the mark. Horizontal lockups for
nav/email headers. Never recolored, stretched, or shadowed. Icons in product UI: Lucide
thin-line, 1.5–2px stroke. No emoji, ever.

## INDEX — what's in this folder

- `rebrand/system-spec.md` — the full calibrated spec (source of truth)
- `rebrand/brand-foundation.md` · `rebrand/brand-directions.md` — strategy + direction rationale
- `rebrand/logos/` — canonical mark/lockup/tile artwork (SVG + PNG)
- `rebrand/insights-covers/` — article cover template + exports
- `rebrand/pdfs/` — Brand Guide / Design System / Website Copy v2 PDFs
- `voice-guide.md` — the writing playbook
- `tokens/` + `styles.css` — CSS custom properties on the Highlighter values (link `styles.css`
  for prototypes)

## Do / Don't (quick reference)

**Do:** default to paper; linen sections and one ink band for rhythm; one solid ink button per
view; citrine only as sweep/rule/flood with ink text; Geist everywhere; hairlines over shadows;
tracked-uppercase Geist eyebrows in meta gray; Title Case chrome / sentence-case prose.

**Don't:** citrine text, citrine focus rings, citrine wallpaper; pills; drop shadows on cards;
index labels on content rows; more than one ink band per page; mono fonts; emoji; corporate
filler; fabricated stats.
