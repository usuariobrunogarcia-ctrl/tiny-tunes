ROM      := build/tinytoon.nes
ORIGINAL := "../Tiny Toon Adventures (USA).nes"

.PHONY: all verify disasm clean

all: $(ROM)

$(ROM): src/*.asm src/*.inc src/header.bin chr/chr.bin nes.cfg
	@mkdir -p build
	ca65 -I src -o build/main.o src/main.asm
	ld65 -C nes.cfg -o $@ build/main.o

# Check that the rebuilt ROM is byte-identical to the original.
verify: $(ROM)
	cmp $(ROM) $(ORIGINAL) && echo "OK: ROM matches original"

# Regenerate src/ from the original ROM (edits in src/ will be lost!).
disasm:
	python3 tools/disasm.py

clean:
	rm -rf build
