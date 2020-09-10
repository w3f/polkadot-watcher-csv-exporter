#!/bin/bash

source /scripts/common.sh
source /scripts/bootstrap-helm.sh


run_tests() {
    echo Running tests...

    wait_pod_ready polkadot-watcher-csv-exporter
}

teardown() {
    helm delete polkadot-watcher-csv-exporter
}

main(){
    if [ -z "$KEEP_W3F_POLKADOT_WATCHER" ]; then
        trap teardown EXIT
    fi

    /scripts/build-helm.sh \
        --set environment=ci \
        --set image.tag="${CIRCLE_SHA1}" \
        --set secret.gcpServiceAccountValue='{"type":"service_account","project_id":"test","private_key_id":"xxxxx","private_key":"-----BEGIN PRIVATE KEY-----\nxxxxx","client_email":"xxxx","client_id":"xxxx","auth_uri":"xxx","token_uri":"xxxx","auth_provider_x509_cert_url":"xxxx","client_x509_cert_url":"xxxxx"}' \
        polkadot-watcher-csv-exporter \
        ./charts/polkadot-watcher-csv-exporter

    run_tests
}

main
