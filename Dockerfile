FROM node:12.16.1-alpine3.11

RUN apk add --no-cache make gcc g++ python3

WORKDIR /app

RUN yarn && yarn build && \
  apk del make gcc g++ python3

COPY . .

ENTRYPOINT ["yarn", "start"]
