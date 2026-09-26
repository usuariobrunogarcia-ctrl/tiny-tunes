#!/usr/bin/env python3
"""Recursive-traversal disassembler for Tiny Toon Adventures (USA) (NES, MMC3).

PRG layout: 8 pages of 16 KB. Pages 0-6 are switched into $8000-$BFFF,
page 7 is fixed at $C000-$FFFF. Output is ca65 syntax; `make` rebuilds a
byte-identical ROM.
"""
import os, sys, json

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ROM = os.path.join(ROOT, '..', 'Tiny Toon Adventures (USA).nes')

# ---- 6502 opcode table (official opcodes only) ----
MODES = {  # mode: operand size
    'imp': 0, 'acc': 0, 'imm': 1, 'zp': 1, 'zpx': 1, 'zpy': 1, 'izx': 1, 'izy': 1,
    'rel': 1, 'abs': 2, 'abx': 2, 'aby': 2, 'ind': 2,
}
OPS = {}
def _op(name, *pairs):
    for mode, code in pairs:
        OPS[code] = (name, mode)
_op('adc', ('imm',0x69),('zp',0x65),('zpx',0x75),('abs',0x6D),('abx',0x7D),('aby',0x79),('izx',0x61),('izy',0x71))
_op('and', ('imm',0x29),('zp',0x25),('zpx',0x35),('abs',0x2D),('abx',0x3D),('aby',0x39),('izx',0x21),('izy',0x31))
_op('asl', ('acc',0x0A),('zp',0x06),('zpx',0x16),('abs',0x0E),('abx',0x1E))
_op('bit', ('zp',0x24),('abs',0x2C))
for n,c in (('bpl',0x10),('bmi',0x30),('bvc',0x50),('bvs',0x70),('bcc',0x90),('bcs',0xB0),('bne',0xD0),('beq',0xF0)):
    _op(n, ('rel',c))
_op('brk', ('imp',0x00))
_op('cmp', ('imm',0xC9),('zp',0xC5),('zpx',0xD5),('abs',0xCD),('abx',0xDD),('aby',0xD9),('izx',0xC1),('izy',0xD1))
_op('cpx', ('imm',0xE0),('zp',0xE4),('abs',0xEC))
_op('cpy', ('imm',0xC0),('zp',0xC4),('abs',0xCC))
_op('dec', ('zp',0xC6),('zpx',0xD6),('abs',0xCE),('abx',0xDE))
_op('eor', ('imm',0x49),('zp',0x45),('zpx',0x55),('abs',0x4D),('abx',0x5D),('aby',0x59),('izx',0x41),('izy',0x51))
for n,c in (('clc',0x18),('sec',0x38),('cli',0x58),('sei',0x78),('clv',0xB8),('cld',0xD8),('sed',0xF8),
            ('tax',0xAA),('txa',0x8A),('dex',0xCA),('inx',0xE8),('tay',0xA8),('tya',0x98),('dey',0x88),('iny',0xC8),
            ('rti',0x40),('rts',0x60),('txs',0x9A),('tsx',0xBA),('pha',0x48),('pla',0x68),('php',0x08),('plp',0x28),('nop',0xEA)):
    _op(n, ('imp',c))
_op('inc', ('zp',0xE6),('zpx',0xF6),('abs',0xEE),('abx',0xFE))
_op('jmp', ('abs',0x4C),('ind',0x6C))
_op('jsr', ('abs',0x20))
_op('lda', ('imm',0xA9),('zp',0xA5),('zpx',0xB5),('abs',0xAD),('abx',0xBD),('aby',0xB9),('izx',0xA1),('izy',0xB1))
_op('ldx', ('imm',0xA2),('zp',0xA6),('zpy',0xB6),('abs',0xAE),('aby',0xBE))
_op('ldy', ('imm',0xA0),('zp',0xA4),('zpx',0xB4),('abs',0xAC),('abx',0xBC))
_op('lsr', ('acc',0x4A),('zp',0x46),('zpx',0x56),('abs',0x4E),('abx',0x5E))
_op('ora', ('imm',0x09),('zp',0x05),('zpx',0x15),('abs',0x0D),('abx',0x1D),('aby',0x19),('izx',0x01),('izy',0x11))
_op('rol', ('acc',0x2A),('zp',0x26),('zpx',0x36),('abs',0x2E),('abx',0x3E))
_op('ror', ('acc',0x6A),('zp',0x66),('zpx',0x76),('abs',0x6E),('abx',0x7E))
_op('sbc', ('imm',0xE9),('zp',0xE5),('zpx',0xF5),('abs',0xED),('abx',0xFD),('aby',0xF9),('izx',0xE1),('izy',0xF1))
_op('sta', ('zp',0x85),('zpx',0x95),('abs',0x8D),('abx',0x9D),('aby',0x99),('izx',0x81),('izy',0x91))
_op('stx', ('zp',0x86),('zpy',0x96),('abs',0x8E))
_op('sty', ('zp',0x84),('zpx',0x94),('abs',0x8C))

HW = {
    0x2000:'PPUCTRL',0x2001:'PPUMASK',0x2002:'PPUSTATUS',0x2003:'OAMADDR',0x2004:'OAMDATA',
    0x2005:'PPUSCROLL',0x2006:'PPUADDR',0x2007:'PPUDATA',
    0x4000:'SQ1_VOL',0x4001:'SQ1_SWEEP',0x4002:'SQ1_LO',0x4003:'SQ1_HI',
    0x4004:'SQ2_VOL',0x4005:'SQ2_SWEEP',0x4006:'SQ2_LO',0x4007:'SQ2_HI',
    0x4008:'TRI_LINEAR',0x400A:'TRI_LO',0x400B:'TRI_HI',0x400C:'NOISE_VOL',0x400E:'NOISE_LO',0x400F:'NOISE_HI',
    0x4010:'DMC_FREQ',0x4011:'DMC_RAW',0x4012:'DMC_START',0x4013:'DMC_LEN',
    0x4014:'OAM_DMA',0x4015:'APU_STATUS',0x4016:'JOY1',0x4017:'JOY2_FRAME',
}
MMC3 = {0x8000:'MMC3_BANK_SELECT',0x8001:'MMC3_BANK_DATA',0xA000:'MMC3_MIRRORING',0xA001:'MMC3_PRG_RAM',
        0xC000:'MMC3_IRQ_LATCH',0xC001:'MMC3_IRQ_RELOAD',0xE000:'MMC3_IRQ_DISABLE',0xE001:'MMC3_IRQ_ENABLE'}
STORES = {'sta','stx','sty'}

NPAGES = 8
FIXED = 7

class Page:
    def __init__(self, idx, data):
        self.idx = idx
        self.data = data
        self.base = 0xC000 if idx == FIXED else 0x8000
        self.kind = [None] * len(data)   # 'op' | 'arg' | None(data)
        self.labels = {}                  # addr -> name
        self.entries = set()
        self.xref = {}                    # insn addr -> page of its jsr/jmp target
        self.words = {}                   # offset -> 'code'/'data' pointer words
    def contains(self, a):
        return self.base <= a < self.base + len(self.data)
    def lbl(self, a):
        pre = 'L' if self.idx == FIXED else 'P%d' % self.idx
        return '%s_%04X' % (pre, a)

def insn_at(page, a):
    o = a - page.base
    if o < 0 or o >= len(page.data):
        return None
    op = page.data[o]
    if op not in OPS:
        return None
    name, mode = OPS[op]
    n = MODES[mode]
    if o + n >= len(page.data):
        return None
    arg = int.from_bytes(page.data[o+1:o+1+n], 'little') if n else None
    return name, mode, n, arg

def page_for(target, src_page):
    if target >= 0xC000:
        return FIXED
    if 0x8000 <= target < 0xC000:
        return src_page.idx if src_page.idx != FIXED else None
    return None

def is_dispatcher(page, a):
    """A routine that pulls its own return address within its first few
    instructions (jump-table-after-JSR idiom)."""
    pulls = 0
    for _ in range(8):
        ins = insn_at(page, a)
        if ins is None:
            return False
        name, mode, n, arg = ins
        if name == 'pla':
            pulls += 1
            if pulls == 2:
                return True
        if name in ('rts', 'rti', 'jmp', 'jsr', 'pha') or mode == 'rel':
            return False
        a += 1 + n
    return False

BANK_SWITCH = {0xF8B9, 0xF8C6, 0xF8DE, 0xF8F5}   # A = bank number ($30 + 2*page)
BANK_CHOOSE = {0xF75C: (1, 2)}                    # picks page 1 or 2 from the level number
A_CLOBBER = {'lda','txa','tya','pla','adc','sbc','and','ora','eor','asl','lsr','rol','ror'}

def trace(page, start, pages, out_calls, out_tables, bank0=None):
    """Trace one routine (branches followed, JSR/JMP targets reported via
    out_calls). Returns (dict addr->size, dict addr->target page), or None
    if the trace runs into garbage."""
    visited = {}
    xref = {}
    own = None if page.idx == FIXED else page.idx
    stack = [(start, None, bank0 if bank0 is not None else own)]
    while stack:
        a, aval, bank = stack.pop()
        while True:
            o = a - page.base
            if not page.contains(a):
                return None
            if a in visited or page.kind[o] == 'op':
                break
            if page.kind[o] in ('arg', 'word'):
                return None
            ins = insn_at(page, a)
            if ins is None or ins[0] == 'brk':
                return None
            name, mode, n, arg = ins
            for k in range(1, n + 1):
                if page.kind[o + k] is not None or (a + k) in visited:
                    return None
            visited[a] = n
            nxt = a + 1 + n
            if mode == 'rel':
                stack.append((nxt + (arg - 256 if arg >= 128 else arg), aval, bank))
            elif name in ('jsr', 'jmp') and mode == 'abs':
                if arg >= 0xC000:
                    tps = [FIXED]
                elif 0x8000 <= arg < 0xC000:
                    tps = list(bank) if isinstance(bank, tuple) else ([bank] if bank is not None else [None])
                else:
                    tps = []
                for tp in tps:
                    out_calls.append((tp, arg, a, bank if tp == FIXED else None))
                if len(tps) == 1 and tps[0] is not None:
                    xref[a] = tps[0]
                if name == 'jsr':
                    if arg in BANK_SWITCH:
                        bank = ((aval & 0x0F) >> 1) if aval is not None else None
                    elif arg in BANK_CHOOSE:
                        bank = BANK_CHOOSE[arg]
                    if len(tps) == 1 and tps[0] is not None and is_dispatcher(pages[tps[0]], arg):
                        out_tables.append(nxt)
                        break
            if name == 'lda' and mode == 'imm':
                aval = arg
            elif name in A_CLOBBER or name == 'jsr':
                aval = None
            if name in ('rts', 'rti', 'jmp'):
                break
            a = nxt
    return visited, xref

def commit(page, visited):
    for a, n in visited.items():
        o = a - page.base
        page.kind[o] = 'op'
        for k in range(1, n + 1):
            page.kind[o + k] = 'arg'

def main():
    rom = open(ROM, 'rb').read()
    hdr, prg, chr_ = rom[:16], rom[16:16+0x20000], rom[16+0x20000:]
    pages = [Page(i, prg[i*0x4000:(i+1)*0x4000]) for i in range(NPAGES)]
    cfg = json.load(open(os.path.join(HERE, 'hints.json')))

    queue = []  # (page idx or None, addr, origin)
    fx = pages[FIXED]
    for va, nm in ((0xFFFA,'NMI'),(0xFFFC,'RESET'),(0xFFFE,'IRQ')):
        t = int.from_bytes(fx.data[va-0xC000:va-0xC000+2], 'little')
        queue.append((FIXED, t, 'vector'))
        fx.labels[t] = nm
    # bank-switch trampolines ("lda #bank / jsr switch / ...") that are only
    # reached through pointer tables
    for pg in pages:
        d = pg.data
        for o in range(len(d) - 5):
            if d[o] == 0xA9 and d[o+2] == 0x20 and int.from_bytes(d[o+3:o+5], 'little') in BANK_SWITCH:
                s0 = o
                if o >= 1 and d[o-1] == 0x48:
                    s0 = o - 1
                    if o >= 4 and d[o-4:o-1] == bytes([0x8A, 0x48, 0x98]):
                        s0 = o - 4
                queue.append((pg.idx, pg.base + s0, 'trampoline'))
    for h in cfg.get('entries', []):
        queue.append((h['page'], int(h['addr'], 16), 'hint'))
        if 'name' in h:
            pages[h['page']].labels[int(h['addr'], 16)] = h['name']
    for h in cfg.get('word_tables', []):
        p = pages[h['page']]
        s, e = int(h['start'], 16), int(h['end'], 16)
        for a in range(s, e, 2):
            p.words[a - p.base] = h.get('kind', 'code')
            t = int.from_bytes(p.data[a-p.base:a-p.base+2], 'little') + h.get('add', 0)
            if h.get('kind', 'code') == 'code':
                tp = FIXED if t >= 0xC000 else h.get('target_page', h['page'])
                queue.append((tp, t, 'table'))

    unknown = {}
    rejected = []
    dispatchers = set()
    for pi, p in enumerate(pages):
        for o in range(len(p.data)):
            pass
    seen = set()
    while queue:
        pi, a, why = queue.pop(0)
        if pi is None:
            unknown.setdefault(a, []).append(why)
            continue
        if (pi, a) in seen:
            continue
        seen.add((pi, a))
        p = pages[pi]
        if not p.contains(a):
            continue
        if is_dispatcher(p, a):
            dispatchers.add((pi, a))
        calls, tables = [], []
        r = trace(p, a, pages, calls, tables)
        if r is None:
            rejected.append((pi, a, why))
            continue
        v, xr = r
        commit(p, v)
        p.xref.update(xr)
        p.entries.add(a)
        for tp, t, src, _b in calls:
            queue.append((tp, t, (pi, src)))
        for ta in tables:
            # inline word table after a JSR to a dispatcher: read pointers
            # until one doesn't look like a code address in range
            o = ta - p.base
            limit = len(p.data)
            while o + 1 < limit and p.kind[o] is None and (p.base + o) not in p.entries:
                t = int.from_bytes(p.data[o:o+2], 'little')
                tp = page_for(t, p)
                if tp is None or insn_at(pages[tp], t) is None:
                    break
                if tp == pi and t > ta:
                    limit = min(limit, t - p.base)   # table ends where code it points to begins
                    if o + 1 >= limit:
                        break
                if o != ta - p.base and (p.base + o) in p.labels:
                    break
                p.words[o] = 'code'
                p.kind[o] = 'word'; p.kind[o+1] = 'word'
                queue.append((tp, t, ('table', pi, ta)))
                o += 2
    # labels for branch/jump targets and data references
    for p in pages:
        for o, k in enumerate(p.kind):
            if k != 'op':
                continue
            a = p.base + o
            name, mode, n, arg = insn_at(p, a)
            if mode == 'rel':
                t = a + 2 + (arg - 256 if arg >= 128 else arg)
                p.labels.setdefault(t, p.lbl(t))
            elif mode in ('abs', 'abx', 'aby', 'ind'):
                tp = p.xref.get(a, page_for(arg, p)) if arg >= 0x8000 else None
                if tp is None:
                    continue
                if name in STORES and arg in MMC3 and mode == 'abs':
                    continue
                q = pages[tp]
                to = arg - q.base
                if q.kind[to] != 'arg':
                    q.labels.setdefault(arg, q.lbl(arg))
        for o, kind in p.words.items():
            t = int.from_bytes(p.data[o:o+2], 'little')
            tp = page_for(t, p)
            if tp is not None and pages[tp].contains(t) and pages[tp].kind[t-pages[tp].base] != 'arg':
                pages[tp].labels.setdefault(t, pages[tp].lbl(t))

    # ---- emit ----
    out = os.path.join(ROOT, 'src')
    os.makedirs(out, exist_ok=True)
    for p in pages:
        emit(p, pages, os.path.join(out, 'prg_page%d.asm' % p.idx))
    os.makedirs(os.path.join(ROOT, 'chr'), exist_ok=True)
    open(os.path.join(ROOT, 'chr', 'chr.bin'), 'wb').write(chr_)
    open(os.path.join(ROOT, 'src', 'header.bin'), 'wb').write(hdr)
    # stats
    st = []
    for p in pages:
        code = sum(1 for k in p.kind if k in ('op','arg'))
        st.append('page %d ($%04X): %5d/%d bytes traced as code (%.1f%%), %d labels'
                  % (p.idx, p.base, code, len(p.data), 100.0*code/len(p.data), len(p.labels)))
    st.append('unresolved calls from fixed page into $8000-$BFFF: %d' % len(unknown))
    st.append('rejected entry points: %d' % len(rejected))
    for r in rejected:
        st.append('  rejected page %s $%04X from %s' % (r[0], r[1], r[2]))
    open(os.path.join(ROOT, 'stats.txt'), 'w').write('\n'.join(st) + '\n')
    print('\n'.join(st))

def fmt_operand(p, pages, name, mode, n, arg, a):
    def ref(v, width):
        if v in HW:
            return HW[v]
        if name in STORES and mode == 'abs' and v in MMC3:
            return MMC3[v]
        if v >= 0x8000:
            tp = p.xref.get(a, page_for(v, p))
            if tp is not None:
                q = pages[tp]
                if v in q.labels:
                    return q.labels[v]
        return ('$%02X' % v) if width == 1 else ('$%04X' % v)
    if mode in ('imp',):
        return ''
    if mode == 'acc':
        return 'a'
    if mode == 'imm':
        return '#$%02X' % arg
    if mode == 'zp':  return '$%02X' % arg
    if mode == 'zpx': return '$%02X,x' % arg
    if mode == 'zpy': return '$%02X,y' % arg
    if mode == 'izx': return '($%02X,x)' % arg
    if mode == 'izy': return '($%02X),y' % arg
    if mode == 'rel':
        t = a + 2 + (arg - 256 if arg >= 128 else arg)
        return p.labels[t]
    force = 'a:' if arg < 0x100 else ''
    if mode == 'abs': return force + ref(arg, 2)
    if mode == 'abx': return force + ref(arg, 2) + ',x'
    if mode == 'aby': return force + ref(arg, 2) + ',y'
    if mode == 'ind': return '(' + ref(arg, 2) + ')'

def emit(p, pages, path):
    L = []
    L.append('; Tiny Toon Adventures (USA) - PRG page %d (16 KB), mapped at $%04X' % (p.idx, p.base))
    L.append('; Generated by tools/disasm.py. Code was found by recursive tracing;')
    L.append('; everything not reached is emitted as .byte data.')
    L.append('')
    L.append('.segment "PRG%d"' % p.idx)
    L.append('')
    o = 0
    N = len(p.data)
    data_run = []
    def flush():
        if data_run:
            for i in range(0, len(data_run), 16):
                chunk = data_run[i:i+16]
                L.append('        .byte ' + ','.join('$%02X' % b for b in chunk))
            data_run.clear()
    while o < N:
        a = p.base + o
        if a in p.labels:
            flush()
            if p.kind[o] == 'op' and o > 0 and p.kind[o-1] not in ('op','arg'):
                L.append('')
            L.append('%s:' % p.labels[a])
        if p.kind[o] == 'op':
            flush()
            name, mode, n, arg = insn_at(p, a)
            opnd = fmt_operand(p, pages, name, mode, n, arg, a)
            line = '        %s %s' % (name, opnd) if opnd else '        %s' % name
            L.append('%-40s; $%04X' % (line, a))
            if name in ('rts', 'rti', 'jmp'):
                L.append('')
            o += 1 + n
            continue
        if o in p.words and o + 1 < N and (a + 1) not in p.labels:
            flush()
            t = int.from_bytes(p.data[o:o+2], 'little')
            tp = page_for(t, p)
            s = '$%04X' % t
            if tp is not None and t in pages[tp].labels:
                s = pages[tp].labels[t]
            L.append('        .word %s' % s)
            o += 2
            continue
        data_run.append(p.data[o])
        if len(data_run) == 16:
            flush()
        o += 1
    flush()
    open(path, 'w').write('\n'.join(L) + '\n')

if __name__ == '__main__':
    main()
