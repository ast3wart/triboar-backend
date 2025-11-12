# Base stage - common setup
FROM node:22-alpine AS base

WORKDIR /app

# Copy package files
COPY package*.json ./

# Development stage - includes dev dependencies and hot-reload
FROM base AS development

# Install all dependencies (including dev dependencies)
RUN npm install

# Copy application code
COPY . .

# Expose API port
EXPOSE 3000

# Start with nodemon for hot-reload
CMD ["npm", "run", "dev"]

# Production dependencies stage - optimized layer caching
FROM base AS production-deps

# Install only production dependencies
RUN npm ci --only=production

# Production stage - optimized final image
FROM node:22-alpine AS production

WORKDIR /app

# Copy production dependencies
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=production-deps /app/package*.json ./

# Copy application code
COPY src ./src

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Expose API port
EXPOSE 3000

# Start the server
CMD ["node", "src/index.js"]
