# fiscal-service: one always-on process per deployment (a database lease stops a second copy writing).
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY vectors ./vectors
ENV NODE_ENV=production PORT=4100
EXPOSE 4100
# SIGTERM gives the device leases back; run node (not npm) so the signal reaches the process.
CMD ["node_modules/.bin/tsx", "src/main.ts"]
