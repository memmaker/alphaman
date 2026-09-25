#!/bin/sh
# Build ./alphaman with QB64-PE (QB64=path to qb64pe, default ~/Games/qb64pe-tool/qb64pe/qb64pe).
cd "$(dirname "$0")/.." && python3 port/merge.py &&
"${QB64:-$HOME/Games/qb64pe-tool/qb64pe/qb64pe}" -x port/alphaman.bas -o "$PWD/alphaman" 2>&1 | tr '\r' '\n' | grep -v '^\[\|^\s*$' | sed 's/\x1b\[[0-9;]*m//g'
