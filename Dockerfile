# Production image: app (dist/server.js) + compiled load-test (dist-load-test)
FROM node:22-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json tsconfig.load-test.json ./
COPY src ./src
COPY load-test ./load-test

RUN npx tsc && npx tsc -p tsconfig.load-test.json

ARG PORT=8080
EXPOSE ${PORT}

CMD ["node", "dist/server.js"]
