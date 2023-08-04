FROM node:16-alpine

RUN apk add --no-cache make gcc g++ python3

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn --ignore-scripts

COPY . .
RUN yarn && \ 
  yarn build && \
  apk del make gcc g++ python3

ENTRYPOINT ["yarn", "start"]
