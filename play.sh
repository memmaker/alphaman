#!/bin/sh
# AlphaMan launcher: runs in save/ (data files copied there on first run).
D="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$D/save" && cd "$D/save" || exit 1
for f in "$D"/data/alphaman.*; do [ -e "$(basename "$f")" ] || cp "$f" .; done
exec "$D/alphaman" "$@"
