FROM node:20-slim AS builder
WORKDIR /app

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Install pnpm and dependencies
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy source
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared
COPY tsconfig.base.json ./

# Build
RUN pnpm --filter @myhealthurl/api build

FROM node:20-slim
WORKDIR /app

# Install pnpm for production dependency resolution
RUN npm install -g pnpm

# Copy workspace files (needed for pnpm to resolve dependencies)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built files and shared package source (exports types/constants)
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/shared ./packages/shared

WORKDIR /app/apps/api
EXPOSE 8080
CMD ["node", "dist/index.js"]
