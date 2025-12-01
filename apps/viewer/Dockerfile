FROM node:20-slim AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/viewer/package.json ./apps/viewer/
COPY packages/shared/package.json ./packages/shared/

RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY apps/viewer ./apps/viewer
COPY packages/shared ./packages/shared
COPY tsconfig.base.json ./

ARG VITE_API_URL=https://api.myhealthurl.com
ENV VITE_API_URL=$VITE_API_URL

# Build shared package first, then viewer
RUN pnpm --filter @myhealthurl/shared build && pnpm --filter @myhealthurl/viewer build

FROM nginx:alpine
COPY --from=builder /app/apps/viewer/dist /usr/share/nginx/html
COPY apps/viewer/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
