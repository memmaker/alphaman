' Port: give the C library the four text pages and pag2().
SCREEN 0: WIDTH 80, 25: _TITLE "AlphaMan"
CHDIR _STARTDIR$   ' QB64 on macOS starts in the binary's folder
rv_winsize 1280, 800   ' 2x, nearest-neighbour ($RESIZE:STRETCH)
DIM rv_m AS _MEM
FOR rv_p = 3 TO 0 STEP -1
  SCREEN , , rv_p, 0: rv_m = _MEMIMAGE(_DEST): rv_setpage rv_p, rv_m.OFFSET
NEXT
rv_setpag2 _OFFSET(pag2(1, 1))
DIM SHARED rv_q$, nm$, dud$   ' FIELD #3 buffers: QB64 crashes when FIELD binds SUB-local strings
DIM SHARED rv_mode, rv_vis(1 TO 52, 1 TO 22)   ' RVIP walk mode (1 explore, 2 down, 3 up), visited squares
DIM SHARED rv_cur, rv_reopen   ' item cursor, reopen i after an item action
