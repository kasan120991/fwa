# FWA v2 Logo Marks (Highlighter system)

The three mark treatments from the Brand Guide v2.1, Logo & Marks page:

| File | Treatment | Use |
| --- | --- | --- |
| `fwa-mark-ink.svg` | Bare mark, ink `#17181A` | On paper/linen — default |
| `fwa-mark-white.svg` | Bare mark, white | On ink/dark grounds |
| `fwa-tile-ink.svg` | Paper mark `#F0F0EC` on ink tile | On photos/busy grounds; dark contexts |
| `fwa-tile-citrine.svg` | Ink mark on citrine `#F2D318` tile | The app icon / favicon — the one place citrine carries the mark |

Each mark/tile also ships as a 1024×1024 transparent PNG (same filename, `.png`).

## Full horizontal lockup (mark + wordmark)

The full logo as used in email template headers, site nav, and the footer.
Same artwork as `website/public/fwa-logo-horizontal-*`.

| File | Treatment | Use |
| --- | --- | --- |
| `fwa-logo-horizontal-ink.svg` / `.png` (5579×1571) | Ink on transparent | Light grounds (paper/linen); print/source master |
| `fwa-logo-horizontal-white.svg` / `.png` (5579×1571) | White on transparent | Ink bands, email headers, dark contexts |
| `fwa-logo-horizontal-ink-672.png` · `-white-672.png` | 672×189 (@2x of the 336px web/email render) | Drop-in web/email size |

Rules (unchanged from the guide): monochrome only, never recolored, clear space = height of the
inner "F", mark alone below 24px. Tile corner radius is proportional (rx 180/1000 ≈ the 16px
band radius at icon scale). Same artwork as `website/public/fwa-app-icon-citrine.svg`.
