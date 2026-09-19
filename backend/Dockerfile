FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
# ci (not install) so the lockfile is authoritative and the build is reproducible.
RUN npm ci

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

RUN npm run prisma:generate && npm run build

# Drop devDependencies from the tree we ship, keeping the generated Prisma client.
RUN npm prune --omit=dev


FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache wget

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

# node:alpine ships an unprivileged `node` user; run as it rather than root.
USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:4000/health/live || exit 1

CMD ["node", "dist/server.js"]
