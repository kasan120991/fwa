// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  // Private, authenticated internal tool — no SEO/SSR need. Running as an SPA
  // keeps auth simple: route middleware runs client-side on first load, after
  // the session has been resolved from the API's httpOnly cookie.
  ssr: false,

  app: {
    head: {
      // Shared FWA app-icon favicon (same as the marketing site): ink mark on a
      // citrine tile — holds contrast on light AND dark tabs, so one icon serves both.
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/fwa-app-icon-citrine.svg' }
      ]
    }
  },

  modules: [
    '@nuxt/eslint',
    '@nuxt/ui'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  // ONE brand family (Highlighter system). Explicit weights so 500/600 load
  // (auto-discovery would only fetch 400/700).
  fonts: {
    families: [
      { name: 'Geist', provider: 'google', weights: [400, 500, 600, 700] }
    ]
  },

  runtimeConfig: {
    public: {
      // Base URL of the FWA Ops API. Override with NUXT_PUBLIC_API_BASE.
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:4000/api'
    }
  },

  // Follows the OS by default; the top-bar toggle persists a manual override.
  colorMode: {
    preference: 'system',
    fallback: 'light'
  },

  compatibilityDate: '2026-06-30',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
