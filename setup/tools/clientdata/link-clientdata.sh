#!/usr/bin/env bash
# Links every client MPQ into one folder for the model viewer extractor (--data <folder>). Usage: link-clientdata.sh <folder>
set -euo pipefail
. "$(dirname "$0")/paths.sh"
OUT=${1:?folder}; mkdir -p "$OUT"
ln -sf "$WOW_FILES"/base/Data/*.MPQ "$WOW_FILES"/patches/*.MPQ "$OUT"/
ls "$OUT" | wc -l
