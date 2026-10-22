# Single-container build: React client is built, then served by the Node server.
FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["node", "server/src/index.js"]
