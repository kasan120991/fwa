# syntax=docker/dockerfile:1
# FWA Ops API (Express + MySQL). Env comes from the compose environment.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
RUN mkdir -p uploads

EXPOSE 4000
CMD ["node", "src/index.js"]
