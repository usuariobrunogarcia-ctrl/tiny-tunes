#!/usr/bin/env python3
"""Extrae del ROM todo lo necesario para el remake del nivel (mundo) 1.

Uso:  python3 remake/tools/extract.py
Genera remake/data/world1.js (datos + imágenes PNG en base64, a resolución NES;
el reescalado a alta resolución se hace en el navegador con xBR).

Requiere Pillow (pip install pillow).
"""
import base64
import io
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from nesrom import Rom, NES_PALETTE          # noqa: E402
from levels import (level_entry, decode_map, collision_table, slope_profiles,  # noqa: E402
                    object_list, bg_palette, render_map, render_metatile, ITEM_REPLACE)
from sprites import meta, render             # noqa: E402

OUT = os.path.join(HERE, '..', 'data', 'world1.js')

# --------------------------------------------------------------------------
# Configuración por fase. Los números de subnivel, mapas, objetos, paletas y
# colisión se leen del ROM; lo que el juego decide en tiempo de ejecución
# (bancos CHR del fondo e índice de paleta) se tomó observando el juego.
# --------------------------------------------------------------------------
HUD_PAL3 = (0x0F, 0x20, 0x38)          # la paleta 3 del fondo la ocupa el marcador
BG_ANIM = (70, 64, 66, 68)             # R1 rota cada 8 fotogramas (hierba, llamas...)

STAGES = [
    dict(id='1-1', stage=0, sub=1, r0=76, pal=0, checkpoints=[]),
    dict(id='1-2', stage=1, sub=2, r0=76, pal=1, checkpoints=[6]),
    dict(id='1-3', stage=2, sub=7, r0=124, pal=13, checkpoints=[]),
    dict(id='1-4', stage=3, sub=3, r0=78, pal=2, checkpoints=[4, 5]),
    dict(id='1-5', stage=4, sub=8, r0=78, pal=2, checkpoints=[]),
]

CARROT_MT = (0x05,)
DOOR_MT = (0x6C, 0x6D, 0x6E, 0x6F)
SPIKE_MT = (0x94, 0x95, 0x96)

# Marcador: tabla de nombres $2800, filas 24-27 (capturada del juego), bancos 72-75.
HUD_ROWS = [
    'c0 c0 c1 c2 c3 c4 c0 c0 c0 c0 c0 c0 84 85 86 87 c5 c6 c6 c6 c6 c6 c6 c6 c6 c7 c6 c6 ca c0 c0 c0',
    'c0 c0 d1 d2 d3 d4 fd fd fd fd fd ed 94 95 96 97 d5 cb cb cb cb cb cb cb d6 d7 d8 d9 da c0 c0 c0',
    'c0 c0 e0 e1 e2 cd e3 f1 e2 cb cb e4 a4 a5 a6 a7 e5 e6 e2 cb e3 f6 cd cb cb e7 e8 e9 ea c0 c0 c0',
    'c0 c0 f0 f3 f3 f3 f3 f3 f3 f3 f3 f4 b4 b5 b6 b7 f5 f3 f3 f3 f3 f3 f3 f3 f3 f7 f8 f9 fa c0 c0 c0',
]
HUD_BANKS = [72, 74, 0, 0, 0, 0]
# Sprites del marcador (OAM 0-11): retrato del ayudante e iconos. (y, tile, attr, x)
HUD_SPRITES = [
    (0xC2, 0x50, 1, 0x60), (0xC2, 0x52, 1, 0x68), (0xC2, 0x54, 1, 0x70), (0xC2, 0x56, 1, 0x78),
    (0xD2, 0x58, 1, 0x60), (0xD2, 0x5A, 1, 0x68), (0xD2, 0x5C, 1, 0x70), (0xD2, 0x5E, 1, 0x78),
    (0xCD, 0x34, 0, 0xA8), (0xCD, 0x36, 0, 0x38),
]
HUD_HEART = [(0xC5, 0x30, 0, 0xD0), (0xC5, 0x32, 0, 0xD8)]
HUD_SPR_PAL = [0x0F, 0x16, 0x20, 0x21, 0x0F, 0x2A, 0x20, 0x28, 0x0F, 0x0F, 0x20, 0x24, 0x0F, 0x0F, 0x26, 0x22]

# Fuente (banco 72): '0'-'9' = $01-$0A, 'A'-'Z' = $0B-$24, '-' = $2B
FONT = {**{str(i): 1 + i for i in range(10)}, **{chr(65 + i): 0x0B + i for i in range(26)}, '-': 0x2B}


def png_uri(img):
    buf = io.BytesIO()
    img.save(buf, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()


def b64(data):
    return base64.b64encode(bytes(data)).decode()


def px_to_image(r):
    w, h, ox, oy, px = r
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for y in range(h):
        for x in range(w):
            if px[y][x]:
                im.putpixel((x, y), px[y][x] + (255,))
    return im, ox, oy


class Atlas:
    """Empaquetado simple por estantes con 2 px de margen transparente."""
    PAD = 2

    def __init__(self, width=512):
        self.width = width
        self.items = []

    def add(self, name, img, ox=0, oy=0):
        self.items.append((name, img, ox, oy))

    def build(self):
        items = sorted(self.items, key=lambda t: -t[1].height)
        x = y = shelf = 0
        placed = {}
        for name, img, ox, oy in items:
            w, h = img.width + 2 * self.PAD, img.height + 2 * self.PAD
            if x + w > self.width:
                x, y, shelf = 0, y + shelf, 0
            placed[name] = (x + self.PAD, y + self.PAD, img.width, img.height, ox, oy, img)
            x += w
            shelf = max(shelf, h)
        H = y + shelf
        sheet = Image.new('RGBA', (self.width, H), (0, 0, 0, 0))
        frames = {}
        for name, (px, py, w, h, ox, oy, img) in placed.items():
            sheet.paste(img, (px, py))
            frames[name] = [px, py, w, h, ox, oy]
        return sheet, frames


def tile_image(rom, banks, addr, pal4, transparent0=True):
    t = rom.pattern(banks, addr)
    im = Image.new('RGBA', (8, 8), (0, 0, 0, 0))
    for y in range(8):
        for x in range(8):
            c = t[y][x]
            if c == 0 and transparent0:
                continue
            im.putpixel((x, y), NES_PALETTE[pal4[c] & 0x3F] + (255,))
    return im


def build_stage(rom, cfg, atlas):
    e = level_entry(rom, cfg['sub'])
    mt, pal = decode_map(rom, e['map'], e['screens'], e['tall'])
    col = collision_table(rom)
    p16, bgc = bg_palette(rom, cfg['pal'])
    p16[13:16] = HUD_PAL3
    rows, cols = len(mt), len(mt[0])

    # Zanahorias: se quitan del fondo y pasan a ser objetos recogibles.
    repl = {m: rom.b(7, ITEM_REPLACE + cfg['stage']) for m in CARROT_MT}
    carrots = [[x, y] for y in range(rows) for x in range(cols) if mt[y][x] in CARROT_MT]
    if carrots:
        cx, cy = carrots[0]
        tile = render_metatile(rom, CARROT_MT[0], pal[cy][cx], [cfg['r0'], BG_ANIM[0], 0, 0, 0, 0], p16, bgc)
        im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
        bgrgb = NES_PALETTE[bgc & 0x3F]
        for y in range(16):
            for x in range(16):
                if tile[y][x] != bgrgb:
                    im.putpixel((x, y), tile[y][x] + (255,))
        atlas.add('carrot_' + cfg['id'], im, 0, 0)

    frames = []
    for r1 in BG_ANIM:
        W, H, img = render_map(rom, mt, pal, [cfg['r0'], r1, 0, 0, 0, 0], p16, bgc, replace=repl)
        frames.append(Image.frombytes('RGB', (W, H), bytes(img)))
    # Celdas de 16x16 que cambian con la animación del fondo.
    anim = []
    base = frames[0].tobytes()
    others = [f.tobytes() for f in frames[1:]]
    W = cols * 16
    for cy in range(rows):
        for cx in range(cols):
            diff = False
            for yy in range(16):
                o = ((cy * 16 + yy) * W + cx * 16) * 3
                seg = base[o:o + 48]
                if any(ob[o:o + 48] != seg for ob in others):
                    diff = True
                    break
            if diff:
                anim.append(cy * cols + cx)

    cells = [mt[y][x] for y in range(rows) for x in range(cols)]
    coll = [col[m] for m in cells]
    for i, m in enumerate(cells):
        if m in CARROT_MT:
            coll[i] = 0
    doors = sorted({(x, y) for y in range(rows) for x in range(cols) if mt[y][x] in DOOR_MT})
    spikes = sum(1 for m in cells if m in SPIKE_MT)

    checkpoints = []
    for sub in cfg['checkpoints']:
        c = level_entry(rom, sub)
        checkpoints.append({'x': c['start_x'], 'y': c['start_y'], 'air': c['start_air']})

    r, g, b = NES_PALETTE[bgc & 0x3F]
    return {
        'id': cfg['id'],
        'sub': cfg['sub'],
        'map': e['map'],
        'cols': cols,
        'rows': rows,
        'mt': b64(cells),
        'coll': b64(coll),
        'bgColor': '#%02x%02x%02x' % (r, g, b),
        'bg': [png_uri(f) for f in frames],
        'anim': anim,
        'carrots': carrots,
        'doors': [list(d) for d in doors],
        'spikes': spikes,
        'objects': [list(o) for o in object_list(rom, cfg['sub'])],
        'start': {'x': e['start_x'], 'y': e['start_y'], 'air': e['start_air']},
        'checkpoints': checkpoints,
        'levelEntry': e['raw'],
    }


def build_sprites(rom, atlas):
    cfg = json.load(open(os.path.join(HERE, 'spritecfg.json')))
    for who in ('buster', 'plucky'):
        c = cfg[who]
        for fk, banks in c['frames'].items():
            fr = int(fk, 16)
            pal16 = list(c['pal']) + [0x0F] * 12
            r = render(rom, meta(rom, 'p', fr, char=c['char']), banks + [17, 0][:6 - len(banks)], pal16)
            if r:
                im, ox, oy = px_to_image(r)
                atlas.add('%s_%s' % (who, fk), im, ox, oy)
    for name, frames in cfg['entities'].items():
        for f in frames:
            banks = list(f['banks'])
            r = render(rom, meta(rom, f['kind'], f['frame'], sub=f['sub']), banks, f['pal'], pal_or=f['attr'])
            if r:
                im, ox, oy = px_to_image(r)
                atlas.add('%s_%02x' % (name, f['frame']), im, ox, oy)


def build_hud(rom, atlas):
    pal = [0x0F, 0x0F, 0x20, 0x38]
    img = Image.new('RGBA', (256, 32), (0, 0, 0, 255))
    for ry, row in enumerate(HUD_ROWS):
        for cx, t in enumerate(int(v, 16) for v in row.split()):
            img.paste(tile_image(rom, HUD_BANKS, t * 16, pal, transparent0=False), (cx * 8, ry * 8))

    def spr(y, t, a, x, target, dy=192):
        top = (t & 1) * 0x1000 + (t & 0xFE) * 16
        p = HUD_SPR_PAL[(a & 3) * 4:(a & 3) * 4 + 4]
        for half in (0, 1):
            ti = tile_image(rom, HUD_BANKS, top + 16 * half, p)
            target.alpha_composite(ti, (x, y + 1 - dy + half * 8))

    for s in HUD_SPRITES:
        spr(*s, img)
    atlas.add('hud_base', img, 0, 0)
    heart = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for (y, t, a, x) in HUD_HEART:
        spr(y - 0xC5 + 0xC0, t, a, x - 0xD0, heart, dy=0xC0)
    atlas.add('hud_heart', heart, 0, 0)
    for d in range(10):
        t = 0xCB + d if d < 5 else 0xDB + d - 5
        atlas.add('hud_d%d' % d, tile_image(rom, HUD_BANKS, t * 16, pal, transparent0=False), 0, 0)
    for t in (0xFB, 0xFC, 0xFD, 0xEB, 0xEC, 0xED):
        atlas.add('hud_%02x' % t, tile_image(rom, HUD_BANKS, t * 16, pal, transparent0=False), 0, 0)
    # Fuente del juego (texto blanco)
    for ch, t in FONT.items():
        atlas.add('font_%s' % ch, tile_image(rom, [72, 88, 0, 0, 0, 0], t * 16, [0x0F, 0x20, 0x20, 0x20]), 0, 0)


def build_title(rom):
    """Pantalla de título original (256x240) compuesta con tiles y sprites del ROM."""
    cap = json.load(open(os.path.join(HERE, 'title_capture.json')))
    banks, pal = cap['banks'], cap['palette']
    nt = bytes.fromhex(cap['nametable'])
    at = bytes.fromhex(cap['attributes'])
    img = Image.new('RGBA', (256, 240), NES_PALETTE[pal[0] & 0x3F] + (255,))
    for ty in range(30):
        for tx in range(32):
            a = at[(ty // 4) * 8 + tx // 4]
            p = (a >> (((ty % 4) // 2) * 4 + ((tx % 4) // 2) * 2)) & 3
            pal4 = [pal[0]] + pal[p * 4 + 1:p * 4 + 4]
            img.alpha_composite(tile_image(rom, banks, nt[ty * 32 + tx] * 16, pal4), (tx * 8, ty * 8))
    for (y, t, a, x) in reversed(cap['oam']):
        top = (t & 1) * 0x1000 + (t & 0xFE) * 16
        p = pal[16 + (a & 3) * 4:16 + (a & 3) * 4 + 4]
        for half in (0, 1):
            ti = tile_image(rom, banks, top + 16 * (half ^ (1 if a & 0x80 else 0)), p)
            if a & 0x40:
                ti = ti.transpose(Image.FLIP_LEFT_RIGHT)
            if a & 0x80:
                ti = ti.transpose(Image.FLIP_TOP_BOTTOM)
            img.paste(ti, (x, y + 1 + half * 8), ti)   # paste recorta en los bordes
    return img


def main():
    rom = Rom()
    atlas = Atlas(512)
    stages = [build_stage(rom, cfg, atlas) for cfg in STAGES]
    build_sprites(rom, atlas)
    build_hud(rom, atlas)
    title = build_title(rom)
    sheet, frames = atlas.build()
    solid, oneway = slope_profiles(rom)
    data = {
        'source': 'Tiny Toon Adventures (USA).nes',
        'stages': stages,
        'slopes': {'solid': {str(k): v for k, v in solid.items()}, 'oneway': {str(k): v for k, v in oneway.items()}},
        'atlas': png_uri(sheet),
        'frames': frames,
        'title': png_uri(title),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        f.write('// Generado por remake/tools/extract.py a partir del ROM. No editar a mano.\n')
        f.write('window.TTA_DATA = ')
        json.dump(data, f, separators=(',', ':'))
        f.write(';\n')
    print('OK:', OUT, '%.1f KB' % (os.path.getsize(OUT) / 1024), '| sprites:', len(frames),
          '| atlas %dx%d' % sheet.size)
    for s in stages:
        print('  %s mapa %d  %dx%d celdas  %d zanahorias  %d objetos  %d celdas animadas  puertas %s' % (
            s['id'], s['map'], s['cols'], s['rows'], len(s['carrots']), len(s['objects']), len(s['anim']),
            s['doors'][:4]))


if __name__ == '__main__':
    main()
