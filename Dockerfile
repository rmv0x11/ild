# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=22

# ---------- base ----------
FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app
ENV NODE_ENV=development \
    npm_config_loglevel=warn \
    npm_config_fund=false \
    npm_config_audit=false
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./

# ---------- deps ----------
FROM base AS deps
RUN --mount=type=cache,target=/root/.npm npm ci

# ---------- dev ----------
FROM deps AS dev
ENV CHOKIDAR_USEPOLLING=true \
    WATCHPACK_POLLING=true
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

# ---------- build ----------
FROM deps AS build
ENV NODE_ENV=production
COPY . .
RUN npm run build

# ---------- prod (nginx, SPA fallback) ----------
FROM nginx:1.27-alpine AS prod
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
