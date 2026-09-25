#!/usr/bin/env python3
"""Writes the in-page game guide (dist/help.html) for the web build.

The game content comes from the desktop key guides in
~/Desktop/Games/Roguelikes/Docs (build-docs.py + guides.py), so both guides
stay in sync; only the saving and "playing in the browser" parts are
written here, because they differ on the web."""
import html, importlib.util, os, sys

DOCS = os.path.expanduser('~/Desktop/Games/Roguelikes/Docs')
PAGE = 'alphaman.html'

sys.path.insert(0, DOCS)
spec = importlib.util.spec_from_file_location('build_docs', os.path.join(DOCS, 'build-docs.py'))
docs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(docs)
from guides import GUIDES   # noqa: E402

game = next(g for g in docs.GAMES if g['file'] == PAGE)
guide = dict(GUIDES.get(PAGE, {}))
info = dict(game['info'])
kbd = docs.kbd
esc = html.escape

SAVING = '''<ul>
<li><strong>Saving is automatic.</strong> The game's files are stored in this browser (IndexedDB) a moment after each command. Reloading the page continues from there: type the same name at the start.</li>
<li><kbd>S</kbd> saves the game in the usual way (the file <code>NAME.ALF</code> with its map files); <kbd>Q</kbd> offers to save before quitting. Death is final: the save is deleted.</li>
<li>A browser can keep several characters (one per name). <em>New game</em> deletes them all.</li>
<li><em>Export save</em> downloads every saved character as one file; <em>Import save</em> loads such a file. Saves from the Mac version can be imported by putting its <code>save/</code> files into such a bundle.</li>
<li>Private/incognito windows and "clear site data" delete the stored games. Export first if it matters.</li>
</ul>'''

WEB = '''<ul>
<li>The original 80×25 text screen with the IBM VGA font and the 16 CGA colours, scaled by whole pixels. <em>Zoom −</em> / <em>Zoom +</em> change the size.</li>
<li><strong>Keys:</strong> the numeric keypad or the arrow keys move you (keypad <kbd>5</kbd> rests, <kbd>0</kbd> is Escape); <kbd>F1</kbd>–<kbd>F7</kbd> switch the side panels as in DOS.</li>
<li>Browsers keep a few shortcuts for themselves (<kbd>Ctrl+W</kbd>, <kbd>Ctrl+T</kbd>, <kbd>Ctrl+N</kbd>, and <kbd>Cmd</kbd> shortcuts on a Mac), so those never reach the game. <kbd>F5</kbd> and <kbd>F6</kbd> are caught by the page so the browser does not reload.</li>
<li>If the game ever crashes, a message appears at the top; reload the page to continue from the last autosave.</li>
</ul>'''

KEY_HINTS = [
    ('?', 'In-game help and command list'),
    ('x', 'Auto-explore: walk to unexplored places and unvisited items'),
    ('Enter', 'Menu of all commands'),
    ('i', 'Possessions with a cursor: Enter = everything you can do with the item'),
    ('<', 'Go down (walks to the nearest known stairs or lair entrance)'),
]


def dl(items):
    return '<dl>' + ''.join(f'<dt>{kbd(k)}</dt><dd>{esc(d)}</dd>' for k, d in items) + '</dl>'


def section(anchor, title, body):
    return f'<h2 id="h-{anchor}">{esc(title)}</h2>{body}'


parts = []
toc = [('about', 'About the game'), ('keys', 'Keyboard controls'), ('saving', 'Saving your game'),
       ('tips', 'Tips'), ('guide', "New player's guide"), ('web', 'Playing in the browser')]
parts.append('<p>' + esc(game['tagline']) + '</p>' + info['About the game'] + '<ul class="toc">' +
             ''.join(f'<li><a href="#h-{a}">{esc(t)}</a></li>' for a, t in toc) + '</ul>')


parts.append(section('about', 'About the game',
                     guide.pop('How AlphaMan differs from Angband')))

ess = ''.join(f'<div class="box"><h3>{esc(cat)}</h3>{dl(items)}</div>' for cat, items in game['essentials'])
all_keys = game['all']() if callable(game['all']) else game['all']
full = ''.join(f'<div>{kbd(k)}<span>{esc(d)}</span></div>' for k, d in all_keys)
parts.append(section('keys', 'Keyboard controls',
                     '<div class="box key"><h3>The keys to remember</h3>' + dl(KEY_HINTS) + '</div>'
                     '<h3>Essential keys</h3><div class="grid">' + ess + '</div>'
                     '<details><summary>Complete key list (' + str(len(all_keys)) + ' commands)</summary>'
                     '<div class="all">' + full + '</div></details>'))

parts.append(section('saving', 'Saving your game', SAVING))
parts.append(section('tips', 'Tips', info.get('Tips') or guide.pop('Tips', '')))
parts.append(section('guide', "New player's guide",
                     ''.join(f'<h3>{esc(t)}</h3>{b}' for t, b in guide.items())))
parts.append(section('web', 'Playing in the browser', WEB))

# RVIP: About this version
parts.append('<h2 id="h-version">About this version</h2><ul>'
             '<li>Based on the QuickBASIC 4.5 source of <strong>AlphaMan 1.1</strong> by Jeffrey R. Olson (github.com/superjamie/alphaman-src), built with FreeBASIC and Emscripten.</li>'
             '<li>Our changes (QB64-PE and FreeBASIC ports, auto-explore, stairs walking, command menu, inventory cursor and item menus, web build) '
             'are on GitHub: <a href="https://github.com/memmaker/alphaman">memmaker/alphaman</a>.</li></ul>')
print('\n'.join(parts))
