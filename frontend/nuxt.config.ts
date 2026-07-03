// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  // Private, authenticated internal tool — no SEO/SSR need. Running as an SPA
  // keeps auth simple: route middleware runs client-side on first load, after
  // the session has been resolved from the API's httpOnly cookie.
  ssr: false,

  modules: [
    '@nuxt/eslint',
    '@nuxt/ui'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    public: {
      // Base URL of the FWA Ops API. Override with NUXT_PUBLIC_API_BASE.
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:4000/api'
    }
  },

  // Light-first per the brand; flip `preference` to 'system' to enable auto dark.
  colorMode: {
    preference: 'light',
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
