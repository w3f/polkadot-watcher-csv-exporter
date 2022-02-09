[![CircleCI](https://circleci.com/gh/w3f/polkadot-watcher-csv-exporter.svg?style=svg)](https://circleci.com/gh/w3f/polkadot-watcher-csv-exporter)

# polkadot-watcher-csv-exporter

## Please Note
All the relevant data model code is located in the [csvWriter](src/csvWriter.ts) typescript module.  

## How to Run 

### Requirements
- yarn: https://classic.yarnpkg.com/en/docs/install/

```bash
git clone https://github.com/w3f/polkadot-watcher-csv-exporter.git
cd polkadot-watcher-csv-exporter
cp config/main.sample.complete.yaml config/main.yaml 
#just the first time

yarn
yarn build
yarn start
```

## Features

- live
- live + cronjob
- historic
- scanner (historic)

## How to configure the application

Sample files of the possible configurations can be found [here](config/)

### Output
If not explicitly specified, the default configuration will create a ./data-csv folder that will be populated with the chain data 