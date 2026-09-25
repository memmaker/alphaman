/* FreeBASIC console driver for the web build (web/build.sh). It replaces
   the rtlib/js driver (termlib) with DOS text mode: 8 pages of 80x25
   char+attr cells that web/alphaman.js draws with the VGA font. Keys and
   clicks come from JS (rv_pushkey, rv_click). ALPCLIB.C (alpclib.h) is
   included here so the game's C reads the same pages. */
#include <emscripten.h>
#include "fb.h"   /* fbc/src/rtlib: FBSTRING, fb_ConHooks, fb_ConPrintTTY */

#define COLS 80
#define ROWS 25
#define PAGES 8
static uint8_t page[PAGES][COLS * ROWS * 2];
static int active, visible, curx[PAGES], cury[PAGES], cursor_on, attr = 7, scroll_was_off;
static int keys[256], khead, ktail;
static int mx, my, mb, mpending;   /* last click: 1-based text cell, button */
static int dirty = 1;

#define RV_WEB
#include "../alpclib.h"

/* ---- text pages ---- */
static void fill(int pg, int x1, int y1, int x2, int y2) {
  for (int y = y1; y <= y2; y++)
    for (int x = x1; x <= x2; x++) { uint8_t *c = page[pg] + (y * COLS + x) * 2; c[0] = 32; c[1] = attr; }
}
/* 0-based region; nrows > 0 scrolls up, < 0 down, 0 clears */
static void scroll(int pg, int x1, int y1, int x2, int y2, int nrows) {
  int w = (x2 - x1 + 1) * 2, h = y2 - y1 + 1;
  if (nrows >= h || -nrows >= h) nrows = 0;
  if (nrows > 0)
    for (int y = y1; y + nrows <= y2; y++) memmove(page[pg] + (y * COLS + x1) * 2, page[pg] + ((y + nrows) * COLS + x1) * 2, w);
  else if (nrows < 0)
    for (int y = y2; y + nrows >= y1; y--) memmove(page[pg] + (y * COLS + x1) * 2, page[pg] + ((y + nrows) * COLS + x1) * 2, w);
  if (nrows > 0) fill(pg, x1, y2 - nrows + 1, x2, y2);
  else if (nrows < 0) fill(pg, x1, y1, x2, y1 - nrows - 1);
  else fill(pg, x1, y1, x2, y2);
  dirty = 1;
}

void fb_hInit(void) {
  for (int p = 0; p < PAGES; p++) fill(p, 0, 0, COLS - 1, ROWS - 1);
  for (int p = 0; p < 4; p++) rv_page[p] = page[p];
}
void fb_hEnd(int unused) {}

int fb_ConsoleWidth(int cols, int rows) { return COLS | (ROWS << 16); }
FBCALL void fb_ConsoleGetSize(int *cols, int *rows) { if (cols) *cols = COLS; if (rows) *rows = ROWS; }
int fb_ConsoleGetMaxRow(void) { return ROWS; }
FBCALL void fb_ConsoleGetXY(int *col, int *row) { if (col) *col = curx[active] + 1; if (row) *row = cury[active] + 1; }
int fb_ConsoleGetX(void) { return curx[active] + 1; }
int fb_ConsoleGetY(void) { return cury[active] + 1; }

int fb_ConsoleLocate(int row, int col, int cursor) {
  if (row > 0) cury[active] = row - 1;
  if (col > 0) curx[active] = col - 1;
  if (cursor >= 0) cursor_on = cursor != 0;
  scroll_was_off = 0; dirty = 1;
  return ((curx[active] & 0xFF) | ((cury[active] & 0xFF) << 8) | (cursor_on ? 0x10000 : 0)) + 0x0101;
}

FBCALL unsigned int fb_ConsoleReadXY(int col, int row, int colorflag) {
  if (col < 1 || col > COLS || row < 1 || row > ROWS) return 0;
  return page[active][((row - 1) * COLS + col - 1) * 2 + (colorflag ? 1 : 0)];
}

static unsigned last_fc = 7, last_bc = 0;
unsigned int fb_ConsoleColor(unsigned int fc, unsigned int bc, int flags) {
  unsigned cur = last_fc | (last_bc << 16);
  if (!(flags & FB_COLOR_FG_DEFAULT)) last_fc = fc & 15;
  if (!(flags & FB_COLOR_BG_DEFAULT)) last_bc = bc & 15;
  attr = last_fc | (last_bc << 4);
  return cur;
}
unsigned int fb_ConsoleGetColorAtt(void) { return attr; }

void fb_ConsoleClear(int mode) {
  int top, bot;
  if (mode == 1) return;
  if (mode == 2 || mode == (int)0xFFFF0000) { fb_ConsoleGetView(&top, &bot); --top; --bot; }
  else { top = 0; bot = ROWS - 1; }
  scroll(active, 0, top, COLS - 1, bot, 0);
  cury[active] = top; curx[active] = 0; scroll_was_off = 0;
}
void fb_ConsoleViewUpdate(void) {
  int top = fb_ConsoleGetTopRow();
  fb_ConsoleLocate(top >= 0 ? top + 1 : 1, 1, -1);
}
void fb_ConsoleScrollEx(int x1, int y1, int x2, int y2, int nrows) { if (nrows) scroll(active, x1 - 1, y1 - 1, x2 - 1, y2 - 1, nrows); }
void fb_ConsoleScroll(int nrows) { int top, bot; fb_ConsoleGetView(&top, &bot); fb_ConsoleScrollEx(1, top, COLS, bot, nrows); }

/* QB: SCREEN , , apage without vpage shows apage too (the game relies on it) */
int fb_ConsolePageSet(int a, int v) {
  int res = active | (visible << 8);
  if (v < 0) v = a;
  if (a >= 0 && a < PAGES) active = a;
  if (v >= 0 && v < PAGES) { visible = v; dirty = 1; }
  return res;
}
int fb_ConsolePageCopy(int src, int dst) {
  if (src < 0) src = active;
  if (dst < 0) dst = visible;
  if (src >= PAGES || dst >= PAGES) return fb_ErrorSetNum(FB_RTERROR_ILLEGALFUNCTIONCALL);
  if (src != dst) { memcpy(page[dst], page[src], sizeof page[0]); curx[dst] = curx[src]; cury[dst] = cury[src]; dirty = 1; }
  return fb_ErrorSetNum(FB_RTERROR_OK);
}
/* The core's fb_PageSet/fb_PageCopy (hook_pageset.c, hook_pcopy.c) refuse
   pages >= FB_CONSOLE_MAXPAGES, which is 1 on the js target, so they are
   replaced here. */
FBCALL int fb_PageSet(int a, int v) { fb_DevScrnInit_NoOpen(); return fb_ConsolePageSet(a, v); }
FBCALL int fb_PageCopy(int src, int dst) { fb_DevScrnInit_NoOpen(); return fb_ConsolePageCopy(src, dst); }
/* SCREEN 0 [, , active, visible]: no gfxlib, only the pages */
FBCALL int fb_GfxScreenQB(int mode, int a, int v) {
  if (a >= 0 || v >= 0) fb_ConsolePageSet(a, v);
  return fb_ErrorSetNum(FB_RTERROR_OK);
}

/* ---- PRINT ---- */
static void hook_scroll(fb_ConHooks *h, int x1, int y1, int x2, int y2, int rows) {
  scroll(active, x1, y1, x2, y2, rows);
  h->Coord.Y = h->Border.Bottom;
}
static int hook_write(fb_ConHooks *h, const void *buf, size_t len) {
  const uint8_t *s = buf;
  if (h->Coord.X + (int)len > COLS) len = COLS - h->Coord.X;
  uint8_t *c = page[active] + (h->Coord.Y * COLS + h->Coord.X) * 2;
  for (size_t i = 0; i < len; i++) { c[i * 2] = s[i]; c[i * 2 + 1] = attr; }
  dirty = 1;
  return TRUE;
}
void fb_ConsolePrintBufferEx(const void *buffer, size_t len, int mask) {
  int top, bot;
  fb_ConHooks h;
  if (!(mask & FB_PRINT_FORCE_ADJUST) && len == 0) return;
  fb_ConsoleGetView(&top, &bot);
  h.Opaque = NULL; h.Scroll = hook_scroll; h.Write = hook_write;
  h.Border.Left = 0; h.Border.Top = top - 1; h.Border.Right = COLS - 1; h.Border.Bottom = bot - 1;
  h.Coord.X = curx[active]; h.Coord.Y = cury[active];
  if (scroll_was_off) { scroll_was_off = 0; ++h.Coord.Y; h.Coord.X = 0; fb_hConCheckScroll(&h); }
  fb_ConPrintTTY(&h, buffer, len, TRUE);
  if (h.Coord.X != h.Border.Left || h.Coord.Y != h.Border.Bottom + 1) fb_hConCheckScroll(&h);
  else { scroll_was_off = 1; h.Coord.X = h.Border.Right; h.Coord.Y = h.Border.Bottom; }
  curx[active] = h.Coord.X; cury[active] = h.Coord.Y;
}
void fb_ConsolePrintBuffer(const char *buffer, int mask) { fb_ConsolePrintBufferEx(buffer, strlen(buffer), mask); }
void fb_ConsolePrintBufferWstrEx(const FB_WCHAR *buffer, size_t len, int mask) {
  char tmp[COLS * ROWS];
  if (len > sizeof tmp) len = sizeof tmp;
  for (size_t i = 0; i < len; i++) tmp[i] = (char)buffer[i];
  fb_ConsolePrintBufferEx(tmp, len, mask);
}
void fb_ConsolePrintBufferWstr(const FB_WCHAR *buffer, int mask) {
  size_t n = 0; while (buffer[n]) n++;
  fb_ConsolePrintBufferWstrEx(buffer, n, mask);
}
char *fb_ConsoleReadStr(char *buffer, ssize_t len) { return NULL; }
int fb_ConsoleIsRedirected(int is_input) { return 0; }

/* ---- keys and mouse ---- */
int fb_ConsoleKeyHit(void) { return khead != ktail; }
int fb_ConsoleGetkey(void) {
  if (khead == ktail) return 0;
  int k = keys[khead]; khead = (khead + 1) % 256;
  return k;
}
FBSTRING *fb_ConsoleInkey(void) { return fb_ConsoleKeyHit() ? fb_hMakeInkeyStr(fb_ConsoleGetkey()) : &__fb_ctx.null_desc; }
int fb_hConsoleInputBufferChanged(void) { return fb_ConsoleKeyHit(); }
int fb_ConsoleMultikey(int scancode) { return FB_FALSE; }
int fb_ConsoleGetMouse(int *x, int *y, int *z, int *buttons, int *clip) {
  if (x) *x = mx - 1; if (y) *y = my - 1; if (z) *z = 0; if (buttons) *buttons = mb; if (clip) *clip = 0;
  return fb_ErrorSetNum(FB_RTERROR_OK);
}
int fb_ConsoleSetMouse(int x, int y, int cursor, int clip) { return fb_ErrorSetNum(FB_RTERROR_OK); }

/* Called from JS: key = INKEY$ code (char, or DOS scan code << 8),
   click = 1-based text cell. */
EMSCRIPTEN_KEEPALIVE void rv_pushkey(int k) {
  int next = (ktail + 1) % 256;
  if (next != khead) { keys[ktail] = k; ktail = next; }
}
EMSCRIPTEN_KEEPALIVE void rv_click(int x, int y, int b) { mx = x; my = y; mb = b; mpending = 1; }
EMSCRIPTEN_KEEPALIVE uint8_t *rv_pagebuf(int p) { return page[p]; }
EMSCRIPTEN_KEEPALIVE const uint16_t *rv_font(void) { return vgafont[0]; }
/* visible page, cursor x/y (0-based), cursor shown, dirty (cleared) */
EMSCRIPTEN_KEEPALIVE int *rv_state(void) {
  static int st[5];
  st[0] = visible; st[1] = curx[visible]; st[2] = cury[visible];
  st[3] = cursor_on && active == visible; st[4] = dirty; dirty = 0;
  return st;
}

/* BASIC side (port/fb/lib.bi). A BYVAL AS STRING argument arrives as the
   string descriptor. */
void rv_dumpfb(FBSTRING *path) { if (path && path->data) rv_dump(path->data); }
int16_t rv_mousein(void) { int r = mpending; mpending = 0; if (!r) mb = 0; return r; }
int16_t rv_mx(void) { return mx; }
int16_t rv_my(void) { return my; }
int16_t rv_mb(void) { return mb; }
void rv_wait(int16_t ms) { emscripten_sleep(ms > 0 ? ms : 1); }
