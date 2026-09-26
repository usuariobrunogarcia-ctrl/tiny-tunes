"""Mapas de nivel, colisión y objetos (ver remake/README.md).

Jerarquía del mapa (página 1, rutina L_EA65 de la página 7):
  pantalla (256 px) -> 8 columnas x N filas de bloques de 32x32 (1 byte por bloque)
  bloque -> 4 metatiles de 16x16 (tablas de cuadrantes TL/TR/BL/BR, $81ED + 8*mapa)
  bloque -> 1 byte de atributos (paleta de cada cuadrante), tabla $8335 + 2*mapa
  metatile -> 4 tiles 8x8 (tablas fijas $F1BB TL, $F2BB BL, $F3BB TR, $F4BB BR)
  metatile -> tipo de colisión (tabla $DFFF, página 7)
"""
from nesrom import NES_PALETTE, s8

LEVEL_TABLE = 0x8003      # página 1: 8 bytes por subnivel ($063A)
MAP_SCREENS = 0x8199      # página 1: puntero a los bloques de cada mapa
MAP_ATTRS = 0x8335        # página 1: atributos por bloque
MAP_QUADS = 0x81ED        # página 1: puntero a tabla de 4 punteros por mapa
MT_TILES = (0xF1BB, 0xF3BB, 0xF2BB, 0xF4BB)   # TL, TR, BL, BR (página 7)
COLLISION = 0xDFFF        # página 7
SLOPE_SOLID = 0xDF5F      # página 7: perfiles de altura tipos $0A-$13 (16 bytes c/u)
SLOPE_ONEWAY = 0xDF0F     # página 7: perfiles tipos $05-$09
OBJ_LISTS = 0x82BD        # página 5: listas de objetos por subnivel
BG_PALETTES = 0xB1E0      # página 2: 17 bytes por entrada (16 colores + fondo universal)
ITEM_REPLACE = 0xDD63     # página 7: metatile que sustituye a una zanahoria recogida (por fase $53)


def level_entry(rom, sub):
    e = rom.bytes(1, LEVEL_TABLE + sub * 8, 8)
    flags = e[3]
    return {
        'map': e[0],
        'start_x': (e[1] << 4) | (8 if flags & 2 else 0),  # $62:$61
        'start_y': e[2] << 4,                              # $6A:$69
        'screens': flags >> 4,
        'vertical': flags & 1,
        'tall': (flags >> 3) & 1,                          # $062F: 14 filas de bloques
        'start_air': (flags >> 2) & 1,
        'raw': list(e),
    }


def decode_map(rom, mapid, screens, tall):
    stride = 0x70 if tall else 0x30
    brows = stride // 8
    scr = rom.w(1, MAP_SCREENS + 2 * mapid)
    att = rom.w(1, MAP_ATTRS + 2 * mapid)
    q = rom.w(1, MAP_QUADS) + mapid * 8
    quads = [rom.w(1, q + 2 * i) for i in range(4)]
    cols, rows = screens * 16, brows * 2
    mt = [[0] * cols for _ in range(rows)]
    pal = [[0] * cols for _ in range(rows)]
    for s in range(screens):
        for r in range(brows):
            for c in range(8):
                blk = rom.b(1, scr + s * stride + r * 8 + c)
                a = rom.b(1, att + blk)
                for qi, (qx, qy) in enumerate(((0, 0), (1, 0), (0, 1), (1, 1))):
                    X = s * 16 + c * 2 + qx
                    Y = r * 2 + qy
                    mt[Y][X] = rom.b(1, quads[qi] + blk)
                    pal[Y][X] = (a >> ((qy * 2 + qx) * 2)) & 3
    return mt, pal


def collision_table(rom):
    return [rom.b(7, COLLISION + m) for m in range(256)]


def slope_profiles(rom):
    solid = {t: list(rom.bytes(7, SLOPE_SOLID + (t - 0x0A) * 16, 16)) for t in range(0x0A, 0x14)}
    oneway = {t: list(rom.bytes(7, SLOPE_ONEWAY + (t - 0x05) * 16, 16)) for t in range(0x05, 0x0A)}
    return solid, oneway


def object_list(rom, sub):
    p = rom.w(5, OBJ_LISTS + 2 * sub)
    out = []
    while rom.b(5, p) != 0xFF:
        t, x, y = rom.bytes(5, p, 3)
        out.append((t, x, y))
        p += 3
    return out


def bg_palette(rom, index):
    e = rom.bytes(2, BG_PALETTES + index * 17, 17)
    return list(e[:16]), e[16]


def render_metatile(rom, m, palsel, banks, pal16, bgcolor):
    """Metatile 16x16 -> filas de colores RGB."""
    out = [[None] * 16 for _ in range(16)]
    for (tx, ty), table in zip(((0, 0), (1, 0), (0, 1), (1, 1)), MT_TILES):
        t = rom.b(7, table + m)
        tile = rom.pattern(banks, t * 16)
        for y in range(8):
            for x in range(8):
                c = tile[y][x]
                col = bgcolor if c == 0 else pal16[palsel * 4 + c]
                out[ty * 8 + y][tx * 8 + x] = NES_PALETTE[col & 0x3F]
    return out


def render_map(rom, mt, pal, banks, pal16, bgcolor, replace=None):
    """Imagen RGB completa del mapa (lista de filas de bytes)."""
    rows, cols = len(mt), len(mt[0])
    W, H = cols * 16, rows * 16
    img = bytearray(W * H * 3)
    cache = {}
    for Y in range(rows):
        for X in range(cols):
            m = mt[Y][X]
            if replace and m in replace:
                m = replace[m]
            key = (m, pal[Y][X])
            if key not in cache:
                cache[key] = render_metatile(rom, m, pal[Y][X], banks, pal16, bgcolor)
            tile = cache[key]
            for y in range(16):
                o = ((Y * 16 + y) * W + X * 16) * 3
                row = tile[y]
                for x in range(16):
                    img[o + x * 3:o + x * 3 + 3] = bytes(row[x])
    return W, H, img
