FROM node:20-slim

WORKDIR /app

RUN npm install -g pnpm@9

COPY . .

RUN pnpm install --frozen-lockfile

RUN pnpm run build

EXPOSE 8080

CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]
