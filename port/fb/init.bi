' Port (web): the text pages live in port/fb/console.c; give it pag2().
SCREEN 0: WIDTH 80, 25
rv_setpag2 pag2(1, 1)
DIM SHARED rv_q$   ' keys queued by explore/menus (rv_key$)
DIM SHARED rv_mode, rv_vis(1 TO 52, 1 TO 22)   ' RVIP walk mode (1 explore, 2 down, 3 up), visited squares
DIM SHARED rv_cur, rv_reopen   ' item cursor, reopen i after an item action
