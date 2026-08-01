# Multi-stage build (Deployment Strategy §2): install/build stage -> slim
# runtime stage. Built from the monorepo root so pnpm workspace resolution
# works (`docker build -f infra/docker/backend.Dockerfile .`).

FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/backend ./apps/backend
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @taxitawsila/shared-contracts build
RUN pnpm --filter @taxitawsila/backend build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/backend/dist ./dist
COPY --from=build /repo/apps/backend/package.json ./package.json
COPY --from=build /repo/apps/backend/node_modules ./node_modules
COPY --from=build /repo/packages/shared-contracts/dist ../packages/shared-contracts/dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
