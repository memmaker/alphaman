/* QB64 DECLARE LIBRARY header: ALPCLIB.C (port/alpclib.c) with the DOS video
   memory and inline asm replaced. Pages 0,1,3 are QB64's own SCREEN 0 pages
   (char+attr cells, set by rv_setpage); page 2 is the BASIC array pag2(). */
#include <stdint.h>
#include <math.h>
static uint8_t *rv_page[4];
static int16_t *rv_pag2;
static void rv_setpage(int16_t p, intptr_t ptr) { rv_page[p] = (uint8_t *)ptr; }
static void rv_setpag2(intptr_t ptr) { rv_pag2 = (int16_t *)ptr; }

static int sgn(int n) { return n < 0 ? -1 : n > 0; }
static int isqrt(unsigned int n) { return (int)sqrt((double)n); }

static int16_t cgetsym(int x, int y, int pag) {
  if (pag == 2) {   /* BASIC GetSym on pag2(col,row), 52x22, column-major */
    if (x < 1 || x > 52 || y < 1 || y > 22) return 0;
    int16_t a = rv_pag2[(x - 1) + (y - 1) * 52];
    int sym = a % 256, bc = a / 4096, fc = (a / 256) % 16;
    return (int16_t)(((fc + bc * 16) << 8) + sym);
  }
  if (x < 1 || x > 80 || y < 1 || y > 25) return 0;
  uint8_t *c = rv_page[pag] + ((y - 1) * 80 + (x - 1)) * 2;
  return (int16_t)(c[0] | (c[1] << 8));
}
static void cputsym(int sym, int x, int y, int fc, int bc, int pag) {
  if (x < 1 || x > 80 || y < 1 || y > 25) return;   /* BASIC PutSym's check */
  if (pag == 2) {
    if (x <= 52 && y <= 22) rv_pag2[(x - 1) + (y - 1) * 52] = sym + fc * 256 + bc * 4096;
    return;
  }
  uint8_t *c = rv_page[pag] + ((y - 1) * 80 + (x - 1)) * 2;
  c[0] = sym; c[1] = fc + bc * 16;
}
static void ccls(int16_t pag) {
  for (int i = 0; i < 2000; i++) { rv_page[pag][i * 2] = 32; rv_page[pag][i * 2 + 1] = 7; }
}
static void clearright(int16_t pag) {   /* cols 54-80, rows 1-23 */
  for (int y = 0; y < 23; y++)
    for (int x = 53; x < 80; x++) { rv_page[pag][(y * 80 + x) * 2] = 32; rv_page[pag][(y * 80 + x) * 2 + 1] = 7; }
}

void addaroom(int x, int y, int dx, int dy);
void drawtunnel(int x, int y, int dx, int dy);
int walldist(int x, int y, int dx, int dy, int max, int incastle);
int croll(int max);
int crdsimp(int x, int y);
void box(int x1, int x2, int y1, int y2, int nl, int fc, int pag);

#include "alpclib.c"

#undef true
#undef false
#undef hor
#undef ver
#undef cen
#undef ul
#undef um
#undef ur
#undef ml
#undef mrt
#undef ll
#undef lm
#undef lr
#undef lockeddoor
#undef secretdoor
#undef pi
#undef cint
#undef getrandom

/* Test hook: write the four text pages as text (CP437 bytes) to path. */
#include <stdio.h>
extern img_struct *display_page;   /* libqb: the page SCREEN ,,,v shows */
static int16_t rv_visible(void) {
  for (int p = 0; p < 4; p++) if (display_page && display_page->offset == rv_page[p]) return p;
  return -1;
}
static void rv_dump(const char *path) {
  FILE *f = fopen(path, "wb"); if (!f) return;
  fprintf(f, "visible %d\n", rv_visible());
  for (int p = 0; p < 4; p++) {
    fprintf(f, "== page %d\n", p);
    for (int y = 0; y < 25; y++) {
      for (int x = 0; x < 80; x++) { uint8_t c = rv_page[p][(y * 80 + x) * 2]; fputc(c ? c : ' ', f); }
      fputc('\n', f);
    }
  }
  fclose(f);
}

/* Window size: QB64 has no statement for it; ask the GLUT thread. With
   $RESIZE:STRETCH QB64 scales the 640x400 text screen nearest-neighbour. */
#include "../src/glut-message.h"
#include <GLUT/glut.h>
class rv_msg_reshape : public glut_message {
  int w, h;
public:
  rv_msg_reshape(int w_, int h_) : glut_message(false), w(w_), h(h_) {}
  void execute() override { glutReshapeWindow(w, h); }
};
static void rv_winsize(int16_t w, int16_t h) { libqb_queue_glut_message(new rv_msg_reshape(w, h)); }
