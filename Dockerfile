FROM node:20.19.2-slim

WORKDIR /app

RUN npm install -g pnpm@9.15.9

# Changing CACHEBUST in Railway env vars invalidates all layers below
ARG CACHEBUST=1
RUN echo "cache-bust=$CACHEBUST"

COPY . .

RUN pnpm install --frozen-lockfile

ARG VITE_CLERK_PUBLISHABLE_KEY=""
ARG VITE_CLERK_PROXY_URL=""
ARG VITE_CLERK_DOMAIN=""
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PROXY_URL=$VITE_CLERK_PROXY_URL
ENV VITE_CLERK_DOMAIN=$VITE_CLERK_DOMAIN

RUN pnpm run build

EXPOSE 8080

CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]
