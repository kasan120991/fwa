# FWA Rebrand — System Spec v1.1

**System:** Highlighter (né "Highlighter · Space" — mono retired in review, 2026-07-26)
**Status:** adopted, calibrated through homepage review
**Scope:** everything needed to build in the new identity — marketing site (`website/`) and ops
app (`app/`). Parallel to the live deep-teal system until adoption; nothing live is modified.

---

## 1. Color

### 1.1 Core — light (default)

| Token | Value | Use |
| --- | --- | --- |
| `paper` | `#FCFCFA` | Page ground. The brand's dominant field. |
| `surface` | `#FFFFFF` | Raised surfaces where needed (cards on tinted areas, popovers). |
| `ink` | `#17181A` | Text, primary buttons, the dark band. |
| `ink-soft` | `#33353A` | Primary button hover, secondary emphasis. |
| `muted` | `#55585C` | Body copy on marketing, secondary text. |
| `meta` | `#797D82` | Metadata, labels, timestamps. Not for primary small copy. |
| `line` | `#E3E4E1` | Hairline borders, dividers — the default separation device. |
| `line-strong` | `#C9CBCE` | Outlined buttons, hover borders, emphasis rules. |
| `linen` | `#F4F2EB` | Warm alternating section surface + soft card fill (calibrated 2026-07-26 — replaces all-paper flatness; sections breathe paper → linen → ink moment). |
| `citrine` | `#F2D318` | THE accent. Highlighter sweeps, 2px rules, hover floods, active markers. |

### 1.2 Core — dark

Derived, not inverted naively. Ground shifts to warm-neutral near-black; citrine is unchanged
(it pops harder on ink, and one accent across both themes keeps the brand singular).

| Token | Value | Use |
| --- | --- | --- |
| `paper` | `#131417` | Page ground. |
| `surface` | `#1B1C20` | Cards, panels, popovers. |
| `ink` | `#F0F0EC` | Text. (The roles invert; the *names* stay semantic.) |
| `ink-soft` | `#D6D6D1` | Solid-button hover. |
| `muted` | `#B0B3B0` | Secondary text. |
| `meta` | `#8C9096` | Metadata, labels. |
| `line` | `#2C2D32` | Hairlines. |
| `line-strong` | `#43454B` | Outlined buttons, emphasis. |
| `citrine` | `#F2D318` | Unchanged. Sweeps carry `#17181A` text on both themes. |

### 1.3 Semantic (status) colors

Citrine is brand, not status — so **warning is orange, never yellow**, to keep the two
unmistakable. Each status has a solid (text/icon), a tint (chip/badge background), and a dark-mode
solid.

| Status | Solid (light) | Tint (light) | Solid (dark) | Use |
| --- | --- | --- | --- | --- |
| Success | `#1E7A4E` | `#E2F1E8` | `#5BBE8E` | Paid, active, passed, online |
| Warning | `#B45D0E` | `#F8ECDD` | `#E09A50` | Overdue soon, degraded, attention |
| Error | `#B3362B` | `#F7E4E2` | `#E37B72` | Failed, overdue, down |
| Info | `#3563A4` | `#E4EBF5` | `#7FA3D7` | Neutral notices, in-progress |

Tinted chips carry the solid as text (AA on their tints). Semantic colors never appear in brand
moments (heroes, bands, marketing CTAs).

### 1.4 Rules

- **Citrine is never a text color.** Backgrounds, rules, and fills only; text on citrine is
  always `ink (#17181A)` — on both themes.
- **Citrine is scarce.** Sweep on the honest clause, 2px rules, hover floods, active markers.
  If citrine stops being the rarest thing on the page, it stops working.
- **One ink band per page** (marketing). One solid button per view (see Components).
- Depth comes from hairlines and surface contrast, not shadows (exception: popovers, §4).

## 2. Typography

**One family: Geist.** (Space Mono was the original utility voice; retired 2026-07-26 — in
review it read "technical" at any dosage. The utility roles survive as Geist treatments.)

- **Display/body:** 700 display (tracking −0.03em), 600 headings/buttons (−0.015em), 400 body.
- **Utility roles (ex-mono):** eyebrows + metadata strips = Geist 600, UPPERCASE, +0.08em
  tracking, meta gray. Stat numerals = Geist 700 with `font-variant-numeric: tabular-nums`.

### 2.1 Scale

| Role | Face / weight | Size | Notes |
| --- | --- | --- | --- |
| Display XL | Geist 700 | clamp(40–74px) | Hero only. −0.03em, lh 1.05, `text-wrap: balance` |
| Display | Geist 700 | 32–40px | Section heads. −0.028em |
| H3 | Geist 600 | 20px | Card titles. −0.015em |
| Body L | Geist 400 | 17–18px | Marketing body. lh 1.6 |
| Body | Geist 400 | 15–16px | App default. lh 1.55 |
| Small | Geist 400 | 13–14px | Helper text, table cells secondary |
| Eyebrow / label | Geist 600 | 10–12px | UPPERCASE, +0.08em |
| Stat numeral | Geist 700 | 20–32px | `tabular-nums` for column alignment |
| Metadata strip | Geist 600 | 10–11px | UPPERCASE, +0.06em, lh 1.9 |

### 2.2 Utility type in dense UI (post-mono rules)

- Eyebrows/labels: Geist 600, UPPERCASE, +0.08em, ≥10px, meta gray.
- Values in tables (IDs, dates, money): Geist 600–700 with `tabular-nums` so columns align;
  words stay Geist 400. The value/word distinction survives the mono retirement.
- If a screen feels like a terminal, labels are over-tracked or over-uppercased — dial back.

## 3. Spacing & layout

- **8px base scale** (unchanged): `2, 4, 8, 12, 16, 24, 32, 48, 64, 96`.
- **Marketing:** container 1120px; section rhythm 56–96px; whitespace remains a trust signal.
- **App:** container ~1440px; 16–24px gutters; sidebar 248px (see §6).

## 4. Radii, borders, elevation

- **Radii (calibrated 2026-07-26 — Kasan: squared read too technical):** `4` (chips, tags) ·
  `8` (buttons, inputs) · `12` (cards, panels) · `16` (bands, large media, modals). **Still no
  pills** — softened, not round.
- **Borders:** `line` hairline is the default separator; `line-strong` for outlined controls and
  hover emphasis.
- **Elevation:** flat → hairline border → surface contrast → ink band. Shadow only on
  popovers/dropdowns/modals: `0 4px 16px rgba(23,24,26,.08)` (light) / `0 4px 16px rgba(0,0,0,.4)`
  (dark). Never on cards — **one exception (calibrated 2026-07-26): the featured pricing card**
  (white, 1px ink border, 4px citrine top edge, raised −12px, soft ambient
  `0 1px 2px rgba(23,24,26,.05), 0 18px 44px rgba(23,24,26,.10)`). Exactly one per pricing view.

## 5. Components

### 5.1 Buttons — the hierarchy rule

**The solid button speaks once per view.** Everything else is marked, not shouted.

| Tier | Style | Hover |
| --- | --- | --- |
| Primary | Solid ink, paper text, 8px, 14×28px (13×22 app) | `ink-soft` |
| Secondary | 1px `line-strong` outline, ink text, 8px | Citrine flood (`background: citrine; border-color: citrine`) |
| Text CTA | Ink text 600 + 2px citrine underline | Citrine flood |

Dark mode: primary becomes solid paper with ink text (the "solid" role inverts); secondary and
text CTA keep their logic with dark-ramp tokens; citrine floods unchanged.

### 5.2 Links (inline)

Body links: ink, 1px underline in `line-strong`; hover switches the underline to 2px citrine.
Never bare color-only links.

### 5.3 Cards

Hairline border or linen fill, 12px radius, 24–28px padding, flat. No index tags (S-NN /
Step-NN retired 2026-07-26 — numbers only where they carry meaning: prices, timelines, real
case-study IDs). Hover (when interactive): border → ink. No shadow, no lift.

### 5.4 Status chips (app)

4px radius, tint background + solid text (§1.3), Title Case per app casing rules, 11–12px Geist 600. Examples: Paid / Overdue / Draft / Active.

### 5.5 Inputs

8px radius, hairline border, paper ground; focus = 2px ink ring (§7), never citrine. Labels:
Title Case, Geist 600 13px. Placeholder: `meta`.

### 5.6 Stat cards

Hairline card; label in Geist 600 uppercase 10–11px `meta`; value Geist 700 `tabular-nums` 24–28px ink;
delta in semantic solid; **2px citrine top rule** as the signature.

### 5.7 Tables

Hairline row separators only (no zebra). Header: Geist 600 uppercase 10px `meta`. ID/date/money
columns Geist 600–700 `tabular-nums`; word columns Geist 400. Row hover: `#F6F6F3` (light) / `surface` (dark).

### 5.8 Eyebrows & metadata strips

Eyebrow: Geist 600 uppercase, `meta` on paper, citrine-free (scarcity). Metadata strip:
the `CS-004 · LAUNCHED 02/2026 · LCP 0.8S` device — Geist 600 uppercase 10–11px `meta`, interpunct-
separated. Use on case studies, project headers, invoice/document headers.

## 6. App-UI translation (ops app)

- **Sidebar:** ink `#17181A` panel, paper text, 248px. Active item: **3px citrine left rule** +
  paper text (inactive: `#B0B3B0`). No filled active pill — the rule is the marker.
- **Top bar:** paper, hairline bottom; page title Geist 600; global actions follow button tiers.
- **The one-solid-button rule maps to app views:** the page's single main action (e.g. "New
  Invoice") is solid ink; toolbar/secondary actions are outlined or text tier.
- **Casing rules carry over unchanged** (Title Case chrome / sentence-case prose).
- **Status chips** replace the current teal-era chips per §5.4; semantic ramp per §1.3.
- **Charts:** ink line on paper, citrine only to mark *the* highlighted series/point; semantic
  colors for status series. Grid: `line`. (Dataviz keeps its own accessibility rules.)
- **Dark mode** is first-class in the app (ramp §1.2); marketing site ships light-only — the
  near-white ground is the brand.

## 7. Motion, focus, accessibility

- **Motion:** 120–180ms ease on color/border/background. Citrine floods are instant-feeling
  (≤150ms). No bounces, no parallax, no scale effects. `prefers-reduced-motion` honored.
- **Marker motion (added 2026-07-26, homepage lock):** the signature interactive device — the
  citrine stroke *paints* across text via `background-size` 0→100%, .45s
  `cubic-bezier(.22,.61,.36,1)`, fired once per element (hover or scroll-entry). Used for: the
  services spotlight (active name), painted prices (active tier). Reduced-motion: render the
  final painted state, skip the animation. Max one interactive signature per section.
- **Focus:** 2px ink ring, 2px offset (dark: paper ring). Citrine fails non-text contrast on
  paper (≈1.6:1) — it is never the focus indicator.
- **Contrast:** ink/paper ≈ 17:1. `muted` ≈ 7.5:1. `meta` ≈ 4.9:1 — fine at 12px+, not for
  primary small copy. Citrine sweep + ink text ≈ 12:1. Semantic solids clear AA on their tints.

## 8. Logo & marks

- The geometric-F mark survives unchanged — it was already monochrome ink/white, which is now
  even more on-system. Clear-space and sizing rules carry over from the v1 brand guide.
- **App icon (proposal):** ink mark on a **citrine 4px-radius tile** — the one place citrine may
  carry the mark. Alternative: white mark on ink tile. Decision open.
- Never recolored, stretched, or shadowed. On photography: solid ink or paper backing block.

## 9. Migration map (old → new)

| Old (deep-teal system) | New |
| --- | --- |
| `teal-900 #073A34` bands | Ink `#17181A` band (max one per page) |
| `action #0B7F70` buttons/links | Ink solid / citrine-marked text CTAs |
| Fraunces display | Geist 700 |
| Inter body/UI | Geist 400/600 |
| JetBrains Mono eyebrows | Tracked-uppercase Geist 600 (mono retired) |
| Sand `#F1EEE7` blocks | Retired — hairlines + whitespace do the rhythm |
| Pill radii | 4px squared |
| Focus `#25BBA4` | 2px ink ring |
| Teal app-icon tile | Citrine tile (proposed) |

**Adoption order:** marketing site first (`website/`, own repo/rules), then ops app + portal
(needs dark ramp + chips + sidebar swap), then PandaDoc/PDF templates.
