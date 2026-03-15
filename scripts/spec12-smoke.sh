#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI=(node "$ROOT_DIR/bin/sketchup-cli.js")

keep_session=0
if [[ "${1:-}" == "--keep-session" ]]; then
  keep_session=1
fi

started_session=0

cleanup() {
  if [[ "$keep_session" -eq 0 && "$started_session" -eq 1 ]]; then
    "${CLI[@]}" session stop >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

ensure_session() {
  local status
  status="$("${CLI[@]}" session status 2>&1 || true)"
  if [[ "$status" == *"No active session"* ]]; then
    echo "Starting SketchUp session..."
    "${CLI[@]}" session start
    started_session=1
  else
    echo "$status"
  fi
}

run_case() {
  local name="$1"
  shift

  echo "=== $name ==="
  for command in "$@"; do
    echo "+ $command"
    eval "$command"
  done
  echo "PASS: $name"
  echo
}

ensure_session

run_case \
  "spec12_case1_box_offset" \
  "\"${CLI[0]}\" \"${CLI[1]}\" new" \
  "\"${CLI[0]}\" \"${CLI[1]}\" draw box 0 12485 0 14900 415 2400"

run_case \
  "spec12_case2_box_large_footprint" \
  "\"${CLI[0]}\" \"${CLI[1]}\" new" \
  "\"${CLI[0]}\" \"${CLI[1]}\" draw box 0 0 0 14900 12900 100"

run_case \
  "spec12_case3_rectangle_then_pushpull" \
  "\"${CLI[0]}\" \"${CLI[1]}\" new" \
  "\"${CLI[0]}\" \"${CLI[1]}\" draw rectangle 0 0 0 14900 12900" \
  "\"${CLI[0]}\" \"${CLI[1]}\" push-pull 7450 6450 0 100"

echo "Spec 12 smoke test passed."
