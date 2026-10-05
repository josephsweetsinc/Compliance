FROM node:22-slim AS builder

WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install all dependencies for build
RUN npm install

# Copy source files
COPY . .

# Build production frontend and backend
RUN npm run build

# Production runtime image
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled frontend and backend assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/firebase-applet-config.json ./firebase-applet-config.json
COPY --from=builder /app/index.html ./index.html
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

# Support both 'node server.ts' and 'node dist/server.cjs'
CMD ["node", "server.ts"]
