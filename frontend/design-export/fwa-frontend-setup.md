# FWA — frontend setup (Tailwind CSS v4 + Nuxt UI v4)

This wires the Francis Web Agency design system into a **Tailwind CSS v4** + **Nuxt UI v4** project. It's CSS-first — there is **no `tailwind.config.js`**. Everything lives in two files:

- **`app/assets/css/main.css`** — Layer 1, the raw design tokens (`@theme`): fonts, the full color ramps, the type scale, spacing, radius.
- **`app/app.config.ts`** — Layer 2, the semantic mapping that tells Nuxt UI which ramp is `primary`, `neutral`, `success`, etc. This layer is reactive at runtime (HMR), so you can retheme without a rebuild.

Files in this drop: `fwa-main.css`, `fwa-app.config.ts`, `fwa-nuxt.config.ts`.

## Install

```bash
npx nuxi module add ui          # adds @nuxt/ui v4 (bundles Tailwind v4, @nuxt/fonts, icons, color-mode)
```

Then place the files:

| This file | Goes to |
|---|---|
| `fwa-main.css` | `app/assets/css/main.css` |
| `fwa-app.config.ts` | `app/app.config.ts` |
| `fwa-nuxt.config.ts` | merge into your `nuxt.config.ts` |

Wrap your app in `<UApp>` (required for toasts, tooltips, overlays):

```vue
<!-- app/app.vue -->
<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
```

## How our tokens map to Nuxt UI

The nice part: our neutral **ink** ramp lines up with Nuxt UI's semantic tokens almost exactly, so the system "just works" with Nuxt UI components.

| Nuxt UI utility | Resolves to | In our system |
|---|---|---|
| `bg-default` | white | Canvas |
| `bg-muted` | `ink-50` (#F6F7F6) | Cloud (app background) |
| `bg-elevated` | `ink-100` | Raised surface |
| `bg-accented` | `ink-200` (#E4E6E2) | Hairline-filled chip |
| `bg-inverted` | `ink-900` (#121817) | **Ink — app sidebar / footer** |
| `text-default` | `ink-700` (#4A5654) | Body copy |
| `text-highlighted` | `ink-900` (#121817) | Headings / ink |
| `text-muted` | `ink-500` (#8A9794) | Metadata |
| `border-default` | `ink-200` (#E4E6E2) | Hairline |
| `border-accented` | `ink-300` (#D7DAD6) | Border-strong |
| `text-primary` / `bg-primary` | `teal-600` (#0B7F70) | **Action teal** (AA with white) |
| `text-success` / `bg-success` | `#1F9D57` | Status — live/paid |
| `text-warning` … `text-error` … `text-info` | our amber / red / blue | Status |

`--ui-primary` is tuned to **teal-600** (not the default 500) so primary buttons clear AA contrast with white text. The brand identity color teal-500 is still available as `bg-teal-500` / `text-teal-500`.

Marketing surface colors are also exposed directly: **`bg-sand`**, **`bg-mist`**, **`bg-cloud`**, **`bg-deep`** (the deep teal band), plus **`bg-canvas`**.

## Fonts

Declared as `--font-*` in `@theme`, so **`@nuxt/fonts` auto-loads and self-hosts them** (Fraunces, Inter, JetBrains Mono) — no manual `<link>` needed.

- `font-display` → **Fraunces** (headings). Fraunces is variable; `h1/h2/h3/.font-display` are set to its display optical cut via `font-variation-settings: "opsz" 96, "wght" 470`. Adjust `opsz` (9–144) to taste.
- `font-sans` → **Inter** (body + all Nuxt UI components).
- `font-mono` → **JetBrains Mono** (the uppercase eyebrow — use the `eyebrow` utility).

> If `@nuxt/fonts` doesn't pick up the Fraunces `opsz` axis, set it explicitly in `nuxt.config.ts` under the `fonts` key, or self-host the variable file.

## Type scale

Use the named sizes (they carry line-height, tracking, and weight): `text-display-1`, `text-display-2`, `text-h1`…`text-h4`, `text-body-lg`, `text-body`, `text-caption`, `text-eyebrow`. Pair the display sizes with `font-display`.

## Radius & buttons

`--ui-radius: 0.5rem` drives every Nuxt UI `rounded-*`. Buttons are overridden to **pill** (`rounded-full`) + semibold in `app.config.ts`. Cards use `rounded-card` (16px) with a hairline ring.

## Marketing site (without Nuxt UI)

The same `@theme` token block powers a plain Tailwind v4 marketing site. Use the **top half** of `main.css` (everything through the `@theme static` ramps and the `@layer base` block) but **drop** `@import "@nuxt/ui";` and the `:root --ui-*` overrides. You then style with the raw tokens directly: `bg-deep`, `text-display-1`, `font-display`, `bg-sand`, `rounded-pill`, `py-section`, the `eyebrow` utility, etc.

## Dark mode

Light-first per the brand — `nuxt.config.ts` pins `colorMode.preference: 'light'`. The ramps already contain full 50–950 scales, so dark mode works the moment you switch `preference` to `'system'`; Nuxt UI flips its neutral-derived tokens automatically (and `--ui-primary` steps to teal-400 on dark).

## Worked example

```vue
<template>
  <!-- Deep teal hero band -->
  <section class="bg-deep text-white py-section px-6">
    <p class="eyebrow text-teal-300">Francis Web Agency</p>
    <h1 class="font-display text-display-2 mt-4">Websites that grow the business.</h1>
    <p class="text-body-lg text-teal-100 mt-5 max-w-prose">
      Fast, modern sites and web apps that turn visitors into customers.
    </p>
    <UButton class="mt-8" size="lg">Start a project</UButton>
  </section>

  <!-- App surface -->
  <section class="bg-muted p-6">
    <UCard>
      <template #header>Active projects</template>
      <p class="text-default">12 in flight</p>
      <UBadge color="success" variant="soft">Live</UBadge>
    </UCard>
  </section>
</template>
```

Here `UButton` is teal-600 with white text, `bg-muted` is the cloud app background, `text-default` is body ink, and the `UBadge` success color is our `#1F9D57` — all flowing from the two config files.
