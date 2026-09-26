# Tiny Toon Adventures (NES): remake panorámico del nivel 1

Recreación en HTML5 del **nivel 1 (Acme Acres)** completo: fases 1-1 a 1-5, con el
sub-jefe (Elmyra) y el jefe final. **Todos los gráficos, mapas, colisiones y listas de
enemigos se sacan del ROM** (`Tiny Toon Adventures (USA).nes`) usando lo que se descubrió
en el desensamblado de `../disasm`.

- **Panorámico:** el campo de visión se adapta al ancho de la ventana (16:9, 21:9, vertical…).
  La altura de juego es la del original (192 px NES + marcador); lo que crece es lo que se ve
  a los lados. En las arenas de una sola pantalla (1-3 y 1-5) se prolongan los muros.
- **Alta resolución nativa:** el lienzo se dibuja a la resolución real de la pantalla
  (incluido `devicePixelRatio`). Los gráficos se reescalan al cargar con **xBR 4x**
  ([xBRjs](https://github.com/joseprio/xBRjs), licencia MIT, en `lib/`), que suaviza los
  bordes pixelados; después se escalan con filtrado de alta calidad al tamaño final.

## Jugar

Abre `index.html` en el navegador (funciona directamente desde el disco, sin servidor).

| Acción | Teclado | Mando |
|---|---|---|
| Moverse / agacharse | Flechas o WASD | Cruceta / stick |
| Saltar (A) | Z, J o Espacio | A |
| Correr (B) | X, K o Shift | B / X |
| Entrar por una puerta | Arriba delante de la puerta | Arriba |
| Pausa / empezar | Enter o P | Start |
| Pantalla completa | F | |

En pantallas táctiles aparecen botones en pantalla.

## Qué incluye

| Fase | Mapa ROM | Contenido |
|---|---|---|
| 1-1 | 1 (11 pantallas) | Colinas con pendientes, 40 zanahorias, ratas, ratas saltarinas, pájaros, globos (corazón y bola estrella) |
| 1-2 | 2 (12 pantallas) | Zona exterior y cueva, 24 zanahorias, Arnold el pitbull lanzando pesas, puerta de punto de control |
| 1-3 | 5 (1 pantalla) | Arena de Elmyra: te persigue para abrazarte y suelta corazones; la salida aparece a los ~10 s |
| 1-4 | 3 (12 pantallas × 2 alturas) | Castillo con scroll vertical, escaleras de un solo sentido, calabazas voladoras y rodantes, ratas, globo reloj y corazones, 2 puntos de control |
| 1-5 | 6 (1 pantalla) | Jefe en monopatín: patina, sube por las rampas, voltereta y proyectil; hay que pisarlo 6 veces |

Mecánicas: física de salto medida en el juego original (velocidad inicial −55/16 px/f,
gravedad 1/16 manteniendo A y 5/16 si no, caída máx. 3,5 px/f), andar 1,5 px/f,
correr 2,5 px/f y "súper carrera" (3,5 px/f) bajando pendientes; pendientes con los
perfiles del ROM; plataformas atravesables; corazones (aguantan un golpe); la bola
estrella convierte a Buster en **Plucky**, que planea volviendo a pulsar A en el aire
gastando el medidor POW; reloj (tiempo extra); zanahorias (vida extra cada 30); temporizador de 200;
puntos de control; pantalla de "STAGE CLEAR" con la bonificación de tiempo; marcador
original; pantalla de título original.

## Cómo se extraen los datos del ROM

`tools/extract.py` (necesita Pillow) genera `data/world1.js` con los mapas y las imágenes en
PNG a resolución NES:

```sh
pip install pillow
python3 tools/extract.py
```

Estructuras del ROM que usa (páginas de 16 KB como en `../disasm`):

| Dato | Dónde | Formato |
|---|---|---|
| Tabla de subniveles | pág. 1 `$8003` | 8 bytes por subnivel (`$063A`): mapa, x e y iniciales (en celdas de 16 px), pantallas y banderas |
| Bloques del mapa | pág. 1 `$8199` + 2·mapa | por pantalla, 8 columnas × 6 (o 14) filas de bloques de 32×32 px |
| Atributos | pág. 1 `$8335` + 2·mapa | 1 byte por bloque (paleta de cada cuadrante) |
| Cuadrantes | pág. 1 `$81ED` → 4 punteros por mapa | bloque → 4 metatiles de 16×16 |
| Metatile → tiles | pág. 7 `$F1BB/$F3BB/$F2BB/$F4BB` | sup-izq, sup-der, inf-izq, inf-der |
| Colisión | pág. 7 `$DFFF` | tipo por metatile: `$15` sólido, `$14` suelo y pared, `$0A-$13` suelos con pendiente, `$05-$09` plataformas atravesables |
| Perfiles de pendiente | pág. 7 `$DF5F` y `$DF0F` | 16 alturas por tipo |
| Objetos | pág. 5 `$82BD` + 2·subnivel | lista `[tipo, x, y]` terminada en `$FF` |
| Paletas de fondo | pág. 2 `$B1E0` | 17 bytes por entrada |
| Metasprites | pág. 3 `$9333` (genérica), `$AFCF`, `$8358` (por subnivel), `$8001` (jugador) | ver `tools/sprites.py` |
| Zanahoria recogida | pág. 7 `$DD63` | metatile que la sustituye |

Lo que el juego decide en tiempo de ejecución (qué bancos CHR y paletas de sprites hay
cargados en cada momento, la tabla de nombres del marcador y de la pantalla de título) se
tomó observando el juego en un emulador y está en `tools/spritecfg.json`,
`tools/title_capture.json` y en las constantes de `tools/extract.py`. Son solo números
de banco, índices de tile y colores; los píxeles siempre se leen del CHR-ROM.

## Diferencias con el original

- El comportamiento de los enemigos se reprodujo a partir de sus trayectorias y
  animaciones observadas en el emulador, no traduciendo su código 6502, así que los
  patrones son aproximados (velocidades y fotogramas sí son los del original).
- No hay sonido ni música (el motor de sonido de la página 6 no está portado).
- Solo está Plucky como ayudante (en el original se elige en la ruleta de Shirley).
- Algunos valores no se sacaron del código original y son elección mía: el reloj suma
  50 segundos, cada 30 zanahorias dan una vida, el jefe aguanta 6 pisotones y Arnold 2.
- Los enemigos aparecen al entrar en el campo de visión ancho, no a las 18 columnas
  fijas del original.
