FROM oven/bun:latest

WORKDIR /app

COPY package.json bun.lock* ./

RUN bun install --frozen-lockfile --production

COPY src ./src
COPY public ./public
COPY db ./db

EXPOSE 8642

ENV PORT=8642
ENV NODE_ENV=production

CMD ["bun", "run", "src/index.ts"]
