FROM node:20-alpine

WORKDIR /app

# Server dosyalarını kopyala
COPY server/package.json server/package-lock.json* ./
RUN npm install --production

COPY server/server.js ./server.js

# Frontend dosyalarını kopyala
COPY uygulama/ ./uygulama/

# Güvenlik: root olmayan kullanıcıyla çalıştır
RUN addgroup -g 1001 appgroup && adduser -D -u 1001 -G appgroup appuser
USER appuser

EXPOSE 3000

CMD ["node", "server.js"]
