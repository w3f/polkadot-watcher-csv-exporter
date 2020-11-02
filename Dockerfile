FROM node:15.0.1-buster

WORKDIR /app

COPY . .

RUN yarn && yarn build 

ENTRYPOINT ["yarn", "start"]
