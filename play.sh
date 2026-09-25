#!/bin/sh
# AlphaMan launcher: runs in save/ (data files copied there on first run).
# The game loads a saved character only when its name is the argument
# (ALPHAMAN NAME under DOS); with no argument the newest save is continued.
# A new name starts a new character.
D="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$D/save" && cd "$D/save" || exit 1
for f in "$D"/data/alphaman.*; do [ -e "$(basename "$f")" ] || cp "$f" .; done
if [ $# -eq 0 ]; then
  n=$(ls -t *.ALF 2>/dev/null | head -1)
  [ -n "$n" ] && set -- "${n%.ALF}"
fi
exec "$D/alphaman" "$@"
