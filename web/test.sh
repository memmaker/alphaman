#!/bin/sh
# Run the web build under node: ALPHA_RUN=dir (data files, keys, dump; default cwd).
# Env as in alphaman.js: ALPHA_NAME, ALPHA_WIZ, ALPHA_WATCH, ALPHA_SHOT, ALPHA_TRACE.
# alphaman-core.js is eval'd, not required: under require its top-level
# `var Module` is module-local and never sees the Module alphaman.js sets up.
D="$(cd "$(dirname "$0")/dist" && pwd)"
export ALPHA_RUN="${ALPHA_RUN:-$PWD}"
exec node -e "require('$D/alphaman.js');var __filename='$D/alphaman-core.js',__dirname='$D';eval(require('fs').readFileSync(__filename,'utf8'))" "$@"
