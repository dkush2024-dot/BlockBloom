# Stage 1: Build & deps
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

# Stage 2: Production runtime
FROM node:18-alpine

WORKDIR /usr/src/app

# Only copy over the node_modules and src code from builder
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/src ./src
COPY --from=builder /usr/src/app/package.json ./package.json

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

# Start server as non-root user for security
USER node

CMD ["npm", "start"]
