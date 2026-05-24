# Dockerfile for BlockBloom Backend

# Stage 1: Build & Dependencies
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for building if needed)
RUN npm ci

# Copy the rest of the application
COPY . .

# Stage 2: Production Image
FROM node:18-alpine

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy built node_modules and app code from the builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json

# Security: Don't run as root
USER node

# Expose the API port
EXPOSE 5000

# Start the application
CMD ["npm", "start"]
