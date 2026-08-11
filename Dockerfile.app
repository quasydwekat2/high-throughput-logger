# Node.js app — development (tsx, hot reload via compose bind mount)
FROM node:22-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

ARG PORT=8080
EXPOSE ${PORT}

CMD ["npx", "tsx", "watch", "src/server.ts"]
