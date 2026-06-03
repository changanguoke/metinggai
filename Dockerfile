FROM oven/bun:latest

ENV NODE_ENV=production

WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --production

COPY . .

EXPOSE 80 443
ENTRYPOINT ["bun", "run", "src/index.js"]
