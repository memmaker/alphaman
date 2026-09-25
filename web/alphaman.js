/*
 * AlphaMan in the browser: draws the DOS text pages of port/fb/console.c
 * (80x25 char+attr cells, VGA 9x16 font, 16 CGA colours) on one canvas,
 * scaled by whole pixels. Keyboard and clicks go to the C side; saves live in
 * IndexedDB (IDBFS, /save). Loaded before alphaman-core.js.
 * Under node (web/test.sh) it only mounts the run directory: the game reads
 * keys from ALPHA_KEYS and writes ALPHA_DUMP, like the Mac build.
 */
(function () {
	'use strict';

	var NODE = typeof window === 'undefined';
	var DIR = '/save', COLS = 80, ROWS = 25, CW = 9, CH = 16, DATA = ['1', '2', '3', '4', '5', '6'];
	var PAL = ['#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa',
		'#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff'];
	/* DOS scan codes (INKEY$ = CHR$(0) + CHR$(code)); keypad digits are the
	   cursor keys the game moves with, 5 = centre, 0 = Esc */
	var SCAN = { ArrowUp: 72, ArrowDown: 80, ArrowLeft: 75, ArrowRight: 77, Home: 71, End: 79, PageUp: 73, PageDown: 81,
		Insert: 82, Delete: 83, F1: 59, F2: 60, F3: 61, F4: 62, F5: 63, F6: 64, F7: 65, F8: 66, F9: 67, F10: 68, F11: 133, F12: 134 };
	var NUMPAD = [27, 79, 80, 81, 75, 76, 77, 71, 72, 73];
	var KEYS = { Enter: 13, Escape: 27, Backspace: 8, Tab: 9 };

	var running = false, cv, ctx, atlas, scale = 2, auto = true, wantSaveFlag = false, lastSave = 0;

	/* message log: new text on the message rows goes to #log */
	var logRows = {}, logTail = [];
	function logRow(y, s) {
		s = s.replace(/[^ -~]/g, ' ').trim();
		if (logRows[y] === s) return;
		logRows[y] = s;
		/* ponytail: rows that scroll up re-show old text; skip what the last 3 lines already hold */
		if (!/[A-Za-z]{2}/.test(s) || logTail.indexOf(s) >= 0) return;
		logTail.push(s); if (logTail.length > 3) logTail.shift();
		var l = $('log'), d = document.createElement('div'), end = l.scrollTop + l.clientHeight >= l.scrollHeight - 4;
		d.textContent = s; l.appendChild(d);
		if (l.childNodes.length > 500) l.removeChild(l.firstChild);
		if (end) l.scrollTop = l.scrollHeight;
	}
	function $(id) { return document.getElementById(id); }
	function status(msg, isError) {
		var s = $('status');
		s.textContent = msg; s.hidden = !msg; s.classList.toggle('error', !!isError);
	}

	/* ---------- drawing ---------- */
	function buildAtlas() {
		var font = Module.HEAPU16.subarray(Module._rv_font() >> 1, (Module._rv_font() >> 1) + 256 * 16);
		atlas = document.createElement('canvas');
		atlas.width = 256 * CW; atlas.height = 16 * CH;
		var a = atlas.getContext('2d'), img = a.createImageData(atlas.width, atlas.height), d = img.data;
		for (var fg = 0; fg < 16; fg++) {
			var r = parseInt(PAL[fg].substr(1, 2), 16), g = parseInt(PAL[fg].substr(3, 2), 16), b = parseInt(PAL[fg].substr(5, 2), 16);
			for (var c = 0; c < 256; c++)
				for (var y = 0; y < CH; y++) {
					var bits = font[c * 16 + y];
					for (var x = 0; x < CW; x++)
						if (bits & (0x100 >> x)) {
							var i = ((fg * CH + y) * atlas.width + c * CW + x) * 4;
							d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
						}
				}
		}
		a.putImageData(img, 0, 0);
	}
	function fit() {
		var g = $('game'), s = Math.floor(Math.min(g.clientWidth / (COLS * CW), g.clientHeight / (ROWS * CH)));
		return Math.max(1, Math.min(6, s));
	}
	function size() {
		cv.width = COLS * CW; cv.height = ROWS * CH;
		cv.style.width = COLS * CW * scale + 'px'; cv.style.height = ROWS * CH * scale + 'px';
		ctx.imageSmoothingEnabled = false;
		last = null;
	}
	var last = null;   /* copy of the page drawn last, to skip unchanged frames */
	function draw() {
		var st = Module.HEAP32.subarray(Module._rv_state() >> 2, (Module._rv_state() >> 2) + 5);
		var vis = st[0], cx = st[1], cy = st[2], cur = st[3];
		var p = Module._rv_pagebuf(vis), pg = Module.HEAPU8.subarray(p, p + COLS * ROWS * 2);
		if (!st[4] && last && last.vis === vis && last.cx === cx && last.cy === cy && last.cur === cur) return;
		for (var y = 0; y < ROWS; y++)
			for (var x = 0; x < COLS; x++) {
				var i = (y * COLS + x) * 2, c = pg[i], a = pg[i + 1], key = c | (a << 8);
				if (last && last.vis === vis && last.cells[y * COLS + x] === key) continue;
				if (!last || last.vis !== vis) last = { vis: vis, cells: new Int32Array(COLS * ROWS).fill(-1) };
				last.cells[y * COLS + x] = key;
				ctx.fillStyle = PAL[(a >> 4) & 15]; ctx.fillRect(x * CW, y * CH, CW, CH);
				if (c > 32) ctx.drawImage(atlas, c * CW, (a & 15) * CH, CW, CH, x * CW, y * CH, CW, CH);
			}
		if (last.cur && !(cur && last.cx === cx && last.cy === cy)) last.cells[last.cy * COLS + last.cx] = -1;
		if (cur) { ctx.fillStyle = PAL[7]; ctx.fillRect(cx * CW, cy * CH + CH - 2, CW, 2); last.cells[cy * COLS + cx] = -1; }
		last.cx = cx; last.cy = cy; last.cur = cur;
		for (var y = 22; y < 25; y++) { var s = ''; for (var x = 0; x < 51; x++) s += String.fromCharCode(pg[(y * COLS + x) * 2] || 32); logRow(y, s); }
	}
	function frame() {
		if (running) draw();
		requestAnimationFrame(frame);
	}
	function zoom(d) {
		auto = false;
		scale = Math.max(1, Math.min(6, scale + d));
		size(); draw();
		try { Module.FS.writeFile(DIR + '/web-zoom.json', JSON.stringify({ scale: scale })); syncFiles(); } catch (e) { }
	}

	/* ---------- input ---------- */
	function onKey(e) {
		if (!$('help').hidden) {
			if (e.key === 'Escape') { $('help').hidden = true; e.preventDefault(); }
			return;
		}
		if (!running || e.isComposing || e.metaKey) return;
		var k = e.key, code = e.code || '', m = /^Numpad(\d)$/.exec(code), c;
		if (m) c = NUMPAD[+m[1]] === 27 ? 27 : NUMPAD[+m[1]] << 8;
		else if (code === 'NumpadEnter') c = 13;
		else if (code === 'NumpadDecimal') c = 46;
		else if (SCAN[k] !== undefined) c = SCAN[k] << 8;
		else if (KEYS[k] !== undefined) c = KEYS[k];
		else if (k.length === 1) {
			c = k.charCodeAt(0);
			if (e.ctrlKey && !e.altKey) {
				var u = k.toUpperCase().charCodeAt(0);
				if (u >= 65 && u <= 90) c = u & 0x1f; else return;
			}
			if (c > 126) return;
		}
		else return;
		Module._rv_pushkey(c);
		wantSaveFlag = true;
		e.preventDefault();
	}
	function onClick(e) {
		if (!running) return;
		var r = cv.getBoundingClientRect();
		var x = Math.floor((e.clientX - r.left) / scale / CW) + 1, y = Math.floor((e.clientY - r.top) / scale / CH) + 1;
		if (x >= 1 && x <= COLS && y >= 1 && y <= ROWS) Module._rv_click(x, y, 1);
	}

	/* ---------- saves: IndexedDB (IDBFS) ---------- */
	var syncing = false, syncAgain = false, pendingCbs = [];
	function syncFiles(cb) {
		if (!Module.FS) { if (cb) cb(); return; }
		if (typeof cb === 'function') pendingCbs.push(cb);
		if (syncing) { syncAgain = true; return; }
		syncing = true;
		var cbs = pendingCbs; pendingCbs = [];
		Module.FS.syncfs(false, function (err) {
			syncing = false;
			if (err) status('Saving to browser storage (IndexedDB) failed: ' + err + '. Use "Export save" to keep a copy.', true);
			cbs.forEach(function (f) { f(err); });
			if (syncAgain) { syncAgain = false; syncFiles(); }
		});
	}
	/* the game's own files in /save: NAME.ALF and the map files, not the data files */
	function saveFiles() {
		return Module.FS.readdir(DIR).filter(function (f) { return f[0] !== '.' && !/^alphaman\.[1-6]$/.test(f) && !/\.json$/.test(f); });
	}
	function b64(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); }
	function unb64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
	function exportSave() {
		var files = saveFiles();
		if (!files.length) { status('There is no saved game yet.', true); setTimeout(function () { status(''); }, 2000); return; }
		var bundle = {};
		files.forEach(function (f) { bundle[f] = b64(Module.FS.readFile(DIR + '/' + f)); });
		var a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([JSON.stringify(bundle)], { type: 'application/json' }));
		a.download = 'alphaman-save.json';
		document.body.appendChild(a); a.click();
		setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
	}
	function importSave(file) {
		var r = new FileReader();
		r.onload = function () {
			var bundle;
			try { bundle = JSON.parse(r.result); } catch (e) { status('Not an AlphaMan save bundle.', true); return; }
			if (!confirm('Replace the saved games in this browser with "' + file.name + '"?')) return;
			running = false;
			saveFiles().forEach(function (f) { Module.FS.unlink(DIR + '/' + f); });
			Object.keys(bundle).forEach(function (f) { if (!/[\/\\]/.test(f)) Module.FS.writeFile(DIR + '/' + f, unb64(bundle[f])); });
			syncFiles(function (err) { if (!err) location.reload(); });
		};
		r.readAsText(file);
	}
	function newGame() {
		if (!confirm('Delete the saved games in this browser and start over?')) return;
		running = false;
		saveFiles().forEach(function (f) { Module.FS.unlink(DIR + '/' + f); });
		syncFiles(function (err) { if (!err) location.reload(); });
	}
	function autosave() {
		if (!running || !wantSaveFlag) return;
		var now = performance.now();
		if (now - lastSave < 2000 && !document.hidden) return;
		wantSaveFlag = false; lastSave = now;
		syncFiles();
	}

	/* ---------- help ---------- */
	var helpLoaded = false;
	function toggleHelp() {
		var h = $('help');
		h.hidden = !h.hidden;
		if (!h.hidden && !helpLoaded) {
			helpLoaded = true;
			fetch('help.html').then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
				.then(function (t) { $('help-body').innerHTML = t; })
				.catch(function (err) { helpLoaded = false; $('help-body').textContent = 'Could not load the guide (' + err + '). Press ? in the game for its own help.'; });
		}
		if (!h.hidden) $('help-body').focus();
	}

	/* ---------- startup ---------- */
	function copyData() {
		DATA.forEach(function (n) {
			var f = DIR + '/alphaman.' + n;
			try { Module.FS.stat(f); } catch (e) { Module.FS.writeFile(f, Module.FS.readFile('/data/alphaman.' + n)); }
		});
	}
	if (NODE) {
		/* test harness: the run directory holds the data files, keys and dump */
		var root = process.env.ALPHA_RUN || process.cwd();
		globalThis.Module = {
			arguments: process.argv.slice(2),
			preRun: [function () {
				var FS = Module.FS;
				FS.mkdir('/run'); FS.mount(Module.NODEFS, { root: root }, '/run'); FS.chdir('/run');
				Module.ENV.ALPHA_KEYS = '/run/keys'; Module.ENV.ALPHA_DUMP = '/run/dump';
				if (process.env.ALPHA_WIZ) Module.ENV.ALPHA_WIZ = process.env.ALPHA_WIZ;
				if (process.env.ALPHA_NAME) Module.ENV.ALPHA_NAME = process.env.ALPHA_NAME;
			}],
			print: function (s) { console.log(s); }, printErr: function (s) { console.error(s); },
			onExit: function (code) { Module.ccall('rv_dump', null, ['string'], ['/run/dump']); console.log('exit ' + code); },
			onRuntimeInitialized: function () {   /* ALPHA_WATCH=1: dump the pages every second */
				if (process.env.ALPHA_WATCH) setInterval(function () { Module.ccall('rv_dump', null, ['string'], ['/run/dump']); }, 1000);
				if (process.env.ALPHA_SHOT)   /* PPM of the visible page every second (card image) */
					setInterval(function () {
						var st = Module.HEAP32.subarray(Module._rv_state() >> 2, (Module._rv_state() >> 2) + 5);
						var p = Module._rv_pagebuf(st[0]), f = Module._rv_font() >> 1, W = COLS * CW, H = ROWS * CH;
						var out = Buffer.alloc(W * H * 3), pal = PAL.map(function (c) { return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)]; });
						for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) {
							var c = Module.HEAPU8[p + (y * COLS + x) * 2], a = Module.HEAPU8[p + (y * COLS + x) * 2 + 1];
							for (var gy = 0; gy < CH; gy++) { var bits = Module.HEAPU16[f + c * 16 + gy];
								for (var gx = 0; gx < CW; gx++) { var col = pal[(bits & (0x100 >> gx)) ? a & 15 : (a >> 4) & 15], o = ((y * CH + gy) * W + x * CW + gx) * 3;
									out[o] = col[0]; out[o + 1] = col[1]; out[o + 2] = col[2]; } }
						}
						require('fs').writeFileSync(process.env.ALPHA_SHOT, Buffer.concat([Buffer.from('P6 ' + W + ' ' + H + ' 255\n'), out]));
					}, 1000);
				if (process.env.ALPHA_TRACE) {   /* log rows 7 and 12 of page 0 whenever they change */
					var prev = '';
					setInterval(function () {
						var p = Module._rv_pagebuf(0), t = '';
						[6, 11].forEach(function (r) { for (var x = 0; x < 80; x++) t += String.fromCharCode(Module.HEAPU8[p + (r * 80 + x) * 2]); t += '|'; });
						if (t !== prev) { prev = t; console.log(Date.now() % 100000, JSON.stringify(t)); }
					}, 20);
				}
			}
		};
		return;
	}
	window.Module = {
		arguments: [],
		preRun: [function () {
			var FS = Module.FS;
			FS.mkdirTree(DIR);
			FS.mount(Module.IDBFS, {}, DIR);
			FS.chdir(DIR);
			Module.addRunDependency('idbfs');
			FS.syncfs(true, function (err) {
				if (err) status('Could not read saved games from IndexedDB (' + err + '). Saving may not work in this browser mode.', true);
				try { scale = JSON.parse(FS.readFile(DIR + '/web-zoom.json', { encoding: 'utf8' })).scale || 0; } catch (e) { scale = 0; }
				/* the game loads a save only when given its name (ALPHAMAN NAME
				   under DOS; here ALPHA_NAME): continue the newest saved character */
				var newest = null, t = 0;
				saveFiles().forEach(function (f) {
					if (!/\.ALF$/i.test(f)) return;
					var m = FS.stat(DIR + '/' + f).mtime.getTime();
					if (m > t) { t = m; newest = f.replace(/\.ALF$/i, ''); }
				});
				if (newest) Module.ENV.ALPHA_NAME = newest;
				Module.removeRunDependency('idbfs');
			});
		}],
		onRuntimeInitialized: function () {
			copyData();   /* the embedded /data exists only now (static constructors) */
			buildAtlas();
			auto = !scale;
			if (auto) scale = fit();
			size();
			$('game').hidden = false;
			running = true; status('');
			requestAnimationFrame(frame);
			setInterval(autosave, 500);
		},
		onExit: function (code) {
			running = false;
			syncFiles(function () {
				$('overlay-msg').textContent = 'Play again to continue a saved character or start a new one.';
				$('overlay').hidden = false;
			});
		},
		print: function (s) { console.log(s); },
		printErr: function (s) { console.warn(s); },
		setStatus: function (s) { if (s && !running) status(s.replace(/\(\d+\/\d+\)/, '').trim() || 'Loading…'); },
		onAbort: function (what) { crashed(what); }
	};
	function crashed(err) {
		if (!running) return;
		running = false;
		var msg = (err && (err.message || err.reason && err.reason.message)) || String(err);
		console.error('[alphaman] crash:', err);
		status('The game crashed (' + msg + '). Reload the page to continue from the last autosave.', true);
	}
	window.addEventListener('unhandledrejection', function (e) {
		if (e.reason && e.reason.name === 'ExitStatus') return;   /* exit() is the normal end */
		crashed(e.reason);
	});
	window.addEventListener('error', function (e) {
		if (e.error && e.error.name === 'ExitStatus') return;
		if (e.error instanceof WebAssembly.RuntimeError || /alphaman-core/.test(e.filename || '')) crashed(e.error || e.message);
	});
	document.addEventListener('visibilitychange', function () { if (document.hidden) wantSaveFlag = true; });
	window.addEventListener('resize', function () { if (auto && running) { scale = fit(); size(); draw(); } });
	document.addEventListener('keydown', onKey);
	document.addEventListener('DOMContentLoaded', function () {
		cv = document.querySelector('#game canvas');
		ctx = cv.getContext('2d');
		cv.style.imageRendering = 'pixelated';
		cv.addEventListener('click', onClick);
		$('btn-export').onclick = exportSave;
		$('btn-import').onclick = function () { $('import-file').click(); };
		$('import-file').onchange = function () { if (this.files[0]) importSave(this.files[0]); this.value = ''; };
		$('btn-new').onclick = newGame;
		$('btn-help').onclick = toggleHelp;
		$('help-close').onclick = toggleHelp;
		$('btn-zoom-in').onclick = function () { zoom(1); };
		$('btn-zoom-out').onclick = function () { zoom(-1); };
		$('btn-restart').onclick = function () { location.reload(); };
		document.querySelectorAll('button').forEach(function (b) {
			b.addEventListener('mousedown', function (e) { e.preventDefault(); });
		});
	});
})();
