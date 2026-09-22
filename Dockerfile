# --- build ---------------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json vite.config.ts ./
COPY src ./src
COPY data ./data
RUN npm run build

# --- runtime -------------------------------------------------------------
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY data ./data
EXPOSE 8080
# The server validates its configuration at startup and exits with a clear message if anything is missing.
CMD ["node", "dist/server/index.js"]
