// Francis Web Agency — Nuxt UI semantic color mapping + component defaults
// Target: app/app.config.ts   (Layer 2 of 2; reactive at runtime, HMR)
// v2 — the Highlighter system: primary action = ink (citrine is never an
// action color; it lives in hand-placed rules/markers, not the semantic map).
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'ink',       // solid buttons/links are ink (shade pinned in main.css)
      neutral: 'ink',       // drives text / bg / border tokens
      success: 'success',   // #1E7A4E
      info: 'info',         // #3563A4
      warning: 'warning',   // #B45D0E — orange, never yellow (citrine is brand)
      error: 'error',       // #B3362B
      // Single-accent system: "secondary" actions are neutral/outlined.
      secondary: 'ink'
    },

    // 8px buttons (via --ui-radius), semibold label — no pills in Highlighter
    button: {
      slots: { base: 'font-semibold' },
      defaultVariants: { color: 'primary', variant: 'solid', size: 'md' }
    },

    // Cards: 12px radius, hairline ring, ink headers
    card: {
      slots: {
        root: 'rounded-card ring ring-default',
        header: 'font-semibold text-highlighted',
        footer: 'border-t border-default'
      }
    },

    input: { defaultVariants: { size: 'lg' } }
  }
})
