FROM node:22-alpine
WORKDIR /app

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/ ./

ENV NODE_ENV=production \
    PORT=3000
EXPOSE 3000

CMD ["node", "index.js"]