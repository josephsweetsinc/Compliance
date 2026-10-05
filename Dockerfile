FROM node:22-slim AS builder

WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install dependencies (use npm install so lockfile differences never break the build)
RUN npm install

# Copy source and build production bundle
COPY . .
RUN npm run build

# Production runtime image
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/firebase-applet-config.json ./
COPY --from=builder /app/package.json ./

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
