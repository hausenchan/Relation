FROM node:20 AS builder

WORKDIR /app

COPY package*.json ./
COPY client/package*.json ./client/

RUN npm install --omit=dev
RUN cd client && npm install

COPY . .

RUN cd client && npm run build


# ================= runner =================
FROM node:20-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY server ./server

COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/client/build ./client/build

EXPOSE 3001

CMD ["node", "server/index.js"]