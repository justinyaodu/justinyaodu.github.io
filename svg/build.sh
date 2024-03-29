#!/bin/bash

set -eux -o pipefail

cd "$(dirname "${0}")"

for svg in *.svg; do
  inkscape \
    --export-background="#ffffff" \
    --export-dpi=192 \
    --export-filename="../images/$(basename -s '.svg' "${svg}").png" \
    "${svg}"
done
