"""Acceso de bajo nivel al ROM de Tiny Toon Adventures (USA) para el remake.

Todas las direcciones vienen del desensamblado de ../../disasm (ver
remake/README.md para la explicación de cada estructura).
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROM_PATH = os.path.join(HERE, '..', '..', 'Tiny Toon Adventures (USA).nes')

# Paleta NES (2C02) en RGB.
NES_PALETTE = [
    (84, 84, 84), (0, 30, 116), (8, 16, 144), (48, 0, 136), (68, 0, 100), (92, 0, 48), (84, 4, 0), (60, 24, 0),
    (32, 42, 0), (8, 58, 0), (0, 64, 0), (0, 60, 0), (0, 50, 60), (0, 0, 0), (0, 0, 0), (0, 0, 0),
    (152, 150, 152), (8, 76, 196), (48, 50, 236), (92, 30, 228), (136, 20, 176), (160, 20, 100), (152, 34, 32), (120, 60, 0),
    (84, 90, 0), (40, 114, 0), (8, 124, 0), (0, 118, 40), (0, 102, 120), (0, 0, 0), (0, 0, 0), (0, 0, 0),
    (236, 238, 236), (76, 154, 236), (120, 124, 236), (176, 98, 236), (228, 84, 236), (236, 88, 180), (236, 106, 100), (212, 136, 32),
    (160, 170, 0), (116, 196, 0), (76, 208, 32), (56, 204, 108), (56, 180, 204), (60, 60, 60), (0, 0, 0), (0, 0, 0),
    (236, 238, 236), (168, 204, 236), (188, 188, 236), (212, 178, 236), (236, 174, 236), (236, 174, 212), (236, 180, 176), (228, 196, 144),
    (204, 210, 120), (180, 222, 120), (168, 226, 144), (152, 226, 180), (160, 214, 228), (160, 162, 160), (0, 0, 0), (0, 0, 0),
]


def s8(v):
    return v - 256 if v > 127 else v


class Rom:
    def __init__(self, path=ROM_PATH):
        data = open(path, 'rb').read()
        assert data[:4] == b'NES\x1a', 'no es un ROM iNES'
        self.prg = data[16:16 + 8 * 0x4000]
        self.chr = data[16 + 8 * 0x4000:]
        assert len(self.chr) == 0x20000

    # --- PRG: el juego trata el PRG como 8 páginas de 16 KB; la 7 es fija en $C000
    def off(self, page, addr):
        base = 0xC000 if page == 7 else 0x8000
        assert base <= addr < base + 0x4000, (page, hex(addr))
        return page * 0x4000 + (addr - base)

    def b(self, page, addr):
        return self.prg[self.off(page, addr)]

    def w(self, page, addr):
        o = self.off(page, addr)
        return self.prg[o] | self.prg[o + 1] << 8

    def bytes(self, page, addr, n):
        o = self.off(page, addr)
        return self.prg[o:o + n]

    # --- CHR: bancos de 1 KB (MMC3)
    def tile8(self, bank1k, index):
        """Devuelve un tile 8x8 como lista de 8 filas de índices 0..3."""
        o = bank1k * 1024 + (index & 63) * 16
        d = self.chr[o:o + 16]
        return [[((d[r] >> (7 - c)) & 1) | (((d[r + 8] >> (7 - c)) & 1) << 1) for c in range(8)] for r in range(8)]

    def pattern(self, banks, addr):
        """Tile 8x8 en la dirección PPU `addr` ($0000-$1FFF) dado el estado de bancos.

        banks = [R0, R1, R2, R3, R4, R5] como los escribe el juego ($32-$37):
        R0/R1 son bancos de 2 KB en $0000/$0800, R2-R5 bancos de 1 KB en $1000-$1C00.
        """
        if addr < 0x1000:
            r = banks[0] if addr < 0x800 else banks[1]
            bank1k = (r & 0xFE) + ((addr >> 10) & 1)
        else:
            bank1k = banks[2 + ((addr - 0x1000) >> 10)]
        return self.tile8(bank1k, (addr >> 4) & 63)
