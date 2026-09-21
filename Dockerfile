# Fallback for Render's Docker runtime (plan WP1); the primary path is the Node runtime in render.yaml.
FROM node:24-alpine
RUN apk add --no-cache openssl && corepack enable

EXPOSE 3000
WORKDIR /app
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

CMD ["pnpm", "start"]
