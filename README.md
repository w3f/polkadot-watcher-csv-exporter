[![CircleCI](https://circleci.com/gh/w3f/polkadot-watcher-csv-exporter.svg?style=svg)](https://circleci.com/gh/w3f/polkadot-watcher-csv-exporter)

# polkadot-watcher-csv-exporter

## Please Note
All the relevant data model code is placed in [writeDataCSV](src/writeDataCSV.ts).  
At the moment, that code is mainly based on https://github.com/mariopino/substrate-data-csv/blob/master/utils.js and I'd recommend to refactor it.

## How to Run 

### Requirements
- yarn: https://classic.yarnpkg.com/en/docs/install/

```bash
git clone https://github.com/w3f/polkadot-watcher-csv-exporter.git
cd polkadot-watcher-csv-exporter
cp config/main.sample.yaml config/main.yaml 
#just the fist time

yarn
yarn start
```

## Output
The default configuration will create a ./substrate-data-csv folder that will be populated with the chain data 