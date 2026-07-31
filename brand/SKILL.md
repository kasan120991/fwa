---
name: fwa-design
description: Use this skill to generate well-branded interfaces and assets for Francis Web Agency (FWA), either for production or throwaway prototypes/mocks/etc. Serves the Highlighter brand system (ink/paper/citrine, Geist) — essential design guidelines, colors, type, fonts, logos, and voice.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files. For any
non-trivial visual work, also read `rebrand/system-spec.md` (the full calibrated spec) and, for
copy, `voice-guide.md`.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick map
- `readme.md` — the working brand guide (Highlighter summary, voice essentials, index).
- `rebrand/system-spec.md` — the FULL spec (source of truth: color, type, components, motion).
- `voice-guide.md` — the writing playbook (problem-first, specific, honest).
- `styles.css` — global entry; link this one file to get all tokens + fonts (`@import`s `tokens/`).
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `fonts.css` (CSS custom properties).
- `rebrand/logos/` — canonical marks/lockups/tiles (citrine tile = app icon/avatar).

## The one rule to remember
**Citrine (`#F2D318`) is never a text color and never wallpaper** — it's the scarce marker sweep, 2px rule, or hover flood, always carrying ink (`#17181A`) text. Ink on paper dominates; linen sections and ONE ink band per page make the rhythm; ONE solid ink button per view; Geist only; radii 4/8/12/16 with no pills; hairlines over shadows.
