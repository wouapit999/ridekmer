# RideKmer — container image for long-running hosts (Railway, Render, a VM). ADR-037.
# Build:   docker build -t ridekmer .
# Run:     docker run -p 3000:3000 --env-file .env ridekmer
# Railway builds this automatically (railway.json) and runs the pre-deploy command for migrations.

# ---------- base ----------
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
# pnpm installed globally (not via corepack) so no download happens at container start.
RUN npm install -g pnpm@10.28.0 \
  && apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---------- build ----------
FROM base AS build
# Public variables are inlined into the client bundle at build time; Railway passes service
# variables as build arguments when they are declared here.
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_APP_NAME=RideKmer
ARG NEXT_PUBLIC_DEFAULT_LOCALE=fr
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME
ENV NEXT_PUBLIC_DEFAULT_LOCALE=$NEXT_PUBLIC_DEFAULT_LOCALE
# Build-time placeholders so configuration validation can run while prerendering. They never
# reach the runtime image; real values come from the host's environment.
ENV BETTER_AUTH_SECRET=build-time-placeholder-not-a-secret-0123456789
ENV APP_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
ENV CRON_SECRET=build-time-placeholder-0123456789
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV APP_ENV=development
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
# Drop development dependencies; the generated Prisma client stays under src/generated.
RUN pnpm prune --prod

# ---------- runtime ----------
FROM base AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/next.config.ts /app/tsconfig.json /app/prisma.config.ts ./
COPY --from=build --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nextjs:nodejs /app/packages ./packages
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nextjs:nodejs /app/src ./src
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next ./.next
# Default local-storage root; mount a persistent volume here and set STORAGE_LOCAL_ROOT=/data.
RUN mkdir -p /data && chown nextjs:nodejs /data
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "start"]
