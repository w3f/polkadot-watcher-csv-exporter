#!/bin/bash

source /scripts/common.sh
source /scripts/bootstrap-helm.sh


run_tests() {
    echo Running tests...

    wait_pod_ready session-exporter 
    wait_pod_ready era-scanner
}

teardown() {
    helm delete session-exporter
    helm delete era-scanner
}

main(){
    if [ -z "$KEEP_W3F_POLKADOT_WATCHER" ]; then
        trap teardown EXIT
    fi

    /scripts/build-helmfile.sh

    run_tests
}

main
