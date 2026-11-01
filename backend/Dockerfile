FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production UPLOAD_DIR=/app/data/uploads
COPY package*.json ./
RUN npm ci --omit=dev && npm i --no-save prisma@7.10.1 tsx@4.23.15
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY deploy/start.sh ./deploy/start.sh
# A fresh named volume copies this ownership. A bind mount keeps the host's, which start.sh checks.
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data
USER node
CMD ["sh", "deploy/start.sh"]
