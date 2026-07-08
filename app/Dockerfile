# syntax=docker/dockerfile:1
# FWA Ops admin app (Nuxt SPA, ssr:false). Served by the Nitro node server; the
# public API base is read from NUXT_PUBLIC_API_BASE at runtime (compose env).

# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000
COPY --from=build /app/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
