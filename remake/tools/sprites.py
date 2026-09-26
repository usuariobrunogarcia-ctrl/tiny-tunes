"""Metasprites del juego (motor de sprites de la página 3, rutinas P3_8009/P3_8183).

Tablas:
  * genérica   P3_9333 : fotogramas $00-$7F de los objetos (enemigos, ítems...)
  * alternativa P3_AFCF: la usan los huecos $0D/$0E (y $0C cuando $4C=1)
  * por fase   P3_8358 : fotogramas $80-$FF, una tabla por subnivel ($063A)
  * jugador    P3_8001 : una tabla por personaje ($2B: 0 = Buster)

Formato genérico: byte N y luego, leyendo hacia atrás desde N en pasos de 4,
  [N] = x (con signo), [N-1] = atributos, [N-2] = tile (8x16), [N-3] = y (con signo)
Formato del jugador: byte N (número de sprites) y N grupos [y, tile, atributos, x].
"""
from nesrom import s8, NES_PALETTE


def meta_generic(rom, table, fr):
    p = rom.w(3, table + 2 * (fr & 0x7F))
    n = rom.b(3, p)
    out = []
    y = n
    while y > 0:
        out.append((s8(rom.b(3, p + y - 3)), rom.b(3, p + y - 2), rom.b(3, p + y - 1), s8(rom.b(3, p + y))))
        y -= 4
    return out


def meta_stage(rom, sub, fr):
    table = rom.w(3, 0x8358 + 2 * sub)
    p = rom.w(3, table + ((fr * 2) & 0xFF))
    n = rom.b(3, p)
    out = []
    y = n
    while y > 0:
        out.append((s8(rom.b(3, p + y - 3)), rom.b(3, p + y - 2), rom.b(3, p + y - 1), s8(rom.b(3, p + y))))
        y -= 4
    return out


def meta_player(rom, char, fr):
    table = rom.w(3, 0x8001 + 2 * char)
    p = rom.w(3, table + 2 * fr)
    n = rom.b(3, p)
    out = []
    for i in range(n):
        y, t, a, x = rom.bytes(3, p + 1 + 4 * i, 4)
        out.append((s8(y), t, a, s8(x)))
    return out


def meta(rom, kind, fr, sub=0, char=0):
    if kind == 'g':
        return meta_generic(rom, 0x9333, fr)
    if kind == 'a':
        return meta_generic(rom, 0xAFCF, fr)
    if kind == 'l':
        return meta_stage(rom, sub, fr)
    if kind == 'p':
        return meta_player(rom, char, fr)
    raise ValueError(kind)


def render(rom, sprites, banks, pal16, player=False, pal_or=0):
    """Dibuja un metasprite. Devuelve (w, h, ox, oy, pixels RGBA fila a fila).

    (ox, oy) es la posición del origen del objeto dentro de la imagen.
    pal16: los 16 colores NES de las paletas de sprites ($3F10-$3F1F).
    """
    if not sprites:
        return None
    cells = []
    for (y, t, a, x) in sprites:
        a |= pal_or
        top = (t & 1) * 0x1000 + (t & 0xFE) * 16
        tiles = [rom.pattern(banks, top), rom.pattern(banks, top + 16)]
        rows = tiles[0] + tiles[1]
        if a & 0x40:
            rows = [r[::-1] for r in rows]
        if a & 0x80:
            rows = rows[::-1]
        cells.append((x, y, a & 3, rows))
    minx = min(c[0] for c in cells)
    miny = min(c[1] for c in cells)
    maxx = max(c[0] + 8 for c in cells)
    maxy = max(c[1] + 16 for c in cells)
    w, h = maxx - minx, maxy - miny
    px = [[None] * w for _ in range(h)]
    # En la NES el primer sprite de la OAM tiene prioridad: pintamos en orden inverso.
    for (x, y, p, rows) in reversed(cells):
        for ry in range(16):
            for rx in range(8):
                c = rows[ry][rx]
                if c:
                    px[y - miny + ry][x - minx + rx] = NES_PALETTE[pal16[p * 4 + c] & 0x3F]
    return w, h, -minx, -miny, px
