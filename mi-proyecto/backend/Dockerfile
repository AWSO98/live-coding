FROM node:20-alpine

WORKDIR /app

# Instalar dependencias de sistema para better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package.json ./
RUN npm install --production

COPY . .

# Directorio para la base de datos SQLite (montado como volumen)
RUN mkdir -p /app/data

EXPOSE 3000
CMD ["node", "app.js"]
