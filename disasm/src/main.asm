; Tiny Toon Adventures (USA) - NES disassembly, top-level file.
; Build with `make` (requires cc65: ca65 + ld65).

.include "hardware.inc"

.segment "HEADER"
        .incbin "header.bin"

.include "prg_page0.asm"
.include "prg_page1.asm"
.include "prg_page2.asm"
.include "prg_page3.asm"
.include "prg_page4.asm"
.include "prg_page5.asm"
.include "prg_page6.asm"
.include "prg_page7.asm"

.segment "CHR"
        .incbin "../chr/chr.bin"
