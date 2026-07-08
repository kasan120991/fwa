// Francis Web Agency — Nuxt UI semantic color mapping + component defaults
// Target: app/app.config.ts   (Layer 2 of 2; reactive at runtime, HMR)
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'teal',      // brand teal ramp (action shade tuned to 600 in main.css)
      neutral: 'ink',       // warm-cool slate; drives text / bg / border tokens
      success: 'success',   // #1F9D57
      info: 'info',         // #2D6FE0
      warning: 'warning',   // #E2A032
      error: 'error',       // #D14B3D
      // We run a single-accent system: "secondary" actions are neutral/outlined
      // (per the design system), so secondary maps to the neutral ink ramp.
      // Add a warm accent later by defining its ramp and remapping here.
      secondary: 'ink'
    },

    // Pill buttons, semibold label — matches the brand button spec
    button: {
      slots: { base: 'rounded-full font-semibold' },
      defaultVariants: { color: 'primary', variant: 'solid', size: 'md' }
    },

    // Cards: 16px radius, hairline ring, ink headers
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
