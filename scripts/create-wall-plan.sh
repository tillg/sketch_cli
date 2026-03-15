#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 \"Plan Name\"" >&2
  exit 1
fi

plan_name="$*"

cleanup() {
  sketchup-cli session stop >/dev/null 2>&1 || true
}

trap cleanup EXIT

sketchup-cli new
sketchup-cli stats --json >/dev/null
sketchup-cli draw wall 0,0 5000,0 2500 250
sketchup-cli save-as "$plan_name"

echo "Created plan \"$plan_name\" with one wall."
