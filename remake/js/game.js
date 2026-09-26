/*
 * Tiny Toon Adventures (NES) - remake panorámico del nivel 1 (Acme Acres, fases 1-1 a 1-5).
 *
 * Todos los gráficos, mapas, colisiones y listas de objetos vienen del ROM a través de
 * data/world1.js (generado por tools/extract.py). Aquí se reescalan con xBR 4x al cargar
 * y se dibujan a la resolución nativa de la pantalla, con un campo de visión que se
 * adapta al ancho de la ventana.
 *
 * Unidades de juego: píxeles NES y fotogramas a 60 Hz (como el original).
 */
(function () {
  'use strict';

  const D = window.TTA_DATA;
  const HQ = 4;                       // factor del reescalado xBR
  const PLAY_H = 192;                 // alto del área de juego (6 filas de bloques de 32 px)
  const HUD_H = 32;
  const VIEW_H = PLAY_H + HUD_H;
  const MIN_VIEW_W = 256;
  const STEP = 1000 / 60;

  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');

  // ------------------------------------------------------------------ utilidades
  const b64bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sign = v => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const nextFrame = () => new Promise(r => setTimeout(r, 0));

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function loadImage(uri) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = uri;
    });
  }

  function imageCanvas(img) {
    const c = makeCanvas(img.width, img.height);
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  }

  // Reescala con xBR 4x una región (con margen de contexto para evitar costuras).
  function upscale(src, sx, sy, sw, sh, pad, alpha) {
    const sctx = src.getContext('2d');
    const x0 = Math.max(0, sx - pad), y0 = Math.max(0, sy - pad);
    const x1 = Math.min(src.width, sx + sw + pad), y1 = Math.min(src.height, sy + sh + pad);
    const w = x1 - x0, h = y1 - y0;
    const id = sctx.getImageData(x0, y0, w, h);
    const out = window.xBRjs.xbr4x(new Uint32Array(id.data.buffer), w, h, { blendColors: true, scaleAlpha: alpha });
    const big = makeCanvas(w * HQ, h * HQ);
    big.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(out.buffer), w * HQ, h * HQ), 0, 0);
    if (x0 === sx && y0 === sy && w === sw && h === sh) return big;
    const res = makeCanvas(sw * HQ, sh * HQ);
    res.getContext('2d').drawImage(big, (sx - x0) * HQ, (sy - y0) * HQ, sw * HQ, sh * HQ, 0, 0, sw * HQ, sh * HQ);
    return res;
  }

  // ------------------------------------------------------------------ entrada
  const keys = { left: 0, right: 0, up: 0, down: 0, a: 0, b: 0, start: 0 };
  const prev = { ...keys };
  const input = { ...keys, pressed: { ...keys } };
  const KEYMAP = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
    KeyZ: 'a', Space: 'a', KeyJ: 'a', KeyX: 'b', KeyK: 'b', ShiftLeft: 'b', ShiftRight: 'b',
    Enter: 'start', KeyP: 'start', Escape: 'start',
  };
  const kbd = {};
  const latched = {};                    // pulsaciones más cortas que un fotograma
  addEventListener('keydown', e => {
    const k = KEYMAP[e.code];
    if (k) { if (!e.repeat) latched[k] = 1; kbd[k] = 1; e.preventDefault(); }
    if (e.code === 'KeyF') toggleFullscreen();
  });
  addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) { kbd[k] = 0; e.preventDefault(); } });
  addEventListener('blur', () => { for (const k in kbd) kbd[k] = 0; });

  const touch = {};
  const touchEl = document.getElementById('touch');
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) touchEl.classList.add('on');
  for (const btn of touchEl.querySelectorAll('button')) {
    const k = btn.dataset.k;
    const on = e => { touch[k] = 1; latched[k] = 1; e.preventDefault(); };
    const off = e => { touch[k] = 0; e.preventDefault(); };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('pointerleave', off);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  }

  function pollInput() {
    const pad = (navigator.getGamepads ? [...navigator.getGamepads()] : []).find(p => p);
    const g = {};
    if (pad) {
      const bt = i => (pad.buttons[i] && pad.buttons[i].pressed ? 1 : 0);
      const ax = pad.axes || [];
      g.left = bt(14) || (ax[0] < -0.4 ? 1 : 0);
      g.right = bt(15) || (ax[0] > 0.4 ? 1 : 0);
      g.up = bt(12) || (ax[1] < -0.5 ? 1 : 0);
      g.down = bt(13) || (ax[1] > 0.5 ? 1 : 0);
      g.a = bt(0) || bt(3);
      g.b = bt(1) || bt(2);
      g.start = bt(9) || bt(8);
    }
    for (const k in keys) {
      prev[k] = input[k];
      input[k] = kbd[k] || touch[k] || g[k] || latched[k] ? 1 : 0;
      input.pressed[k] = input[k] && !prev[k] ? 1 : 0;
      latched[k] = 0;
    }
  }

  // ------------------------------------------------------------------ gráficos
  const G = { atlas: null, frames: D.frames, stage: null };

  let dpr = 1, scale = 3, viewW = 256, viewH = VIEW_H, offY = 0;
  function resize() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    scale = Math.min(canvas.height / VIEW_H, canvas.width / MIN_VIEW_W);
    viewW = canvas.width / scale;
    viewH = canvas.height / scale;
    offY = (viewH - VIEW_H) / 2;          // en pantallas verticales se centra el bloque
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }
  addEventListener('resize', resize);
  resize();

  const px = v => Math.round(v * scale);

  // Dibuja una región de un lienzo HQ en coordenadas de pantalla NES (x, y, w, h).
  function blitHQ(src, sx, sy, sw, sh, x, y, w, h, flip) {
    const X0 = px(x), Y0 = px(y + offY), X1 = px(x + w), Y1 = px(y + h + offY);
    if (X1 <= 0 || Y1 <= 0 || X0 >= canvas.width || Y0 >= canvas.height) return;
    if (!flip) {
      ctx.drawImage(src, sx, sy, sw, sh, X0, Y0, X1 - X0, Y1 - Y0);
    } else {
      ctx.save();
      ctx.translate(X1, Y0);
      ctx.scale(-1, 1);
      ctx.drawImage(src, sx, sy, sw, sh, 0, 0, X1 - X0, Y1 - Y0);
      ctx.restore();
    }
  }

  // Dibuja un fotograma del atlas con su origen en (x, y) de pantalla.
  // mirror = constante de espejo del motor original (0 genérico, 16 jugador).
  function drawFrame(name, x, y, flip, mirror, alpha) {
    const f = G.frames[name];
    if (!f) return;
    const [fx, fy, w, h, ox, oy] = f;
    const left = flip ? x + (mirror || 0) - (w - ox) : x - ox;
    if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
    blitHQ(G.atlas, fx * HQ, fy * HQ, w * HQ, h * HQ, left, y - oy, w, h, flip);
    ctx.globalAlpha = 1;
  }

  function frameBox(name, x, y, flip, mirror, shrink) {
    const f = G.frames[name];
    if (!f) return null;
    const [, , w, h, ox, oy] = f;
    const s = shrink === undefined ? 3 : shrink;
    const left = flip ? x + (mirror || 0) - (w - ox) : x - ox;
    return { l: left + s, r: left + w - s, t: y - oy + s, b: y - oy + h };
  }

  function drawText(str, x, y, center) {
    str = String(str).toUpperCase();
    if (center) x -= str.length * 4;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch !== ' ') drawFrame('font_' + ch, x + i * 8, y, false);
    }
  }

  // ------------------------------------------------------------------ fases
  const SOLID = D.slopes.solid, ONEWAY = D.slopes.oneway;
  const STAGE_NAMES = ['1-1', '1-2', '1-3', '1-4', '1-5'];
  const EXIT_MT = new Set([0x6E, 0x6F, 0x6C, 0x6D]);
  const SPIKE_MT = new Set([0x94, 0x95, 0x96]);

  async function loadStage(index, progress) {
    const S = D.stages[index];
    const st = {
      index, def: S, id: S.id,
      cols: S.cols, rows: S.rows, W: S.cols * 16, H: S.rows * 16,
      mt: b64bytes(S.mt), coll: b64bytes(S.coll),
      chunks: [], patches: [], anim: S.anim,
      bgColor: S.bgColor,
    };
    const imgs = [];
    for (const uri of S.bg) imgs.push(imageCanvas(await loadImage(uri)));
    const CH = 256;
    const nch = Math.ceil(st.W / CH);
    const total = nch + 3;
    for (let c = 0; c < nch; c++) {
      const w = Math.min(CH, st.W - c * CH);
      st.chunks.push(upscale(imgs[0], c * CH, 0, w, st.H, 4, false));
      progress((c + 1) / total);
      await nextFrame();
    }
    // Parches de las celdas animadas (hierba, antorchas...) para los fotogramas 1..3
    const n = st.anim.length;
    const perRow = 16;
    for (let k = 1; k < 4; k++) {
      if (!n) { st.patches.push(null); continue; }
      const pc = makeCanvas(perRow * 16 * HQ, Math.ceil(n / perRow) * 16 * HQ);
      const pctx = pc.getContext('2d');
      st.anim.forEach((cell, i) => {
        const cx = cell % st.cols, cy = (cell / st.cols) | 0;
        const p = upscale(imgs[k], cx * 16, cy * 16, 16, 16, 3, false);
        pctx.drawImage(p, (i % perRow) * 16 * HQ, ((i / perRow) | 0) * 16 * HQ);
      });
      st.patches.push(pc);
      progress((nch + k) / total);
      await nextFrame();
    }
    return st;
  }

  function mtAt(st, x, y) {
    const cx = x >> 4, cy = y >> 4;
    if (cx < 0 || cx >= st.cols || cy < 0 || cy >= st.rows) return 0;
    return st.mt[cy * st.cols + cx];
  }

  // Tipo de colisión (tabla $DFFF del ROM). Los bordes laterales del mapa son muros.
  function collAt(st, x, y) {
    const cx = Math.floor(x / 16), cy = Math.floor(y / 16);
    if (cx < 0 || cx >= st.cols) return 0x15;
    if (cy < 0 || cy >= st.rows) return 0;
    return st.coll[cy * st.cols + cx];
  }

  // Superficie de suelo dentro de la celda (cx, cy) en la columna x. null si no hay.
  function surfaceIn(st, x, cy) {
    const t = collAt(st, x, cy * 16);
    const col = Math.floor(x) & 15;
    if (t >= 0x14) return { y: cy * 16, oneway: false, t };
    if (t >= 0x0A) return { y: cy * 16 + SOLID[t][col], oneway: false, t };
    if (t >= 0x05) {
      let tt = t, off = 0;
      if (t >= 8) { tt = t - 2; off = -16; }
      return { y: cy * 16 + ONEWAY[tt][col] + off, oneway: true, t };
    }
    return null;
  }

  // Busca suelo cerca de "feet" (y de los pies) en la columna x.
  function groundNear(st, x, feet, up, down, allowOneway) {
    let best = null;
    const c0 = Math.floor((feet - up) / 16) - 1, c1 = Math.floor((feet + down) / 16) + 1;
    for (let cy = c0; cy <= c1; cy++) {
      const s = surfaceIn(st, x, cy);
      if (!s) continue;
      if (s.oneway && !allowOneway) continue;
      if (s.y < feet - up || s.y > feet + down) continue;
      // no aceptar superficies tapadas por un bloque sólido justo encima
      if (s.t < 0x14 && collAt(st, x, s.y - 1) >= 0x14) continue;
      if (!best || s.y < best.y) best = s;
    }
    return best;
  }

  const isWall = (st, x, y) => collAt(st, x, y) >= 0x14;
  const isCeil = (st, x, y) => collAt(st, x, y) >= 0x15;

  // ------------------------------------------------------------------ estado global
  const game = {
    mode: 'title', t: 0,
    lives: 2, score: 0, hearts: 0, carrots: 0, pow: 0xCF, time: 200,
    stageIndex: 0, st: null, loading: 0,
    checkpoint: null, fade: 0, msg: null,
    collected: new Set(),
  };

  let player = null;
  let entities = [];
  let camX = 0, camY = 0;

  // ------------------------------------------------------------------ jugador
  const ACC = 1 / 16;
  const JUMP_V = -55 / 16;
  const G_HOLD = 1 / 16, G_FALL = 5 / 16, MAX_FALL = 56 / 16;

  class Player {
    constructor(x, y, air) {
      this.x = x; this.y = y;           // mismas coordenadas que $61/$69 (pies en y+32)
      this.vx = 0; this.vy = 0;
      this.face = 1;
      this.onGround = !air; this.onOneway = false;
      this.holdJump = false;
      this.state = 'normal'; this.st = 0;
      this.inv = 0;
      this.plucky = false;
      this.anim = 0; this.idle = 0; this.land = 0;
      this.frame = 'buster_05';
      this.gliding = false;
    }
    get feet() { return this.y + 32; }
    get cx() { return this.x + 8; }
    box() { return { l: this.x + 3, r: this.x + 13, t: this.y + (input.down && this.onGround ? 18 : 8), b: this.y + 32 }; }

    hurt() {
      if (this.inv > 0 || this.state !== 'normal' || window.TTA.god) return;
      if (this.plucky) {
        this.plucky = false;
        this.state = 'hurt'; this.st = 0; this.inv = 120;
        this.vx = -this.face * 1; this.vy = -2; this.onGround = false;
        effects.push(new Puff(this.cx, this.feet - 12, 'collect'));
        return;
      }
      if (game.hearts > 0) {
        game.hearts--;
        this.state = 'hurt'; this.st = 0; this.inv = 128;
        this.vx = -this.face * 1; this.vy = -2; this.onGround = false;
        return;
      }
      this.die();
    }

    die() {
      if (this.state === 'dead' || window.TTA.god) return;
      this.plucky = false;
      this.state = 'dead'; this.st = 0; this.vx = 0; this.vy = 0;
    }

    update(st) {
      this.st++;
      if (this.inv > 0) this.inv--;
      if (this.state === 'dead') return this.updateDead(st);
      if (this.state === 'transform') {
        if (this.st >= 40) this.state = 'normal';
        return;
      }
      const hurtLock = this.state === 'hurt' && this.st < 24;
      if (this.state === 'hurt' && this.st >= 24) this.state = 'normal';

      const L = !hurtLock && input.left, R = !hurtLock && input.right;
      const run = input.b;
      const ducking = this.onGround && input.down && !L && !R;
      let max = this.plucky ? (run ? 1.75 : 1.0) : (run ? 2.5 : 1.5);

      // Bajando una pendiente pronunciada corriendo se alcanza la "súper carrera"
      const slopeT = this.onGround ? collAt(st, this.cx, this.feet - 1) || collAt(st, this.cx, this.feet + 1) : 0;
      const downhill = (slopeT === 0x0F && this.vx > 0) || (slopeT === 0x0E && this.vx < 0);
      if (!this.plucky && run && downhill) max = 3.5;
      this.dashing = !this.plucky && Math.abs(this.vx) > 2.6 && this.onGround;

      if (!hurtLock) {
        if ((L || R) && !ducking) {
          const d = R ? 1 : -1;
          if (this.onGround && this.vx * d < 0) { this.vx += d * 0.25; this.skid = 8; }
          else this.vx += d * ACC * (this.onGround ? 1 : 0.75) * (Math.abs(this.vx) < 1 ? 1.5 : 1);
          if (this.onGround || Math.abs(this.vx) < 0.2) this.face = d;
          if (this.vx > max) this.vx = Math.max(max, this.vx - 1 / 16);
          if (this.vx < -max) this.vx = Math.min(-max, this.vx + 1 / 16);
        } else {
          const fr = this.onGround ? 1 / 8 : 1 / 32;
          this.vx = Math.abs(this.vx) <= fr ? 0 : this.vx - sign(this.vx) * fr;
        }
        if (input.pressed.a && this.onGround) {
          this.vy = JUMP_V; this.onGround = false; this.holdJump = true;
        }
      }
      if (!input.a) this.holdJump = false;

      // gravedad (como el original: +1/16 manteniendo A mientras sube rápido, si no +5/16)
      this.gliding = false;
      if (!this.onGround) {
        if (this.holdJump && this.vy < -2) this.vy += G_HOLD;
        else this.vy += G_FALL;
        if (this.plucky && input.a && this.vy > 0.5 && game.pow > 0 && !this.holdJump) {
          this.vy = 0.5; this.gliding = true;
          game.pow = Math.max(0, game.pow - 1);
        }
        if (this.vy > MAX_FALL) this.vy = MAX_FALL;
      }
      if (this.skid) this.skid--;

      this.moveX(st);
      this.moveY(st);

      // POW se recarga (+4 cada 8 fotogramas) cuando no se usa
      if (!this.gliding && (game.t & 7) === 0) game.pow = Math.min(0xCF, game.pow + 4);

      // peligros del mapa
      if (this.feet > st.H + 40) this.die();
      if (SPIKE_MT.has(mtAt(st, this.cx, this.feet - 4))) this.die();

      this.pickFrame(L || R, ducking);
    }

    moveX(st) {
      this.x += this.vx;
      const top = this.y + 12, low = this.y + 27;
      // sondas laterales como las del original (x+1 / x+14)
      if (isWall(st, this.x + 14, top) || isWall(st, this.x + 14, low)) {
        const cx = Math.floor((this.x + 14) / 16) * 16;
        this.x = cx - 15; if (this.vx > 0) { this.vx = 0; this.push = 6; }
      }
      if (isWall(st, this.x + 1, top) || isWall(st, this.x + 1, low)) {
        const cx = Math.floor((this.x + 1) / 16) * 16 + 16;
        this.x = cx - 1; if (this.vx < 0) { this.vx = 0; this.push = 6; }
      }
      this.x = clamp(this.x, -1, st.W - 15);
    }

    moveY(st) {
      const oldFeet = this.feet;
      if (this.onGround) {
        const g = groundNear(st, this.cx, this.feet, 7, 9, this.onOneway)
          || groundNear(st, this.cx, this.feet, 1, 9, true);
        if (g) { this.y = g.y - 32; this.onOneway = g.oneway; this.vy = 0; return; }
        this.onGround = false; this.vy = 0.5;
      }
      this.y += this.vy;
      if (this.vy < 0) {
        if (isCeil(st, this.cx, this.y + 6)) {
          this.y = Math.floor((this.y + 6) / 16) * 16 + 16 - 6;
          this.vy = 0;
        }
        return;
      }
      // aterrizaje: se prueba en el centro y (para bloques sólidos) en los lados
      for (const dx of [0, -4, 3]) {
        const x = this.cx + dx;
        const c0 = Math.floor((oldFeet - 4) / 16), c1 = Math.floor(this.feet / 16);
        for (let cy = c0; cy <= c1; cy++) {
          const s = surfaceIn(st, x, cy);
          if (!s) continue;
          if (dx !== 0 && s.t < 0x14) continue;
          if (s.t < 0x14 && collAt(st, x, s.y - 1) >= 0x14) continue;
          if (s.y >= oldFeet - (s.oneway ? 1 : 4) && s.y <= this.feet) {
            this.y = s.y - 32; this.vy = 0; this.onGround = true; this.onOneway = s.oneway;
            this.land = 5;
            return;
          }
        }
      }
    }

    updateDead(st) {
      // animación de muerte: fotogramas $19-$1D; luego sale despedido y cae
      if (this.st === 66) { this.vy = -4; }
      if (this.st > 66) { this.y += this.vy; this.vy = Math.min(this.vy + 0.15, 4); }
      if (this.st < 27) this.frame = 'buster_19';
      else if (this.st < 66) this.frame = 'buster_1a';
      else this.frame = ['buster_1b', 'buster_1c', 'buster_1d'][((this.st - 66) >> 3) % 3];
      if (this.st === 200) onPlayerDead();
    }

    pickFrame(moving, ducking) {
      const who = this.plucky ? 'plucky' : 'buster';
      let f;
      if (this.state === 'hurt') f = this.plucky ? 'plucky_05' : 'buster_21';
      else if (!this.onGround) {
        this.idle = 0;
        if (this.plucky) {
          if (this.gliding) f = 'plucky_' + ['0e', '0f', '10', '0f'][(game.t >> 2) & 3];
          else f = this.vy < 0 ? 'plucky_09' : 'plucky_0a';
        } else f = this.vy < -0.6 ? 'buster_0b' : this.vy < 0.6 ? 'buster_0c' : 'buster_0d';
      } else if (ducking) { f = who + '_04'; this.idle = 0; }
      else if (this.land > 0) { this.land--; f = this.plucky ? 'plucky_0b' : 'buster_0e'; }
      else if (this.skid > 0 && !this.plucky) f = 'buster_27';
      else if (this.push > 0 && !this.plucky) { this.push--; f = 'buster_21'; }
      else if (this.dashing) f = 'buster_' + ((game.t >> 2) & 1 ? '09' : '08');
      else if (Math.abs(this.vx) > 0.05) {
        this.idle = 0;
        const spd = Math.abs(this.vx) > 1.6 ? 6 : 7;
        this.anim = (this.anim + 1) % (spd * 4);
        f = who + '_' + ['01', '02', '03', '02'][(this.anim / spd) | 0];
      } else {
        this.idle++;
        if (this.plucky) f = 'plucky_' + (((this.idle / 13) | 0) & 1 ? '23' : '22');
        else if (this.idle > 150) f = ((this.idle / 13) | 0) & 1 ? 'buster_26' : 'buster_05';
        else f = 'buster_05';
      }
      this.frame = f;
    }

    draw() {
      if (this.inv > 0 && this.state !== 'dead' && (game.t & 2)) return;
      const flip = this.face < 0;
      if (this.state === 'transform' && (this.st & 4)) return;
      drawFrame(this.frame, this.x - camX, this.y - camY, flip, 16);
    }
  }

  // ------------------------------------------------------------------ entidades
  class Entity {
    constructor(x, y) { this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.face = -1; this.t = 0; this.dead = false; this.frame = null; }
    box() { return this.frame ? frameBox(this.frame, this.x, this.y, this.face < 0, 0, this.shrink) : null; }
    draw() { if (this.frame && this.visible !== false) drawFrame(this.frame, this.x - camX, this.y - camY, this.face < 0, 0, this.alpha); }
    facePlayer() { this.face = player && player.cx < this.x ? -1 : 1; }
    // gravedad y seguimiento del suelo para enemigos que andan
    walkPhysics(st, turnAtEdge) {
      const nx = this.x + this.vx;
      const probe = this.x + sign(this.vx) * 8;
      if (this.vx && (isWall(st, nx + sign(this.vx) * 8, this.y - 4) || isWall(st, nx + sign(this.vx) * 8, this.y - 14))) {
        this.vx = -this.vx; this.face = -this.face;
      } else if (turnAtEdge && this.onGround && !groundNear(st, probe + this.vx, this.y, 8, 12, true)) {
        this.vx = -this.vx; this.face = -this.face;
      } else this.x = nx;
      if (this.onGround) {
        const g = groundNear(st, this.x, this.y, 8, 10, true);
        if (g) { this.y = g.y; this.vy = 0; return; }
        this.onGround = false;
      }
      this.vy = Math.min(this.vy + 0.2, 3.5);
      const old = this.y;
      this.y += this.vy;
      if (this.vy >= 0) {
        const g = groundNear(st, this.x, this.y, this.y - old + 2, 0, true);
        if (g) { this.y = g.y; this.vy = 0; this.onGround = true; }
      }
      if (this.y > st.H + 64) this.dead = true;
    }
  }

  class Puff extends Entity {            // nube de enemigo vencido / recogida / globo que revienta
    constructor(x, y, kind) { super(x, y); this.kind = kind || 'puff'; this.harmless = true; }
    update() {
      this.t++;
      const seq = this.kind === 'pop' ? ['14', '15', '16'] : ['08', '09', '0a', '0b', '0c'];
      const i = (this.t / 4) | 0;
      if (i >= seq.length) { this.dead = true; return; }
      this.frame = this.kind + '_' + seq[i];
    }
  }

  // --- enemigos
  class Walker extends Entity {          // $36 / $37 / $35: ratas
    constructor(x, y, type) {
      super(x, y); this.type = type; this.onGround = true;
      this.gfx = type === 0x37 ? 'rat2' : type === 0x35 ? 'ratc' : 'rat';
      this.facePlayer(); this.vx = 0.625 * this.face;
      this.jumpT = 60 + ((x * 7) % 80);
    }
    update(st) {
      this.t++;
      if (this.type === 0x35 && this.onGround && --this.jumpT <= 0) { this.vy = -2.6; this.onGround = false; this.jumpT = 110; }
      this.walkPhysics(st, this.type === 0x36);
      this.frame = this.gfx + '_' + (!this.onGround && this.type === 0x35 ? '03' : ((this.t >> 3) & 1 ? '02' : '01'));
    }
  }

  class Jumper extends Entity {          // $38: rata que salta en el sitio
    constructor(x, y) { super(x, y); this.base = y; this.jt = 60; this.onGround = true; }
    update(st) {
      this.t++; this.facePlayer();
      if (this.onGround) {
        if (--this.jt <= 0) { this.vy = -3.3; this.onGround = false; this.jt = 110; }
      } else {
        this.vy += 0.15; this.y += this.vy;
        if (this.y >= this.base) { this.y = this.base; this.onGround = true; this.vy = 0; }
      }
      this.frame = this.onGround ? 'ratjump_01' : 'ratjump_03';
    }
  }

  class Bird extends Entity {            // $3B: pájaro que revolotea
    constructor(x, y) { super(x, y); this.y0 = y; this.ph = (x % 128); }
    update() {
      this.t++; this.facePlayer();
      this.y = this.y0 + Math.sin((this.t + this.ph) * Math.PI * 2 / 128) * 14;
      this.frame = 'bird_' + ['1f', '20', '21', '20'][(this.t / 6 | 0) & 3];
    }
  }

  class Arnold extends Entity {          // $3A: Arnold el pitbull (lanza pesas)
    constructor(x, y) { super(x, y); this.home = x; this.phase = 0; this.pt = 0; this.hp = 2; this.shrink = 5; this.onGround = true; }
    update(st) {
      this.t++; this.pt++;
      if (this.hitT) this.hitT--;
      if (this.phase === 0) {                          // lanza
        this.facePlayer(); this.vx = 0;
        this.frame = this.pt < 18 ? 'arnold_84' : 'arnold_85';
        if (this.pt === 18) entities.push(new Dumbbell(this.x + this.face * 10, this.y - 36, this.face));
        if (this.pt > 36) { this.phase = 1; this.pt = 0; this.face = this.x > this.home - 8 ? -1 : 1; }
      } else {                                           // camina 48 px y vuelve
        this.vx = 0.8 * this.face;
        this.x += this.vx;
        this.frame = 'arnold_' + ['81', '82', '81', '83'][(this.pt / 6 | 0) & 3];
        if (this.pt >= 60) { this.phase = 0; this.pt = 0; }
      }
      const g = groundNear(st, this.x, this.y, 8, 8, true);
      if (g) this.y = g.y;
    }
    stomp() { this.hp--; this.hitT = 30; return this.hp <= 0; }
    draw() { if (!(this.hitT & 2)) super.draw(); }
  }

  class Dumbbell extends Entity {        // $22
    constructor(x, y, d) { super(x, y); this.vx = 1.5 * d; this.vy = -3; this.projectile = true; this.shrink = 1; }
    update(st) {
      this.t++; this.x += this.vx; this.y += this.vy; this.vy += 0.18;
      this.frame = 'dumbbell_' + ['8a', '8b', '8c', '8d'][(this.t / 6 | 0) & 3];
      if (this.y > st.H + 40) this.dead = true;
    }
  }

  class Pumpkin extends Entity {         // $3D: calabaza voladora (onda senoidal)
    constructor(x, y) { super(x, y); this.y0 = y; this.facePlayer(); this.vx = this.face; }
    update() {
      this.t++; this.x += this.vx * 0.9;
      this.y = this.y0 + Math.sin(this.t * Math.PI * 2 / 120) * 26;
      this.frame = 'pumpkin_' + ['92', '94', '95', '96', '97', '98'][(this.t / 8 | 0) % 6];
    }
  }

  class RollingPumpkin extends Entity {  // $3C: calabaza que cae y rueda
    constructor(x, y) { super(x, y); this.facePlayer(); this.vx = 0.75 * this.face; this.onGround = false; }
    update(st) {
      this.t++;
      this.walkPhysics(st, false);
      this.frame = 'pumpkin2_' + ((this.t >> 3) & 1 ? '93' : '92');
    }
  }

  class PumpkinSpawner extends Entity {  // $01: genera calabazas rodantes
    constructor(x, y) { super(x, y); this.harmless = true; this.cool = 30; }
    update() {
      if (--this.cool <= 0 && Math.abs(player.cx - this.x) < viewW * 0.7) {
        entities.push(new RollingPumpkin(this.x, this.y));
        this.cool = 200;
      }
    }
    draw() {}
    box() { return null; }
  }

  class Balloon extends Entity {         // $99 $9A $9B $9C: globos con premio
    constructor(x, y, type) {
      super(x, y); this.type = type; this.x0 = x; this.harmless = true; this.item = true;
      this.content = type === 0x9B ? 'star' : type === 0x9A ? 'clock' : 'heart';
    }
    update() {
      this.t++;
      if (this.type === 0x9B) this.x = this.x0 + Math.sin(this.t * Math.PI * 2 / 256) * 32;
      this.frame = 'balloon_' + ['11', '12', '11', '13'][(this.t / 8 | 0) & 3];
      this.face = 1;
    }
    touch() {
      this.dead = true;
      effects.push(new Puff(this.x, this.y, 'pop'));
      entities.push(new Item(this.x, this.y - 4, this.content));
      game.score += 100;
    }
  }

  class Item extends Entity {            // $76 corazón, $74 bola estrella, $7E reloj
    constructor(x, y, kind) { super(x, y); this.kind = kind; this.vy = -2; this.item = true; this.harmless = true; this.life = 600; }
    update(st) {
      this.t++;
      if (!this.grounded) {
        this.vy = Math.min(this.vy + 0.12, 2);
        const old = this.y; this.y += this.vy;
        if (this.vy > 0) {
          const g = groundNear(st, this.x, this.y, this.y - old + 2, 0, true);
          if (g) { this.y = g.y; this.grounded = true; }
        }
        if (this.y > st.H + 32) this.dead = true;
      }
      if (--this.life <= 0) this.dead = true;
      this.visible = this.life > 120 || (this.t & 4);
      this.frame = this.kind === 'heart' ? 'heart_' + ((this.t >> 3) & 1 ? '18' : '17')
        : this.kind === 'star' ? 'star_1b' : 'clock_19';
    }
    touch() {
      this.dead = true;
      effects.push(new Puff(this.x, this.y - 8, 'collect'));
      if (this.kind === 'heart') game.hearts = Math.min(9, game.hearts + 1);
      else if (this.kind === 'clock') game.time = Math.min(999, game.time + 50);
      else if (this.kind === 'star') {
        if (!player.plucky) { player.plucky = true; player.state = 'transform'; player.st = 0; }
        game.pow = 0xCF;
        game.score += 1000;
      }
      game.score += 100;
    }
  }

  class CheckpointDoor extends Entity {  // $08: puerta de mitad de fase (punto de control)
    constructor(x, y, cp) { super(x, y); this.cp = cp; this.harmless = true; this.frame = 'door_27'; this.face = 1; }
    update() {
      if (this.cp && player.cx > this.x && game.checkpoint !== this.cp) game.checkpoint = this.cp;
    }
    box() { return null; }
  }

  class ExitDoor extends Entity {        // puerta que aparece en la fase de Elmyra (1-3)
    constructor(x, y) { super(x, y); this.harmless = true; this.frame = 'door_27'; this.face = 1; this.exit = true; }
    update() {}
    box() { return { l: this.x - 8, r: this.x + 8, t: this.y - 32, b: this.y }; }
  }

  class Elmyra extends Entity {          // $21: Elmyra persigue a Buster para abrazarlo
    constructor(x, y) { super(x, y); this.phase = 'idle'; this.pt = 0; this.home = x; this.shrink = 4; this.invincible = true; }
    update(st) {
      this.t++; this.pt++;
      const idleSeq = ['2f', '30', '31', '32', '33', '34', '2e'];
      if (this.phase === 'idle') {
        this.frame = 'elmyra_' + idleSeq[(this.pt / 12 | 0) % idleSeq.length];
        if (this.pt % 40 === 20) entities.push(new Kiss(this.x + this.face * 6, this.y - 30));
        if (this.pt > 110) { this.phase = 'run'; this.pt = 0; this.facePlayer(); this.target = player.cx; }
      } else if (this.phase === 'run') {
        this.x += this.face * 2.6;
        this.frame = 'elmyra_' + ((this.pt >> 2) & 1 ? '2c' : '2b');
        if ((this.face > 0 && this.x >= this.target) || (this.face < 0 && this.x <= this.target) || this.x < 24 || this.x > st.W - 24 || this.pt > 90) {
          this.phase = 'idle'; this.pt = 0;
        }
      }
      const g = groundNear(st, this.x, this.y, 16, 16, true);
      if (g) this.y = g.y;
    }
  }

  class Kiss extends Entity {            // $03: corazones de Elmyra que suben flotando
    constructor(x, y) { super(x, y); this.x0 = x; this.projectile = true; this.shrink = 0; }
    update() {
      this.t++; this.y -= 0.5;
      this.x = this.x0 + Math.sin(this.t / 6) * 2;
      this.frame = 'kiss_35'; this.face = 1;
      if (this.t > 150) this.dead = true;
    }
  }

  class Boss extends Entity {            // $0C: jefe del monopatín (1-5)
    constructor(x, y) {
      super(x, y); this.phase = 'intro'; this.pt = 0; this.hp = 6; this.face = 1; this.shrink = 6; this.boss = true;
    }
    update(st) {
      this.t++; this.pt++;
      if (this.hitT) this.hitT--;
      const flip = ['9d', '9e', '9f', 'a0', 'a1', 'a2', 'a3'];
      switch (this.phase) {
        case 'intro':
          this.frame = 'boss_9b'; this.visible = (this.pt & 4) === 0;
          if (this.pt > 150) { this.visible = true; this.phase = 'skate'; this.pt = 0; this.face = player.cx < this.x ? -1 : 1; }
          break;
        case 'skate': {
          this.x += this.face * 3.2;
          const g = groundNear(st, this.x, this.y, 12, 12, true);
          if (g) this.y = g.y;
          this.frame = g && g.t !== 0x14 && g.t !== 0x15 && g.t !== 0x0A && g.t !== 0x0B ? 'boss_9c' : 'boss_9b';
          if ((this.face > 0 && this.x >= st.W - 40) || (this.face < 0 && this.x <= 40)) {
            this.phase = 'air'; this.pt = 0; this.vy = -3.6; this.shot = false;
          }
          break;
        }
        case 'air':
          this.vy += 0.1; this.y += this.vy;
          this.frame = 'boss_' + flip[(this.pt / 5 | 0) % flip.length];
          if (!this.shot && this.vy > -0.5) {
            this.shot = true;
            entities.push(new BossShot(this.x - this.face * 8, this.y - 24, -this.face, player));
          }
          if (this.vy > 0) {
            const g = groundNear(st, this.x - this.face * 20, this.y, 4, 4, true);
            if (g || this.pt > 90) {
              this.face = -this.face; this.x += this.face * 20; this.phase = 'land'; this.pt = 0;
            }
          }
          break;
        case 'land': {
          this.frame = 'boss_a5';
          const g = groundNear(st, this.x, this.y, 16, 24, true);
          if (g) this.y = Math.min(g.y, this.y + 4);
          if (this.pt > 12) { this.phase = 'skate'; this.pt = 0; }
          break;
        }
        case 'dying':
          this.visible = (this.pt & 2) === 0;
          if (this.pt % 10 === 0) effects.push(new Puff(this.x + (Math.random() * 32 - 16), this.y - Math.random() * 40));
          if (this.pt > 90) { this.dead = true; onBossDefeated(); }
          break;
      }
    }
    stomp() {
      if (this.hitT || this.phase === 'intro' || this.phase === 'dying') return false;
      this.hp--; this.hitT = 60; game.score += 500;
      if (this.hp <= 0) { this.phase = 'dying'; this.pt = 0; this.harmless = true; }
      return false;
    }
    draw() { if (!(this.hitT & 2)) super.draw(); }
  }

  class BossShot extends Entity {        // $16: proyectil del jefe
    constructor(x, y, d, target) {
      super(x, y); this.projectile = true; this.shrink = 1; this.face = 1;
      const dx = (target.cx - x);
      this.vx = clamp(dx / 60, -1.8, 1.8) || d * 1.1; this.vy = -2.2;
    }
    update(st) {
      this.t++; this.x += this.vx; this.y += this.vy; this.vy += 0.09;
      this.frame = 'bossshot_a7';
      if (this.y > st.H + 32) this.dead = true;
    }
  }

  let effects = [];

  // ------------------------------------------------------------------ objetos del mapa
  function makeObject(type, x, y) {
    switch (type) {
      case 0x36: case 0x37: case 0x35: return new Walker(x, y, type);
      case 0x38: return new Jumper(x, y);
      case 0x3B: return new Bird(x, y);
      case 0x3A: return new Arnold(x, y);
      case 0x3D: return new Pumpkin(x, y);
      case 0x3C: return new RollingPumpkin(x, y);
      case 0x01: return new PumpkinSpawner(x, y);
      case 0x99: case 0x9A: case 0x9B: case 0x9C: return new Balloon(x, y, type);
      case 0x21: return new Elmyra(x, y);
      case 0x0C: return new Boss(x, y);
      case 0x08: {
        const cp = game.st.def.checkpoints[0];
        return new CheckpointDoor(x, y, cp ? { x: cp.x, y: cp.y, air: cp.air } : null);
      }
      default: return null;             // $19/$02: disparadores invisibles sin efecto visible
    }
  }

  const spawns = [];                     // estado de cada entrada de la lista de objetos del ROM
  function resetSpawns() {
    spawns.length = 0;
    for (const [type, cx, cy] of game.st.def.objects) spawns.push({ type, x: cx * 16, y: cy * 16, ent: null, killed: false });
  }

  function updateSpawns() {
    const margin = 40;
    for (const s of spawns) {
      if (s.killed) continue;
      const inX = s.x > camX - margin && s.x < camX + viewW + margin;
      const inY = s.y > camY - 48 && s.y < camY + PLAY_H + 64;
      if (!s.ent && inX && inY && !s.wasIn) {
        const e = makeObject(s.type, s.x, s.y);
        if (e) { e.spawn = s; s.ent = e; entities.push(e); }
      }
      s.wasIn = inX && inY;
      if (s.ent && s.ent.dead) { s.ent = null; }
    }
    // los enemigos que quedan muy lejos de la cámara desaparecen (y pueden reaparecer)
    for (const e of entities) {
      if (e.boss || e instanceof Elmyra || e instanceof CheckpointDoor || e instanceof ExitDoor) continue;
      if (e.x < camX - 160 || e.x > camX + viewW + 160 || e.y < camY - 200 || e.y > camY + PLAY_H + 240) {
        e.dead = true;
        if (e.spawn) e.spawn.ent = null;
      }
    }
  }

  // ------------------------------------------------------------------ flujo del juego
  async function startStage(index, fromCheckpoint) {
    game.mode = 'loading'; game.loading = 0;
    game.stageIndex = index;
    if (!game.st || game.st.index !== index) {
      game.st = null;
      game.st = await loadStage(index, p => { game.loading = p; });
      game.collected = new Set();
      game.checkpoint = null;
    }
    const st = game.st;
    const start = fromCheckpoint && game.checkpoint ? game.checkpoint : st.def.start;
    player = new Player(start.x, start.y, start.air);
    if (start.air) player.vy = 0;
    player.inv = 90;
    entities = []; effects = [];
    game.time = 200; game.t = 0; game.pow = 0xCF;
    game.exitSpawned = false;
    resetSpawns();
    centerCamera(true);
    game.mode = 'play';
    game.fade = 30;
    game.msg = { text: 'FASE ' + st.id, t: 120 };
  }

  function onPlayerDead() {
    game.lives--;
    if (game.lives < 0) {
      game.mode = 'gameover'; game.modeT = 0;
      return;
    }
    game.mode = 'respawn'; game.modeT = 0;
  }

  function onBossDefeated() {
    game.score += 10000;
    stageClear();
  }

  function stageClear() {
    if (game.mode !== 'play') return;
    game.mode = 'clear'; game.modeT = 0; game.tally = game.time; game.msg = null;
  }

  function centerCamera(snap) {
    const st = game.st;
    let tx = player.cx - viewW / 2;
    tx = st.W <= viewW ? (st.W - viewW) / 2 : clamp(tx, 0, st.W - viewW);
    let ty = player.feet - 128;
    ty = clamp(ty, 0, Math.max(0, st.H - PLAY_H));
    if (snap) { camX = tx; camY = ty; return; }
    camX += clamp(tx - camX, -6, 6);
    camX = st.W <= viewW ? tx : clamp(camX, 0, st.W - viewW);
    camY += (ty - camY) * 0.15;
    camY = clamp(camY, 0, Math.max(0, st.H - PLAY_H));
  }

  function overlap(a, b) { return a && b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t; }

  function updatePlay() {
    const st = game.st;
    game.t++;
    if (input.pressed.start) { game.mode = 'pause'; return; }
    if (game.msg && --game.msg.t <= 0) game.msg = null;

    player.update(st);
    centerCamera(false);
    updateSpawns();

    // temporizador: un segundo del juego son 64 fotogramas
    if (player.state !== 'dead' && (game.t & 63) === 0 && game.time > 0) {
      game.time--;
      if (game.time === 0) { game.msg = { text: 'TIME UP', t: 150 }; player.die(); }
    }

    // zanahorias (antes metatiles $05 del fondo)
    if (player.state !== 'dead') {
      const pb = player.box();
      for (const [cx, cy] of st.def.carrots) {
        const key = cx + ',' + cy;
        if (game.collected.has(key)) continue;
        if (pb.r > cx * 16 + 2 && pb.l < cx * 16 + 14 && pb.b > cy * 16 + 2 && pb.t < cy * 16 + 14) {
          game.collected.add(key);
          game.carrots++;
          game.score += 50;
          if (game.carrots >= 30) { game.carrots -= 30; game.lives = Math.min(9, game.lives + 1); }
        }
      }
    }

    for (const e of entities) if (!e.dead) e.update(st);
    for (const e of effects) if (!e.dead) e.update(st);

    // colisiones jugador <-> entidades
    if (player.state === 'normal' || player.state === 'hurt') {
      const pb = player.box();
      for (const e of entities) {
        if (e.dead) continue;
        const eb = e.box();
        if (!overlap(pb, eb)) continue;
        if (e.exit) {
          if (input.pressed.up || input.up) stageClear();
          continue;
        }
        if (e.item) { if (!(e instanceof Item) || e.t > 16) e.touch(); continue; }
        if (e.harmless) continue;
        const stomping = player.vy > 0 && pb.b < eb.t + 10 && !e.projectile && !e.invincible;
        if (stomping) {
          player.vy = input.a ? -4 : -2.6; player.onGround = false; player.holdJump = input.a;
          let killed = true;
          if (e.stomp) killed = e.stomp();
          if (killed) {
            e.dead = true;
            if (e.spawn) e.spawn.killed = true;
            effects.push(new Puff(e.x, e.y - 8));
            game.score += 100;
          }
        } else if (player.dashing && !e.projectile && !e.boss && !e.invincible) {
          e.dead = true; if (e.spawn) e.spawn.killed = true;
          effects.push(new Puff(e.x, e.y - 8)); game.score += 200;
        } else if (player.state === 'normal') {
          player.hurt();
        }
      }
    }
    entities = entities.filter(e => !e.dead);
    effects = effects.filter(e => !e.dead);

    // salida: puerta del mapa (metatiles $6C-$6F) + ARRIBA
    if (player.state === 'normal' && input.up && player.onGround) {
      const m = mtAt(st, player.cx, player.feet - 8);
      if (EXIT_MT.has(m)) stageClear();
    }
    // fase de Elmyra: la puerta de salida aparece a los ~10 segundos
    if (st.id === '1-3' && !game.exitSpawned && game.t > 630) {
      game.exitSpawned = true;
      entities.push(new ExitDoor(st.W / 2, 144));
      effects.push(new Puff(st.W / 2, 136, 'collect'));
    }
    // puntos de control del castillo (subniveles 4 y 5 del ROM)
    for (const cp of st.def.checkpoints) {
      if (player.cx > cp.x && player.feet > cp.y && (!game.checkpoint || game.checkpoint.x < cp.x) && st.id === '1-4') game.checkpoint = cp;
    }
  }

  function update() {
    pollInput();
    switch (game.mode) {
      case 'title':
        game.t++;
        if (input.pressed.start || input.pressed.a) {
          game.lives = 2; game.score = 0; game.hearts = 0; game.carrots = 0;
          startStage(0, false);
        }
        break;
      case 'loading': break;
      case 'play': updatePlay(); break;
      case 'pause': if (input.pressed.start) game.mode = 'play'; break;
      case 'respawn':
        if (++game.modeT > 40) startStage(game.stageIndex, true);
        break;
      case 'gameover':
        game.modeT++;
        if (game.modeT > 90 && (input.pressed.start || input.pressed.a)) {
          game.lives = 2; game.score = 0; game.hearts = 0; game.carrots = 0;
          game.checkpoint = null;
          startStage(game.stageIndex, false);
        }
        break;
      case 'clear':
        game.modeT++;
        if (game.modeT > 60 && game.tally > 0) {
          const n = Math.min(game.tally, 2);
          game.tally -= n; game.score += n * 100; game.time = game.tally;
        }
        if (game.modeT > 60 && game.tally === 0 && !game.clearDone) { game.clearDone = game.modeT; }
        if (game.clearDone && game.modeT > game.clearDone + 90) {
          game.clearDone = 0;
          if (game.stageIndex + 1 < D.stages.length) { game.checkpoint = null; startStage(game.stageIndex + 1, false); }
          else { game.mode = 'end'; game.modeT = 0; }
        }
        break;
      case 'end':
        game.modeT++;
        if (game.modeT > 120 && (input.pressed.start || input.pressed.a)) { game.mode = 'title'; game.st = null; }
        break;
    }
  }

  // ------------------------------------------------------------------ dibujo
  function drawBackground() {
    const st = game.st;
    ctx.fillStyle = st.bgColor;
    ctx.fillRect(0, px(offY), canvas.width, px(PLAY_H));
    const CH = 256;
    const x0 = camX, x1 = camX + viewW;
    const Hq = st.H * HQ;
    // fuera del mapa (fases-arena en pantallas anchas) se repiten las columnas del borde
    if (x0 < 0) {
      for (let x = -16; x >= x0 - 16; x -= 16) blitHQ(st.chunks[0], 0, camY * HQ, 16 * HQ, PLAY_H * HQ, x - camX, 0, 16, PLAY_H);
    }
    if (x1 > st.W) {
      const last = st.chunks[st.chunks.length - 1];
      const lw = last.width / HQ;
      for (let x = st.W; x < x1 + 16; x += 16) blitHQ(last, (lw - 16) * HQ, camY * HQ, 16 * HQ, PLAY_H * HQ, x - camX, 0, 16, PLAY_H);
    }
    for (let c = Math.max(0, Math.floor(x0 / CH)); c <= Math.min(st.chunks.length - 1, Math.floor(x1 / CH)); c++) {
      const ch = st.chunks[c];
      const w = ch.width / HQ;
      blitHQ(ch, 0, camY * HQ, ch.width, Math.min(PLAY_H * HQ, Hq - camY * HQ), c * CH - camX, 0, w, Math.min(PLAY_H, st.H - camY));
    }
    // animación del fondo (el banco R1 rota cada 8 fotogramas)
    const k = (game.t >> 3) & 3;
    if (k > 0 && st.patches[k - 1]) {
      const pc = st.patches[k - 1];
      st.anim.forEach((cell, i) => {
        const cx = (cell % st.cols) * 16, cy = ((cell / st.cols) | 0) * 16;
        if (cx + 16 < x0 || cx > x1 || cy + 16 < camY || cy > camY + PLAY_H) return;
        blitHQ(pc, (i % 16) * 16 * HQ, ((i / 16) | 0) * 16 * HQ, 16 * HQ, 16 * HQ, cx - camX, cy - camY, 16, 16);
      });
    }
    // zanahorias
    const carrotName = 'carrot_' + st.id;
    for (const [cx, cy] of st.def.carrots) {
      if (game.collected.has(cx + ',' + cy)) continue;
      const X = cx * 16 - camX, Y = cy * 16 - camY;
      if (X < -16 || X > viewW) continue;
      drawFrame(carrotName, X, Y, false);
    }
  }

  function drawHUD() {
    const y0 = PLAY_H;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, px(y0 + offY), canvas.width, canvas.height - px(y0 + offY));
    const hx = Math.round((viewW - 256) / 2);
    drawFrame('hud_base', hx, y0, false);
    const tile = (name, col, row) => drawFrame(name, hx + col * 8, y0 + row * 8, false);
    const digits = (v, n, col, row) => {
      const s = String(Math.max(0, Math.floor(v))).padStart(n, '0').slice(-n);
      for (let i = 0; i < n; i++) tile('hud_d' + s[i], col + i, row);
    };
    // medidor POW ($07E3)
    const lv = game.pow >> 4;
    for (let i = 0; i < 5; i++) {
      let t = 'hud_fb';
      if (lv >= 11) t = 'hud_fd';
      else if (i < lv >> 1) t = 'hud_fd';
      else if (i === lv >> 1 && (lv & 1)) t = 'hud_fc';
      tile(t, 6 + i, 1);
    }
    tile(lv >= 11 ? ((game.t >> 3) & 1 ? 'hud_ec' : 'hud_ed') : 'hud_eb', 11, 1);
    digits(game.lives, 1, 5, 2);
    digits(game.carrots, 2, 9, 2);
    digits(game.score, 7, 17, 1);
    digits(game.hearts, 1, 19, 2);
    digits(game.time, 3, 22, 2);
    if (game.hearts > 0) drawFrame('hud_heart', hx + 208, y0 + 6, false);
  }

  function drawWorld() {
    drawBackground();
    for (const e of entities) e.draw();
    if (player) player.draw();
    for (const e of effects) e.draw();
    if (game.msg) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, px(offY + 40), canvas.width, px(24));
      drawText(game.msg.text, viewW / 2, 48, true);
    }
    drawHUD();
  }

  function fullBlack(alpha) {
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawTitle() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // pantalla de título original (reconstruida desde el ROM y reescalada con xBR)
    const s2 = Math.min(viewH / 240, viewW / 256) * scale;
    const w = Math.round(256 * s2), h = Math.round(240 * s2);
    const X = Math.round((canvas.width - w) / 2), Y = Math.round((canvas.height - h) / 2);
    const help = (game.t % 720) > 480;
    ctx.drawImage(G.title, X, Y, w, h);
    if (help) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, Y + Math.round(h * 0.6), canvas.width, canvas.height);
      const cx = viewW / 2, y0 = (Y / scale - offY) + 240 * s2 / scale * 0.6;
      drawText('FLECHAS  MOVER', cx, y0 + 6, true);
      drawText('Z  SALTAR   X  CORRER', cx, y0 + 18, true);
      drawText('ENTER  PAUSA   F  PANTALLA COMPLETA', cx, y0 + 30, true);
      drawText('NIVEL 1 - ACME ACRES', cx, y0 + 50, true);
      drawText('PULSA ENTER', cx, y0 + 70, true);
    } else if ((game.t >> 5) & 1) {
      // parpadeo del PUSH START original
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(X + Math.round(w * 0.3), Y + Math.round(h * (158 / 240)), Math.round(w * 0.4), Math.round(h * (12 / 240)));
    }
  }

  function draw() {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    switch (game.mode) {
      case 'title': drawTitle(); break;
      case 'loading': {
        const cx = viewW / 2;
        drawText('CARGANDO FASE ' + STAGE_NAMES[game.stageIndex], cx, 96, true);
        ctx.fillStyle = '#333'; ctx.fillRect(px(cx - 64), px(offY + 112), px(128), px(6));
        ctx.fillStyle = '#fc0'; ctx.fillRect(px(cx - 64), px(offY + 112), px(128 * game.loading), px(6));
        break;
      }
      case 'play': case 'pause': case 'respawn':
        drawWorld();
        if (game.fade > 0) { fullBlack(game.fade / 30); game.fade--; }
        if (game.mode === 'pause') { fullBlack(0.4); drawText('PAUSA', viewW / 2, 88, true); }
        if (game.mode === 'respawn') fullBlack(Math.min(1, game.modeT / 30));
        break;
      case 'gameover':
        drawWorld(); fullBlack(Math.min(0.85, game.modeT / 40));
        drawText('GAME OVER', viewW / 2, 88, true);
        if (game.modeT > 90) drawText('PULSA ENTER', viewW / 2, 120, true);
        break;
      case 'clear': {
        drawWorld(); fullBlack(Math.min(0.9, game.modeT / 30));
        const cx = viewW / 2;
        drawText('STAGE ' + game.st.id + ' CLEAR', cx, 60, true);
        drawText('TIME ' + String(game.tally).padStart(3, '0'), cx, 92, true);
        drawText('SCORE ' + String(game.score).padStart(7, '0'), cx, 116, true);
        const b = ['buster_01', 'buster_02', 'buster_03', 'buster_02'][(game.modeT / 6 | 0) & 3];
        drawFrame(b, ((game.modeT * 2) % (viewW + 64)) - 32, 150, false, 16);
        break;
      }
      case 'end': {
        const cx = viewW / 2;
        drawText('NIVEL 1 COMPLETADO', cx, 60, true);
        drawText('SCORE ' + String(game.score).padStart(7, '0'), cx, 92, true);
        drawFrame(['buster_05', 'buster_26'][(game.modeT / 20 | 0) & 1], cx - 32, 112, false, 16);
        drawFrame(['plucky_22', 'plucky_23'][(game.modeT / 13 | 0) & 1], cx + 16, 112, true, 16);
        if (game.modeT > 120 && ((game.modeT >> 5) & 1)) drawText('PULSA ENTER', cx, 176, true);
        break;
      }
    }
  }

  // ------------------------------------------------------------------ arranque
  async function boot() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const atlas = imageCanvas(await loadImage(D.atlas));
    G.atlas = upscale(atlas, 0, 0, atlas.width, atlas.height, 0, true);
    const title = imageCanvas(await loadImage(D.title));
    G.title = upscale(title, 0, 0, title.width, title.height, 0, false);
    let last = performance.now(), acc = 0;
    function loop(now) {
      acc += Math.min(100, now - last); last = now;
      while (acc >= STEP) { update(); acc -= STEP; }
      draw();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  // API mínima para pruebas automáticas
  window.TTA = { game, get player() { return player; }, get entities() { return entities; }, startStage, input, kbd, god: false,
    get cam() { return [camX, camY, viewW]; },
    teleport(x, y) { player.x = x; player.y = y; player.vx = player.vy = 0; player.onGround = false; centerCamera(true); for (const s of spawns) s.wasIn = false; } };
  boot();
})();
