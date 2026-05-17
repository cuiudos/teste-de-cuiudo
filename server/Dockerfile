FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium
ENV WHATSAPP_PROVIDER=local
ENV PORT=3000

COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p data/wweb-session

EXPOSE 3000

CMD ["node", "index.js"]
