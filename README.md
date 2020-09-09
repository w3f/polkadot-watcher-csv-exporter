[![CircleCI](https://circleci.com/gh/w3f/polkadot-watcher-csv-exporter.svg?style=svg)](https://circleci.com/gh/w3f/polkadot-watcher-csv-exporter)

# polkadot-watcher-csv-exporter

All the relevant data generation code is currently in src/writeCSV.ts  
At the moment, that code is mainly based on https://github.com/mariopino/substrate-data-csv/blob/master/utils.js

## Bucket upload
These two env variables need to be set:   
- GOOGLE_SERVICE_ACCOUNT  
- GOOGLE_CLOUD_PROJECT