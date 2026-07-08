# Francis Web Agency — Brand & Design System

**Version 1.0** · `FWA-brand-and-design-system`

A teal-anchored, editorially restrained design system that serves both a marketing website and a business web app from one set of tokens. Derived from the Cohere web system — editorial Fraunces display serif over white canvas, deep teal product bands, warm sand neutrals, mono technical labels — reskinned around a single owned color (teal) and a warmer, friendlier voice.

> The defining move: **teal does double duty** — it is both the action color (buttons, links, focus) and the signature dark band color (`teal-900`) used for hero and product sections. Bands and buttons, never wallpaper.

## Sources

- **Brand & design system spec** — provided as structured notes (v1.0, `FWA-brand-and-design-system`). All tokens, voice, and component definitions in this system trace to that document.
- **Logo artwork** — delivered as SVG: `fwa-mark-ink.svg`, `fwa-mark-white.svg`, `fwa-logo-stacked-ink.svg`, `fwa-app-icon-deepteal.svg`, `fwa-app-icon-teal.svg`. Stored in `assets/`. White stacked + horizontal lockups were derived from these (see Iconography → Substitutions).
- No codebase or Figma file was provided; this system is authored from the brand spec.

## Who FWA is

Francis Web Agency builds websites and web apps that earn their keep — fast, well-designed, engineered to turn visitors into customers. FWA partners with startups, small businesses, and growing teams that want a serious online presence without the agency runaround.

**Value pillars:** Performance (speed is revenue) · Experience (clean, intuitive) · Visibility (SEO + structure) · Scalability (clean code that grows) · Partnership (a strategic, plain-spoken collaborator).

**Boilerplate (short):** Francis Web Agency designs and builds high-performing websites and custom web apps that help businesses grow.

**Tagline (recommended):** *Websites that grow the business.*

---

## CONTENT FUNDAMENTALS — how FWA writes

The voice is **professional, friendly, business savvy, and unmistakably modern** — a sharp peer who's easy to talk to and clearly knows the craft. The balance rule: **personality rides on top of competence, never instead of it.** Every relatable line is still backed by a concrete claim.

### Principles
- **Professional** — back claims with specifics. Credibility comes from concrete detail ("loads in under a second," "built to handle 10x your traffic"), not adjectives.
- **Friendly** — write like a helpful person, not a brochure. Contractions, plain words, "you." Warmth lives in the language, not in exclamation points.
- **Business savvy** — lead with outcomes (leads, credibility, growth, measurable results). Respect time and budget.
- **Modern & human** — plain-spoken, a little dry wit, zero corporate buzzwords. A capable peer, not a vendor or a hype account.

### Casing & person
- **Marketing site:** warm, confident, a little dry wit. Sentence case in UI labels; headlines can carry personality.
- **Product / app UI:** tight, functional, **sentence case**, zero filler. "Project saved", "Add a client", "Invoice sent", "New project".
- Address the reader as **"you."** FWA refers to itself as **"we."**
- **No emoji.** No exclamation hype, no ALL CAPS enthusiasm. (Uppercase is reserved for mono eyebrows, not emphasis.)

### Voice examples
- Hero: *"Websites that grow the business."* / sub: *"Fast, modern sites and web apps that turn visitors into customers — without the agency runaround."*
- On-voice: *"A pretty site that doesn't convert is just an expensive business card. Let's build one that pays for itself."*
- On-voice: *"No jargon, no ghosting, no surprise invoices."*
- App error (no apology, no "Error:", says what to do): *"Couldn't save your changes. Check your connection and try again."*
- Success toast: *"Project created"*

### Avoid
- **Corporate filler:** leverage, seamless, unlock, empower, cutting-edge, best-in-class, synergistic, simply, just.
- **Try-hard internet voice:** Gen-Z slang, meme phrasing ("this site? it's giving conversions"), emoji, exclamation spam.
- Self-deprecation that undercuts the work.
- The rule: if a sentence still makes sense with a word removed, remove it.

---

## VISUAL FOUNDATIONS

### Color vibe
Cool teal against warm sand is the system's signature contrast. White is the dominant field; **deep teal (`#073A34`) full-width bands** are the signature surface — used as hero/product/CTA moments, never as decorative wallpaper. Warm **sand (`#F1EEE7`)** blocks alternate with white for rhythm. The whole system pulls its energy from **one color family (teal)** so the marketing site and the app read as one brand. Imagery skews clean and bright, not moody — no heavy grain, no duotone.

### Type
Editorial **Fraunces** display serif (high optical size, weight ~470–500, negative tracking) for headlines over white. **Inter** for all body and UI. **JetBrains Mono**, uppercase with `0.6px` tracking, for eyebrows and technical labels ("OUR SERVICES", "CASE STUDY 01") — a signature device, used consistently but not flooded. Hierarchy comes from **size, weight, and surface contrast**, not many bold weights or color. One oversized headline per view, then settle into 16–22px UI copy.

### Spacing & layout
8px base scale (`2, 4, 8, 12, 16, 24, 32, 48, 64, 96`). Marketing uses generous vertical rhythm (`section` = 96px, up to 120px large). The app tightens to 16–24px gutters for density. Marketing container ~1200px; app ~1440px with a fixed **248px ink sidebar**. Global nav: logo left, links center, primary CTA right. Whitespace is a trust signal on the marketing site — large empty intervals separate claim, proof, services, CTA. Density only where it serves information (tables, forms, dashboards).

### Backgrounds
Flat color fields — **no gradients, no textures, no patterns, no hand-drawn illustration wallpaper.** Surface alternation (canvas → sand → teal band) does the work. Hero and case-study media sit as **rounded media cards (20–24px radius)** over a contrasting section, optionally overlapping a deep teal band.

### Elevation & depth
**Mostly flat.** Depth comes from surface alternation, rounded media, and hairline borders — *not* shadows. Levels: Flat (no shadow) → Bordered (`1px hairline`) → Media lift (rounded media over a contrasting section) → Deep band (full-width `teal-900`) → Soft shadow (`0 1px 2px rgba(18,24,23,.06)`, **app popovers/dropdowns/modals only**). Never stack multiple floating layers or add heavy drop shadows to cards.

### Corner radii
`xs 4` (inputs, chips, table inner) · `sm 8` (small media, badges) · `md 12` (buttons non-pill, app cards, inputs) · `lg 16` (service/product cards, panels) · `xl 24` (deep bands, contact-form card, hero containers) · `pill 9999` (CTA buttons, status chips, filter pills). Don't drop major media below 12px.

### Borders
**Hairline (`#E4E6E2`)** is the default rule/divider/card border. **Border-strong (`#D7DAD6`)** for outlined buttons and hover/emphasis. Borders + surface contrast replace shadow as the primary separation device.

### Buttons & states
- **Primary** — teal pill (`action #0B7F70` fill, white label, pill radius, 12×22px). One highest-priority action per view. **Hover → `action-hover #0A6358`** (color darken, no shadow). Press → same darker step; no scale-bounce in the app.
- **Secondary** — outlined pill (transparent, `border-strong` 1px, ink label). Hover darkens the border/fills faint teal-50.
- **Text** — plain teal link for tertiary/inline actions.

### Animation
Restrained. Short, functional transitions — color/opacity fades on hover (~120–180ms ease), gentle reveals. **No bounces, no parallax, no infinite decorative loops.** Motion serves clarity, not spectacle.

### Focus & accessibility
Focus ring is **`focus-ring #25BBA4` at 2px with 2px offset**, visible on every interactive element. Primary action fill `teal-600` clears AA (~4.9:1) for white text; `teal-500` is large-text/accent only. `muted` is for metadata and larger labels, not primary small copy.

### Transparency & blur
Used sparingly — the modal scrim (`rgba(18,24,23,.45)`) and occasional scrim behind a logo over imagery. No frosted-glass everywhere.

### Cards
Flat, rounded, **bordered not shadowed.** Service cards: white, 16px radius, thin-line icon, Heading-3 title, body, text link. Product/pricing cards: warm sand, 16px radius. Stat cards: white, 16px radius, `1px hairline`. App cards: 12–16px radius.

---

## ICONOGRAPHY

- **Icon system:** **Lucide** (CDN) — thin-line, 1.5–2px stroke, rounded joins. This matches the spec's repeated "thin-line icon" language for service cards and empty states. No icon font or sprite was provided in the brand assets, so Lucide is used as the closest-matching open set. **(Substitution — flagged. Swap for a provided set if FWA has one.)** Load via `https://unpkg.com/lucide@latest`.
- **Logo / mark:** The FWA mark is a geometric "F" inside a square frame — reads as both an F and a browser window. Monochrome by design: keep it **ink (`#121817`)** or **white**, never recolored. Three forms — horizontal lockup, stacked lockup, and mark alone (favicons, app sidebar, tight spaces). App icon = mark reversed white on a rounded teal tile.
- **Emoji:** **Never.** Not in marketing, not in UI.
- **Unicode glyphs as icons:** avoid; use Lucide. Checkmarks in pricing rows use Lucide `check`.

### Logo usage
- Clear space = height of the inner "F" on all sides. Lockup ≥ 120px wide; mark ≥ 24px (below that, mark alone).
- Don't recolor, stretch, rotate, add shadows/effects, or place on busy imagery without a solid/scrimmed backing.

### Assets in `assets/`
`fwa-mark-ink.svg` · `fwa-mark-white.svg` · `fwa-logo-stacked-ink.svg` · `fwa-logo-stacked-white.svg` · `fwa-logo-horizontal-ink.svg` · `fwa-logo-horizontal-white.svg` · `fwa-app-icon-deepteal.svg` · `fwa-app-icon-teal.svg`

> **Substitutions (flagged):** the horizontal lockups (`fwa-logo-horizontal-ink.svg`, `fwa-logo-horizontal-white.svg`) are the official delivered vector artwork. The white stacked logo was derived from the provided ink mark + a Fraunces-set wordmark (the original stacked white lockup was named as a PNG in the spec but not delivered). If FWA has the official locked artwork, replace it. Lucide stands in for an unspecified icon set.

---

## INDEX — what's in this project

**Foundations**
- `styles.css` — global entry (imports only). Link this one file.
- `tokens/colors.css` · `tokens/typography.css` · `tokens/spacing.css` · `tokens/fonts.css`
- `guidelines/*.html` — foundation specimen cards (Design System tab: Type, Colors, Spacing, Brand).

**Components** (`components/`) — reusable React primitives, each `Name.jsx` + `Name.d.ts` + `Name.prompt.md`:
- `core/` — Button, Eyebrow, Badge, StatusChip, Card, Input, StatCard
- See each directory's `*.card.html` for live specimens.

**UI kits** (`ui_kits/`)
- `marketing/` — Francis Web Agency homepage (hero, services, deep-teal band, pricing, footer).
- `app/` — FWA web app shell (ink sidebar, dashboard, stat cards, data table, status chips).

**Assets** (`assets/`) — logos, marks, app icons (see Iconography).

**`SKILL.md`** — Agent-Skill manifest for downloadable use.

---

## Do / Don't (quick reference)

**Do:** default to white canvas; use deep teal bands + sand blocks for rhythm; teal pills for primary CTAs; uppercase mono eyebrows as the section-labeling device; tight display type with negative tracking; hairline borders + surface contrast for depth; quiet sentence-case app copy.

**Don't:** turn teal into decorative background; add heavy drop shadows or stacked floating layers; make every section a card; force hierarchy with heavy bold weights; mix success green into brand moments; use marketing's big personality in error messages or app labels.
