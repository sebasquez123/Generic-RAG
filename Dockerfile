FROM node:22.19.0-alpine AS builder

RUN mkdir -p /opt/app/
COPY package.json package-lock.json nest-cli.json .env.example tsconfig.json tsconfig.build.json /opt/app/
WORKDIR /opt/app/

RUN npm ci --ignore-scripts
COPY src /opt/app/src/
RUN npm run build

FROM node:22.19.0-alpine
ARG VERSION
ENV APP_PORT=8080 \
    APP_VERSION=${VERSION:-unknown} \
    NODE_ENV=production \
    NODE_OPTIONS="--enable-source-maps"
EXPOSE 8080

COPY package.json package-lock.json /opt/app/
WORKDIR /opt/app/
RUN npm ci --omit=dev --ignore-scripts
COPY .env.example /opt/app/
COPY --from=builder /opt/app/dist/ dist/

ENTRYPOINT ["node", "/opt/app/dist/main.js"]
