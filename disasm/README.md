# Desensamblado de Tiny Toon Adventures (USA) — NES

Desensamblado en sintaxis **ca65** (cc65) del ROM `Tiny Toon Adventures (USA).nes`
que está en la raíz del repositorio. Al reensamblarlo se obtiene un ROM
**idéntico byte a byte** al original.

## Datos del ROM

| Campo | Valor |
|---|---|
| Mapper | 4 (MMC3) |
| PRG-ROM | 128 KB (8 páginas de 16 KB) |
| CHR-ROM | 128 KB |
| Vectores | NMI `$FE70`, RESET `$FDB7`, IRQ `$FA22` |

El juego cambia siempre los dos bancos de 8 KB de `$8000-$BFFF` a la vez
(rutinas `L_F8B9` / `L_F8F5` / `L_F8C6` / `L_F8DE`, con `A = $30 + 2*página`),
así que el PRG se trata como 8 páginas de 16 KB:

| Archivo | Dirección | Contenido (aprox.) |
|---|---|---|
| `src/prg_page0.asm` | `$8000` | Lógica principal del juego |
| `src/prg_page1.asm` | `$8000` | Datos de niveles (niveles `< $0F`) |
| `src/prg_page2.asm` | `$8000` | Datos de niveles + código |
| `src/prg_page3.asm` … `prg_page5.asm` | `$8000` | Código y datos |
| `src/prg_page6.asm` | `$8000` | Motor de sonido/música (se activa con `L_F8C6`) |
| `src/prg_page7.asm` | `$C000` | Página fija: RESET, NMI, IRQ, cambio de bancos |
| `chr/chr.bin` | — | Gráficos (CHR-ROM) en binario |

## Compilar

Necesitas [cc65](https://cc65.github.io/) (`apt install cc65`).

```sh
cd disasm
make          # genera build/tinytoon.nes
make verify   # comprueba que es idéntico al ROM original
```

## Cómo se generó

`tools/disasm.py` es un desensamblador de **trazado recursivo**: empieza en
los vectores y sigue saltos, ramas y llamadas; entiende el cambio de banco
(`lda #$3x` + `jsr` a la rutina de cambio) para saber a qué página va cada
llamada a `$8000-$BFFF`, y reconoce las tablas de saltos que van tras un
`jsr` a la rutina despachadora (`L_D05A`, que saca la dirección de retorno
de la pila). Todo lo que no se alcanza queda como `.byte`.

Etiquetas: `L_xxxx` en la página fija, `Pn_xxxx` en la página `n`. Los
registros de hardware usan nombres (`PPUCTRL`, `OAM_DMA`,
`MMC3_BANK_SELECT`…, ver `src/hardware.inc`).

Cobertura actual de código (ver `stats.txt`): página 0 ≈ 68 %, página 7 ≈ 51 %,
página 2 ≈ 40 %, páginas 3‑6 entre 7 % y 15 % (mucho es datos, pero también hay
código al que solo se llega por punteros indirectos que aún no se detectan).
Se pueden añadir puntos de entrada o tablas a mano en `tools/hints.json`:

```json
{
  "entries":     [{"page": 6, "addr": "8123", "name": "Sound_Init"}],
  "word_tables": [{"page": 7, "start": "FA55", "end": "FA61", "kind": "code"}]
}
```

y regenerar con `make disasm` (**ojo:** sobrescribe `src/`, así que conviene
hacerlo antes de empezar a renombrar etiquetas a mano).
