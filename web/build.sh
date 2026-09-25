#!/bin/sh
# Web build: FreeBASIC (-lang qb) turns the merged source into C, Emscripten
# builds it with FreeBASIC's runtime. Needs:
#   FBC   = fbc 1.10+ (FreeBASIC-NG darwin build works)
#   FBSRC = clone of github.com/freebasic/fbc where
#           `make rtlib TARGET=wasm32-unknown-emscripten` was run (libfb.a)
#   emcc on the PATH
# Output: web/dist (index.html, alphaman.js, alphaman-core.js/.wasm, help.html)
set -e
cd "$(dirname "$0")/.."
FBC=${FBC:-$HOME/Games/fbc-tool/freebasic-ng-1.24.4-darwin-aarch64/bin/fbc}
FBSRC=${FBSRC:-$HOME/Games/fbc-tool/fbc}
python3 port/merge.py fb
mkdir -p web/build web/dist
"$FBC" -lang qb -gen gcc -r -target js-asmjs -m alphaman -maxerr 30 port/fb/alphaman.bas
mv port/fb/alphaman.c web/build/
emcc -O2 -w -fno-strict-aliasing -fwrapv -Iport -I"$FBSRC/src/rtlib" \
  web/build/alphaman.c port/fb/console.c "$FBSRC/lib/freebasic/js-wasm32/libfb.a" \
  -sASYNCIFY -sASYNCIFY_STACK_SIZE=131072 -sALLOW_MEMORY_GROWTH -sEXIT_RUNTIME=1 \
  -lidbfs.js -lnodefs.js -sEXPORTED_RUNTIME_METHODS=FS,ENV,ccall,HEAPU8,HEAPU16,HEAP32,NODEFS,IDBFS \
  -sEXPORTED_FUNCTIONS=_main,_rv_pagebuf,_rv_pushkey,_rv_click,_rv_font,_rv_state,_rv_dump \
  --embed-file data@/data -o web/dist/alphaman-core.js
cp web/index.html web/alphaman.js "$HOME/Games/rvip-tools/web/rvip-wm.js" web/dist/
python3 web/make-help.py > web/dist/help.html
