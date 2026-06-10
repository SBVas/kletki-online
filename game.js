/* =====================================================================
   Клетки — настольная игра на основе международных шашек + нарды
   ===================================================================== */

/* ────────────────────────────────────────────────────────────────────
   Константы
   ──────────────────────────────────────────────────────────────────── */
const N = 10;
const SZ = 620, MG = 40, CS = 54, PR = 22;

const EMPTY = 0;
const WHITE = 1;
const BLACK = 2;

// Онлайн-режим. До активации — null, игра против ИИ.
// После активации онлайн-игры: { myColor, sendMove, sendDice, sendNewGame, sendPass }.
let ONLINE = null;
function setOnline(o) { ONLINE = o; }
function isMyTurn() {
  if (!ONLINE) return G.turn === WHITE;
  return G.turn === ONLINE.myColor;
}

// «Усиленная» = простая шашка стоит на простой того же цвета.
// Поле board[r][c] хранит:
//   {clr: WHITE|BLACK, stack: 1|2}  или null
// stack=2 → усиленная шашка.
//
// bar[clr] хранит МАССИВ номеров колонок выбитых шашек:
//   bar[WHITE] = [3, 7, ...]  — каждая запись = колонка, откуда шашка была выбита.
// Это нужно, чтобы возвращать шашку строго в ту же вертикаль.

/* ────────────────────────────────────────────────────────────────────
   Perlin noise + текстуры дерева (упрощённая версия из reference)
   ──────────────────────────────────────────────────────────────────── */
function makeNoise(seed) {
  const p = new Uint8Array(512);
  let s = seed | 0;
  const rand = () => { s = (s * 1664525 + 1013904223) | 0; return ((s >>> 0) % 1000) / 1000; };
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];

  const fade = t => t*t*t*(t*(t*6-15)+10);
  const lerp = (a,b,t) => a+(b-a)*t;
  const grad = (h,x,y) => ((h&1) ? -x : x) + ((h&2) ? -y : y);

  return function noise(x, y) {
    const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const aa = p[p[xi] + yi],   ab = p[p[xi] + yi + 1];
    const ba = p[p[xi+1] + yi], bb = p[p[xi+1] + yi + 1];
    const x1 = lerp(grad(aa, xf, yf),     grad(ba, xf-1, yf),     u);
    const x2 = lerp(grad(ab, xf, yf-1),   grad(bb, xf-1, yf-1),   u);
    return lerp(x1, x2, v);
  };
}

function fbm(noise, x, y, oct = 4) {
  let v = 0, amp = 1, freq = 1, max = 0;
  for (let i = 0; i < oct; i++) {
    v += noise(x*freq, y*freq) * amp;
    max += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return v / max;
}

function woodCanvas(w, h, species, seedBase) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const n1 = makeNoise(seedBase);
  const n2 = makeNoise(seedBase + 7);

  const S = species;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ring = Math.sin((x * S.ringFreqX + y * S.ringFreqY) + fbm(n1, x*S.warpFreq, y*S.warpFreq, 3) * S.warpAmp);
      const grain = fbm(n2, x * S.grainFreqX, y * S.grainFreqY, 4);
      const t = 0.5 + 0.5 * (ring * 0.55 + grain * 0.45);

      const r = S.r0 + (S.r1 - S.r0) * t;
      const g = S.g0 + (S.g1 - S.g0) * t;
      const b = S.b0 + (S.b1 - S.b0) * t;

      const i = (y*w + x) * 4;
      img.data[i] = r | 0;
      img.data[i+1] = g | 0;
      img.data[i+2] = b | 0;
      img.data[i+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const SPECIES = {
  maple:       { ringFreqX:0.07, ringFreqY:0.02, warpFreq:0.018, warpAmp:1.8, grainFreqX:0.05, grainFreqY:0.13,
                 r0: 0xE8, g0: 0xCE, b0: 0x9A,  r1: 0xC9, g1: 0xA0, b1: 0x5E },
  walnut:      { ringFreqX:0.06, ringFreqY:0.018, warpFreq:0.02, warpAmp:1.6, grainFreqX:0.05, grainFreqY:0.12,
                 r0: 0x6A, g0: 0x3C, b0: 0x1C,  r1: 0x32, g1: 0x18, b1: 0x09 },
  frame:       { ringFreqX:0.05, ringFreqY:0.02, warpFreq:0.018, warpAmp:1.4, grainFreqX:0.05, grainFreqY:0.10,
                 r0: 0x86, g0: 0x4D, b0: 0x22,  r1: 0x48, g1: 0x22, b1: 0x0C },
  maple_piece: { ringFreqX:0.08, ringFreqY:0.04, warpFreq:0.02,  warpAmp:1.5, grainFreqX:0.06, grainFreqY:0.14,
                 r0: 0xF3, g0: 0xDC, b0: 0xAB,  r1: 0xC4, g1: 0x95, b1: 0x4C },
  ebony:       { ringFreqX:0.08, ringFreqY:0.04, warpFreq:0.02,  warpAmp:1.4, grainFreqX:0.06, grainFreqY:0.14,
                 r0: 0x35, g0: 0x22, b0: 0x12,  r1: 0x06, g1: 0x03, b1: 0x01 },
};

/* ────────────────────────────────────────────────────────────────────
   Текстура доски — кэш
   ──────────────────────────────────────────────────────────────────── */
let boardTex = null;

function buildBoardTex() {
  if (boardTex) return boardTex;
  const c = document.createElement('canvas');
  c.width = SZ; c.height = SZ;
  const ctx = c.getContext('2d');

  const frameTex = woodCanvas(SZ, SZ, SPECIES.frame, 11);
  ctx.drawImage(frameTex, 0, 0);

  const maple  = woodCanvas(CS*2, CS*2, SPECIES.maple,  23);
  const walnut = woodCanvas(CS*2, CS*2, SPECIES.walnut, 37);

  for (let r = 0; r < N; r++) {
    for (let col = 0; col < N; col++) {
      const x = MG + col * CS;
      const y = MG + r * CS;
      const dark = (r + col) % 2 === 1;
      const tex = dark ? walnut : maple;
      const ox = ((r * 13 + col * 7) % CS);
      const oy = ((r * 5  + col * 11) % CS);
      ctx.drawImage(tex, ox, oy, CS, CS, x, y, CS, CS);

      ctx.save();
      ctx.fillStyle = 'rgba(255,235,180,.08)';
      ctx.fillRect(x, y, CS, 1);
      ctx.fillRect(x, y, 1, CS);
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      ctx.fillRect(x, y+CS-1, CS, 1);
      ctx.fillRect(x+CS-1, y, 1, CS);
      ctx.restore();
    }
  }

  // Половинная линия — золотая полоса
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.fillRect(MG, MG + 5*CS - 2, N*CS, 4);
  ctx.strokeStyle = 'rgba(212,160,48,.85)';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = 'rgba(212,160,48,.5)';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(MG, MG + 5*CS - 1);
  ctx.lineTo(MG + N*CS, MG + 5*CS - 1);
  ctx.moveTo(MG, MG + 5*CS + 1);
  ctx.lineTo(MG + N*CS, MG + 5*CS + 1);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#D4A030';
  for (let i = 0; i <= N; i++) {
    const x = MG + i * CS;
    const y = MG + 5 * CS;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(0,0,0,.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(MG-1, MG-1, N*CS+2, N*CS+2);
  ctx.strokeStyle = 'rgba(212,160,48,.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(MG-3, MG-3, N*CS+6, N*CS+6);

  ctx.fillStyle = '#F0D898';
  ctx.font = 'bold 13px Georgia';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < N; i++) {
    const letter = String.fromCharCode(97 + i);
    ctx.fillText(letter, MG + i*CS + CS/2, MG/2);
    ctx.fillText(letter, MG + i*CS + CS/2, SZ - MG/2);
    const num = String(N - i);
    ctx.fillText(num, MG/2, MG + i*CS + CS/2);
    ctx.fillText(num, SZ - MG/2, MG + i*CS + CS/2);
  }

  boardTex = c;
  return c;
}

/* ────────────────────────────────────────────────────────────────────
   Спрайты шашек (кэш)
   ──────────────────────────────────────────────────────────────────── */
const spriteCache = {};

function getPieceSprite(clr, stack) {
  const key = clr + '-' + stack;
  if (spriteCache[key]) return spriteCache[key];

  const SPRITE = PR * 2 + 28;
  const c = document.createElement('canvas');
  c.width = SPRITE;
  c.height = SPRITE + (stack === 2 ? 6 : 0);
  const ctx = c.getContext('2d');

  const wood = clr === WHITE ? SPECIES.maple_piece : SPECIES.ebony;
  const tex = woodCanvas(PR*2, PR*2, wood, clr === WHITE ? 42 : 71);

  const baseX = SPRITE / 2;
  const baseY = stack === 2 ? SPRITE / 2 + 3 : SPRITE / 2;

  ctx.fillStyle = 'rgba(0,0,0,.5)';
  ctx.beginPath();
  ctx.ellipse(baseX, baseY + PR * 0.55, PR * 1.05, PR * 0.35, 0, 0, Math.PI*2);
  ctx.fill();

  function drawDisc(cx, cy) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, PR, 0, Math.PI*2);
    ctx.clip();
    ctx.drawImage(tex, cx - PR, cy - PR);

    const grad = ctx.createRadialGradient(cx - PR*0.4, cy - PR*0.4, 1, cx, cy, PR);
    grad.addColorStop(0, clr === WHITE ? 'rgba(255,245,210,.55)' : 'rgba(160,130,80,.32)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(0,0,0,.4)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - PR, cy - PR, PR*2, PR*2);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, PR - 4, 0, Math.PI*2);
    ctx.strokeStyle = clr === WHITE ? 'rgba(120,80,30,.35)' : 'rgba(0,0,0,.65)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, PR - 0.5, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  if (stack === 2) {
    ctx.save();
    ctx.fillStyle = clr === WHITE ? '#A87A40' : '#1a0d04';
    ctx.beginPath();
    ctx.ellipse(baseX, baseY + 5, PR, PR * 0.32, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    drawDisc(baseX, baseY - 3);

    ctx.save();
    ctx.beginPath();
    ctx.arc(baseX, baseY - 3, 4.5, 0, Math.PI*2);
    ctx.fillStyle = '#D4A030';
    ctx.shadowColor = 'rgba(212,160,48,.9)';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.strokeStyle = '#1a0d04';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  } else {
    drawDisc(baseX, baseY);
  }

  spriteCache[key] = c;
  return c;
}

/* ────────────────────────────────────────────────────────────────────
   Игровой движок
   ──────────────────────────────────────────────────────────────────── */

function mkBoard() {
  const b = Array.from({length: N}, () => Array(N).fill(null));
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < N; c++)
      b[r][c] = { clr: BLACK, stack: 1 };
  for (let r = 8; r < N; r++)
    for (let c = 0; c < N; c++)
      b[r][c] = { clr: WHITE, stack: 1 };
  return b;
}

function cloneBoard(b) {
  return b.map(row => row.map(cell => cell ? { ...cell } : null));
}

function fwdDir(clr) { return clr === WHITE ? -1 : +1; }

function isHomeRow(clr, row) {
  return clr === WHITE ? row <= 4 : row >= 5;
}

// Возврат с бара: tr вычисляется по дистанции от собственного края,
// tc = сохранённая колонка (вертикаль, где шашку выбили).
function entryRow(clr, dist) {
  return clr === WHITE ? (N - dist) : (dist - 1);
}

/* ── Возможные ходы одного «шага» ──────────────────────────────────────
   Кубики НЕ привязаны к оси. Игрок сам выбирает для каждого кубика,
   ходить ли по вертикали или по горизонтали.

   moveType:
     'V'  — простая шашка по вертикали вперёд на N клеток
     'H'  — простая шашка по горизонтали (влево или вправо) на N клеток
     'SV' — усиленная по вертикали вперёд на N клеток (только дубль)
     'SH' — усиленная по горизонтали на N клеток (только дубль)
     'ENTRY' — возврат шашки с бара (тратит ОДИН кубик, число = дистанция от своего края)

   Возврат: массив объектов {kind, fr, fc, tr, tc, action, dice, ...}.
   ──────────────────────────────────────────────────────────────────── */

function canLandSimple(state, clr, tr, tc) {
  if (tr < 0 || tr >= N || tc < 0 || tc >= N) return { ok: false };
  const cell = state.board[tr][tc];
  if (!cell) return { ok: true, action: 'move' };
  if (cell.clr === clr) {
    if (cell.stack === 1) return { ok: true, action: 'merge' };
    return { ok: false };
  }
  if (cell.stack === 1) return { ok: true, action: 'capture' };
  return { ok: false };
}

function canLandStrong(state, clr, tr, tc) {
  if (tr < 0 || tr >= N || tc < 0 || tc >= N) return { ok: false };
  const cell = state.board[tr][tc];
  if (!cell) return { ok: true, action: 'move' };
  if (cell.clr === clr) return { ok: false };
  return { ok: true, action: 'capture' };
}

// Все возможные одиночные ходы для текущего игрока.
// dice = массив {value, used, id}, без axis (любой кубик можно использовать как V или H).
function allSingleMoves(state, clr, dice) {
  const moves = [];
  const dir = fwdDir(clr);
  const onBar = state.bar[clr].length > 0;

  for (const d of dice) {
    if (d.used) continue;
    const v = d.value;

    // 1) Возврат с бара — необязателен. Игрок может вернуть шашку с бара
    //    ИЛИ играть другими шашками на доске (по решению пользователя).
    //    Используется любой кубик. tc = колонка выбитой шашки (первая в списке).
    if (onBar) {
      // Разрешаем возврат для КАЖДОЙ уникальной колонки на баре.
      // Игрок сам выбирает, какую именно шашку возвращать.
      const uniqCols = [...new Set(state.bar[clr])];
      for (const col of uniqCols) {
        const tr = entryRow(clr, v);
        const tc = col;
        const land = canLandSimple(state, clr, tr, tc);
        if (!land.ok) continue;
        // 'move' — пустая, 'merge' — своя простая, 'capture' — чужая.
        moves.push({
          kind: 'ENTRY', dice: d, fr: -1, fc: col, tr, tc,
          action: land.action === 'move' ? 'entry' : land.action,
          fromCol: col,
        });
      }
      // Не делаем continue — обычные ходы тоже разрешены.
    }

    // 2) Обычные ходы шашками на доске
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const p = state.board[r][c];
        if (!p || p.clr !== clr) continue;

        if (p.stack === 1) {
          // Простая — может ходить по V или H любым кубиком
          // V (вперёд)
          {
            const tr = r + dir * v, tc = c;
            const land = canLandSimple(state, clr, tr, tc);
            if (land.ok) moves.push({ kind: 'V', dice: d, fr: r, fc: c, tr, tc, action: land.action });
          }
          // H (влево/вправо)
          for (const sign of [-1, +1]) {
            const tr = r, tc = c + sign * v;
            const land = canLandSimple(state, clr, tr, tc);
            if (land.ok) moves.push({ kind: 'H', dice: d, fr: r, fc: c, tr, tc, action: land.action });
          }
        } else {
          // Усиленная
          // Парный ход (только на дубле, и только если оба кубика свободны)
          if (state.isDouble && !state.dice[0].used && !state.dice[1].used && d.id === 0) {
            // Усиленная пара: V (вперёд)
            const trV = r + dir * v, tcV = c;
            const landV = canLandStrong(state, clr, trV, tcV);
            if (landV.ok)
              moves.push({ kind: 'SV', dice: state.dice[0], dice2: state.dice[1],
                           fr: r, fc: c, tr: trV, tc: tcV, action: landV.action });
            for (const sign of [-1, +1]) {
              const trH = r, tcH = c + sign * v;
              const landH = canLandStrong(state, clr, trH, tcH);
              if (landH.ok)
                moves.push({ kind: 'SH', dice: state.dice[0], dice2: state.dice[1],
                             fr: r, fc: c, tr: trH, tc: tcH, action: landH.action });
            }
          }
          // Усиленная может сделать одиночный ход (как простая) — оставляет простую сзади.
          // V
          {
            const tr = r + dir * v, tc = c;
            const land = canLandSimple(state, clr, tr, tc);
            if (land.ok)
              moves.push({ kind: 'V', dice: d, fr: r, fc: c, tr, tc, action: land.action, fromStrong: true });
          }
          // H
          for (const sign of [-1, +1]) {
            const tr = r, tc = c + sign * v;
            const land = canLandSimple(state, clr, tr, tc);
            if (land.ok)
              moves.push({ kind: 'H', dice: d, fr: r, fc: c, tr, tc, action: land.action, fromStrong: true });
          }
        }
      }
    }
  }

  // Удалить дубликаты (одна и та же конечная клетка от одной фигуры разными путями)
  const seen = new Set();
  const uniq = [];
  for (const m of moves) {
    const k = `${m.kind}|${m.fr},${m.fc}|${m.tr},${m.tc}|${m.dice.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(m);
  }
  return uniq;
}

// Применить ход
function applyMove(state, mv) {
  const ns = {
    board: cloneBoard(state.board),
    bar: { [WHITE]: state.bar[WHITE].slice(), [BLACK]: state.bar[BLACK].slice() },
    dice: state.dice.map(d => ({ ...d })),
    isDouble: state.isDouble,
    turn: state.turn,
    finished: { ...state.finished },
  };

  const clr = state.turn;

  if (mv.kind === 'ENTRY') {
    // Снимаем одну шашку с бара именно из колонки mv.fromCol.
    const idx = ns.bar[clr].indexOf(mv.fromCol);
    if (idx >= 0) ns.bar[clr].splice(idx, 1);
    const target = ns.board[mv.tr][mv.tc];
    if (mv.action === 'merge') {
      // Своя простая + возвращённая → усиленная.
      ns.board[mv.tr][mv.tc] = { clr, stack: 2 };
    } else if (mv.action === 'capture') {
      // Чужая простая уходит на свой бар в колонку tc.
      for (let i = 0; i < target.stack; i++) ns.bar[target.clr].push(mv.tc);
      ns.board[mv.tr][mv.tc] = { clr, stack: 1 };
    } else {
      ns.board[mv.tr][mv.tc] = { clr, stack: 1 };
    }
    const die = ns.dice.find(d => d.id === mv.dice.id);
    if (die) die.used = true;
    return ns;
  }

  if (mv.kind === 'SV' || mv.kind === 'SH') {
    // Усиленная парой — оба кубика тратим
    ns.board[mv.fr][mv.fc] = null;
    const target = ns.board[mv.tr][mv.tc];
    if (target && target.clr !== clr) {
      // Выбиваем — записываем колонку выбитой шашки на бар (stack штук)
      for (let i = 0; i < target.stack; i++) {
        ns.bar[target.clr].push(mv.tc);
      }
    }
    ns.board[mv.tr][mv.tc] = { clr, stack: 2 };
    ns.dice[0].used = true;
    ns.dice[1].used = true;
    return ns;
  }

  // Простой одиночный ход (V или H)
  const from = ns.board[mv.fr][mv.fc];
  if (from.stack === 2) {
    // Усиленная сделала одиночный ход — на старой клетке остаётся простая
    ns.board[mv.fr][mv.fc] = { clr, stack: 1 };
  } else {
    ns.board[mv.fr][mv.fc] = null;
  }

  const target = ns.board[mv.tr][mv.tc];
  if (mv.action === 'merge') {
    ns.board[mv.tr][mv.tc] = { clr, stack: 2 };
  } else if (mv.action === 'capture') {
    // Сохраняем колонку выбитой шашки
    for (let i = 0; i < target.stack; i++) {
      ns.bar[target.clr].push(mv.tc);
    }
    ns.board[mv.tr][mv.tc] = { clr, stack: 1 };
  } else {
    ns.board[mv.tr][mv.tc] = { clr, stack: 1 };
  }

  const die = ns.dice.find(d => d.id === mv.dice.id);
  if (die) die.used = true;

  return ns;
}

function countHome(state, clr) {
  let cnt = 0, total = 0;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const p = state.board[r][c];
      if (!p || p.clr !== clr) continue;
      total += p.stack;
      if (isHomeRow(clr, r)) cnt += p.stack;
    }
  }
  return { home: cnt, total };
}

function checkWin(state) {
  for (const clr of [WHITE, BLACK]) {
    if (state.bar[clr].length > 0) continue;
    let allHome = true;
    let any = false;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const p = state.board[r][c];
        if (!p || p.clr !== clr) continue;
        any = true;
        if (!isHomeRow(clr, r)) { allHome = false; break; }
      }
      if (!allHome) break;
    }
    if (any && allHome) return clr;
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────
   ИИ
   ──────────────────────────────────────────────────────────────────── */

function evalState(state, forClr) {
  const enemy = forClr === WHITE ? BLACK : WHITE;
  let score = 0;

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const p = state.board[r][c];
      if (!p) continue;
      const adv = p.clr === WHITE ? (9 - r) : r;
      const base = p.stack === 2 ? 60 : 40;
      const sign = p.clr === forClr ? +1 : -1;
      score += sign * (base + adv * 4);
      if (isHomeRow(p.clr, r)) score += sign * 25;
    }
  }
  score -= state.bar[forClr].length * 80;
  score += state.bar[enemy].length * 80;

  return score;
}

function aiBestSequence(state, depth) {
  let bestScore = -Infinity;
  let bestSeq = [];

  function rec(s, seq, remaining) {
    if (remaining === 0 || s.dice.every(d => d.used)) {
      const score = evalState(s, state.turn);
      if (score > bestScore) {
        bestScore = score;
        bestSeq = seq.slice();
      }
      return;
    }
    const moves = allSingleMoves(s, state.turn, s.dice);
    if (moves.length === 0) {
      const score = evalState(s, state.turn);
      if (score > bestScore) {
        bestScore = score;
        bestSeq = seq.slice();
      }
      return;
    }
    const K = depth >= 3 ? 14 : (depth === 2 ? 10 : 8);
    const scoredMoves = moves.map(m => {
      const after = applyMove(s, m);
      return { m, sc: evalState(after, state.turn) };
    });
    scoredMoves.sort((a, b) => b.sc - a.sc);
    const top = scoredMoves.slice(0, K);
    for (const { m } of top) {
      const after = applyMove(s, m);
      seq.push(m);
      rec(after, seq, remaining - 1);
      seq.pop();
    }
  }

  const maxMoves = state.isDouble ? 4 : 2;
  rec(state, [], maxMoves);

  return bestSeq;
}

/* ────────────────────────────────────────────────────────────────────
   UI — общее состояние
   ──────────────────────────────────────────────────────────────────── */

let G = null;

function newGame(opts) {
  opts = opts || {};
  let firstTurn;
  if (typeof opts.firstTurn === 'number') {
    firstTurn = opts.firstTurn;
  } else {
    firstTurn = SETTINGS.firstPlayer;
    if (firstTurn === 'random') firstTurn = Math.random() < 0.5 ? WHITE : BLACK;
    else firstTurn = firstTurn === 'white' ? WHITE : BLACK;
  }

  G = {
    board: mkBoard(),
    bar: { [WHITE]: [], [BLACK]: [] },
    dice: [{ value: 0, used: true, id: 0 }, { value: 0, used: true, id: 1 }],
    isDouble: false,
    turn: firstTurn,
    selected: null,
    validMoves: [],
    selMoves: [],
    awaitingRoll: true,
    aiThinking: false,
    finished: { [WHITE]: 0, [BLACK]: 0 },
    gameOver: false,
    winner: null,
  };
  render();
  updateStatus();
  setRollBtn(true);
  document.getElementById('passBtn').disabled = true;

  if (!ONLINE && G.turn === BLACK) setTimeout(aiTurn, 600);
}

const SETTINGS = {
  difficulty: 'normal',
  firstPlayer: 'white',
};
const SCORES = { [WHITE]: 0, [BLACK]: 0 };

/* ────────────────────────────────────────────────────────────────────
   Бросок кубиков
   ──────────────────────────────────────────────────────────────────── */
function rollDice(forcedValues) {
  if (G.gameOver) return;
  if (!G.awaitingRoll) return;

  // В онлайн-режиме бросает только тот, чей ход — и рассылает сопернику результат
  if (ONLINE && !forcedValues && !isMyTurn()) return;

  const v1 = forcedValues ? forcedValues[0] : 1 + Math.floor(Math.random() * 6);
  const v2 = forcedValues ? forcedValues[1] : 1 + Math.floor(Math.random() * 6);

  if (ONLINE && !forcedValues) {
    ONLINE.sendDice([v1, v2]);
  }
  if (window.TG) window.TG.haptic('medium');
  G.dice = [
    { value: v1, used: false, id: 0 },
    { value: v2, used: false, id: 1 },
  ];
  G.isDouble = (v1 === v2);
  G.awaitingRoll = false;
  G.selected = null;
  G.selMoves = [];

  const d1 = document.getElementById('die1');
  const d2 = document.getElementById('die2');
  d1.classList.remove('used'); d2.classList.remove('used');
  d1.classList.add('rolling');
  d2.classList.add('rolling');
  setTimeout(() => {
    d1.classList.remove('rolling');
    d2.classList.remove('rolling');
    drawDie(d1, v1);
    drawDie(d2, v2);
    setRollBtn(false);
    G.validMoves = allSingleMoves(G, G.turn, G.dice);
    updateStatus();

    const passBtn = document.getElementById('passBtn');
    if (G.validMoves.length === 0) {
      // Кнопка «Пропустить» — только тот, чей ход
      passBtn.disabled = !isMyTurn();
      updateStatus(isMyTurn() ? 'Нет доступных ходов. Нажмите «Пропустить ход».'
                                : 'Сопернику нечем ходить…');
    } else {
      passBtn.disabled = true;
    }
    render();

    if (!ONLINE && G.turn === BLACK && !G.gameOver) {
      setTimeout(aiMakeMoves, 600);
    }
  }, 550);
}

function setRollBtn(active) {
  const btn = document.getElementById('rollBtn');
  btn.disabled = !active || G.gameOver || !isMyTurn();
}

function drawDie(el, val) {
  el.querySelectorAll('.pip').forEach(p => p.remove());
  const positions = {
    1: [[50,50]],
    2: [[25,25],[75,75]],
    3: [[25,25],[50,50],[75,75]],
    4: [[25,25],[75,25],[25,75],[75,75]],
    5: [[25,25],[75,25],[50,50],[25,75],[75,75]],
    6: [[25,25],[75,25],[25,50],[75,50],[25,75],[75,75]],
  };
  for (const [x, y] of positions[val]) {
    const pip = document.createElement('div');
    pip.className = 'pip';
    pip.style.left = `calc(${x}% - 4.5px)`;
    pip.style.top  = `calc(${y}% - 4.5px)`;
    el.appendChild(pip);
  }
}

/* ────────────────────────────────────────────────────────────────────
   Ход
   ──────────────────────────────────────────────────────────────────── */
function makeMove(mv, fromNetwork) {
  if (ONLINE && !fromNetwork) ONLINE.sendMove(mv);
  if (window.TG) window.TG.haptic(mv.capture ? 'heavy' : 'light');
  G = { ...G, ...applyMove(G, mv) };
  G.selected = null;
  G.selMoves = [];

  const w = checkWin(G);
  if (w) {
    G.gameOver = true;
    G.winner = w;
    SCORES[w] += 1;
    showWinner(w);
    render();
    return;
  }

  G.validMoves = allSingleMoves(G, G.turn, G.dice);

  const allUsed = G.dice.every(d => d.used);
  const noMoves = G.validMoves.length === 0;

  if (allUsed || noMoves) {
    endTurn();
  } else {
    updateStatus();
    render();
    if (!ONLINE && G.turn === BLACK && !G.gameOver) {
      setTimeout(aiMakeMoves, 500);
    }
  }
}

function endTurn() {
  G.turn = G.turn === WHITE ? BLACK : WHITE;
  G.awaitingRoll = true;
  G.dice = [{ value: 0, used: true, id: 0 }, { value: 0, used: true, id: 1 }];
  G.isDouble = false;
  G.validMoves = [];
  G.selected = null;
  G.selMoves = [];

  document.getElementById('passBtn').disabled = true;
  setRollBtn(true);
  render();
  updateStatus();

  if (!ONLINE && G.turn === BLACK && !G.gameOver) {
    setTimeout(aiTurn, 700);
  }
}

function passTurn(fromNetwork) {
  if (ONLINE && !fromNetwork) ONLINE.sendPass();
  endTurn();
}

/* ────────────────────────────────────────────────────────────────────
   ИИ
   ──────────────────────────────────────────────────────────────────── */
function aiTurn() {
  if (G.gameOver) return;
  G.awaitingRoll = true;
  rollDice();
}

function aiMakeMoves() {
  if (G.gameOver || G.turn !== BLACK) return;
  const depth = SETTINGS.difficulty === 'easy' ? 1 : SETTINGS.difficulty === 'normal' ? 2 : 3;
  const seq = aiBestSequence(G, depth);

  if (seq.length === 0) {
    setTimeout(() => endTurn(), 500);
    return;
  }

  let i = 0;
  function step() {
    if (G.gameOver) return;
    if (i >= seq.length) {
      const moves = allSingleMoves(G, G.turn, G.dice);
      if (moves.length === 0 || G.dice.every(d => d.used)) {
        setTimeout(() => endTurn(), 500);
      } else {
        const m = pickBestSingle(G, moves);
        makeMove(m);
      }
      return;
    }
    const mv = seq[i++];
    const current = allSingleMoves(G, G.turn, G.dice);
    const found = current.find(c => c.kind === mv.kind && c.fr === mv.fr && c.fc === mv.fc &&
                                    c.tr === mv.tr && c.tc === mv.tc);
    if (!found) {
      if (current.length === 0) {
        setTimeout(() => endTurn(), 400);
        return;
      }
      const best = pickBestSingle(G, current);
      makeMove(best);
      return;
    }
    makeMove(found);
    setTimeout(step, 650);
  }
  step();
}

function pickBestSingle(state, moves) {
  let best = moves[0], bs = -Infinity;
  for (const m of moves) {
    const a = applyMove(state, m);
    const s = evalState(a, state.turn);
    if (s > bs) { bs = s; best = m; }
  }
  return best;
}

/* ────────────────────────────────────────────────────────────────────
   Рендер
   ──────────────────────────────────────────────────────────────────── */
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

function cellXY(r, c) {
  return [MG + c * CS + CS/2, MG + r * CS + CS/2];
}
function xyToCell(x, y) {
  const c = Math.floor((x - MG) / CS);
  const r = Math.floor((y - MG) / CS);
  if (r < 0 || r >= N || c < 0 || c >= N) return null;
  return { r, c };
}

function render() {
  ctx.clearRect(0, 0, SZ, SZ);
  ctx.drawImage(buildBoardTex(), 0, 0);

  // Подсветка выбранной шашки
  if (G.selected && typeof G.selected === 'object' && !G.selected.bar) {
    const { r, c } = G.selected;
    const [x, y] = cellXY(r, c);
    ctx.fillStyle = 'rgba(240,200,40,.34)';
    ctx.fillRect(x - CS/2, y - CS/2, CS, CS);
  }

  // Подсветка возможных ходов
  for (const m of G.selMoves) {
    const [x, y] = cellXY(m.tr, m.tc);
    if (m.action === 'capture') {
      ctx.fillStyle = 'rgba(220,60,40,.32)';
      ctx.fillRect(x - CS/2, y - CS/2, CS, CS);
    }
    ctx.beginPath();
    ctx.arc(x, y, CS * 0.18, 0, Math.PI*2);
    if (m.action === 'merge') {
      ctx.fillStyle = 'rgba(212,160,48,.9)';
      ctx.shadowColor = 'rgba(212,160,48,.7)';
      ctx.shadowBlur = 10;
    } else if (m.action === 'capture') {
      ctx.fillStyle = 'rgba(255,80,60,.9)';
      ctx.shadowColor = 'rgba(255,80,60,.6)';
      ctx.shadowBlur = 8;
    } else {
      ctx.fillStyle = 'rgba(60,200,60,.85)';
      ctx.shadowColor = 'rgba(60,200,60,.6)';
      ctx.shadowBlur = 6;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.fill();
  }

  // Фишки
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const p = G.board[r][c];
      if (!p) continue;
      const sp = getPieceSprite(p.clr, p.stack);
      const [x, y] = cellXY(r, c);
      ctx.drawImage(sp, x - sp.width / 2, y - sp.height / 2);

      if (G.selected && typeof G.selected === 'object' && G.selected.r === r && G.selected.c === c) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, PR + 4, 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(255,210,40,.9)';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = 'rgba(255,210,40,.6)';
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // Кольца merge/capture поверх
  for (const m of G.selMoves) {
    if (m.action === 'merge' || m.action === 'capture') {
      const [x, y] = cellXY(m.tr, m.tc);
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, PR + 5, 0, Math.PI*2);
      if (m.action === 'merge') {
        ctx.strokeStyle = 'rgba(212,160,48,.95)';
        ctx.shadowColor = 'rgba(212,160,48,.8)';
      } else {
        ctx.strokeStyle = 'rgba(255,80,60,.95)';
        ctx.shadowColor = 'rgba(255,80,60,.7)';
      }
      ctx.lineWidth = 3;
      ctx.shadowBlur = 10;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.restore();
    }
  }

  renderBar();
  renderDice();
}

function renderDice() {
  const d1 = document.getElementById('die1');
  const d2 = document.getElementById('die2');
  if (!G.dice[0].value) {
    d1.querySelectorAll('.pip').forEach(p => p.remove());
    d2.querySelectorAll('.pip').forEach(p => p.remove());
    d1.classList.remove('used','active');
    d2.classList.remove('used','active');
    return;
  }
  if (G.dice[0].value) drawDie(d1, G.dice[0].value);
  if (G.dice[1].value) drawDie(d2, G.dice[1].value);
  d1.classList.toggle('used', G.dice[0].used);
  d2.classList.toggle('used', G.dice[1].used);
  // active: для текущего игрока есть валидный ход с использованием этого кубика
  const has0 = !G.dice[0].used && G.validMoves.some(m => m.dice.id === 0);
  const has1 = !G.dice[1].used && G.validMoves.some(m => m.dice.id === 1);
  d1.classList.toggle('active', has0 && isMyTurn() && !G.awaitingRoll);
  d2.classList.toggle('active', has1 && isMyTurn() && !G.awaitingRoll);
}

/* Бары теперь горизонтальные — рисуются поверх контейнеров barTop / barBottom.
   В каждом баре 10 ячеек (по числу столбцов). Шашка ставится в свою колонку. */
// В onlineRenderBar() рендерим «usable»-метки и выбор для текущего игрока (в оффлайне это всегда WHITE).
function renderBar() {
  // Белые — внизу, чёрные — сверху.
  const topEl = document.getElementById('barTop');     // BLACK
  const bottomEl = document.getElementById('barBottom'); // WHITE

  function buildSlots(el, clr) {
    el.innerHTML = '';
    const list = G.bar[clr];
    // Считаем сколько шашек в каждой колонке
    const colCount = Array(N).fill(0);
    for (const col of list) colCount[col]++;
    const firstCol = list.length > 0 ? list[0] : -1;

    // Узнаём, можем ли использовать сейчас (это ход этого игрока)
    const isOurTurn = G.turn === clr && !G.awaitingRoll;
    // Набор колонок, для которых есть возможный вход по выпавшим кубикам
    const usableCols = isOurTurn
      ? new Set(G.validMoves.filter(m => m.kind === 'ENTRY').map(m => m.fromCol))
      : new Set();
    // Выбранная колонка на баре (G.selected = {bar:true, col})
    const myClr = ONLINE ? ONLINE.myColor : WHITE;
    const selCol = (clr === myClr && typeof G.selected === 'object' && G.selected && G.selected.bar)
      ? G.selected.col : -1;

    for (let c = 0; c < N; c++) {
      const slot = document.createElement('div');
      slot.className = 'bar-slot';
      slot.dataset.col = c;
      slot.dataset.clr = clr;
      if (colCount[c] > 0) {
        const piece = document.createElement('div');
        piece.className = 'bar-piece ' + (clr === WHITE ? 'w' : 'b');
        if (usableCols.has(c)) piece.classList.add('usable');
        if (c === selCol) piece.classList.add('selected');
        slot.appendChild(piece);
        if (colCount[c] > 1) {
          const badge = document.createElement('div');
          badge.className = 'bar-count';
          badge.textContent = '×' + colCount[c];
          slot.appendChild(badge);
        }
      }
      el.appendChild(slot);
    }
  }

  buildSlots(topEl, BLACK);
  buildSlots(bottomEl, WHITE);
}

function updateStatus(customText) {
  const st = document.getElementById('status');
  let text = customText;
  if (!text) {
    // Названия игроков зависят от режима
    const whiteName = ONLINE ? (ONLINE.myColor === WHITE ? 'Вы' : 'Соперник') : 'Игрок';
    const blackName = ONLINE ? (ONLINE.myColor === BLACK ? 'Вы' : 'Соперник') : 'ИИ';
    if (G.gameOver) {
      text = G.winner === WHITE ? 'Победа белых' : 'Победа чёрных';
    } else if (G.awaitingRoll) {
      if (isMyTurn()) {
        text = '<span class="who">Ваш ход.</span> Бросьте кубики.';
      } else {
        text = ONLINE ? '<span class="who">Ход соперника.</span> Ожидаем броска…'
                       : '<span class="who">Ходят чёрные.</span> ИИ бросает кубики…';
      }
    } else {
      const remain = G.dice.filter(d => !d.used).map(d => `${d.value}`).join(' + ');
      const who = G.turn === WHITE ? whiteName : blackName;
      const verb = isMyTurn() ? 'ходите' : 'ходит';
      text = `<span class="who">${who} ${verb}.</span> Осталось: ${remain}`;
      if (G.bar[G.turn].length > 0) {
        text += isMyTurn() ? ' (есть шашка на баре)' : '';
      }
    }
  }
  st.innerHTML = text;
}

function showWinner(clr) {
  document.getElementById('overlay').classList.remove('hidden');
  document.getElementById('winTitle').textContent = clr === WHITE ? 'Победа белых' : 'Победа чёрных';
  let sub;
  if (ONLINE) {
    sub = clr === ONLINE.myColor ? 'Вы выиграли' : 'Соперник выиграл';
    if (window.TG) window.TG.haptic(clr === ONLINE.myColor ? 'success' : 'error');
  } else {
    sub = clr === WHITE ? 'Все ваши шашки на половине соперника' : 'Все шашки ИИ на вашей половине';
    if (window.TG) window.TG.haptic(clr === WHITE ? 'success' : 'warning');
  }
  document.getElementById('winSub').textContent = sub;
  document.getElementById('scoreW').textContent = SCORES[WHITE];
  document.getElementById('scoreB').textContent = SCORES[BLACK];

  // В онлайн-режиме показываем кнопку Реванша
  const rematchBtn = document.getElementById('rematchBtn');
  const restartBtn = document.getElementById('restartBtn');
  if (ONLINE) {
    rematchBtn.style.display = '';
    restartBtn.style.display = 'none';
  } else {
    rematchBtn.style.display = 'none';
    restartBtn.style.display = '';
  }
}

/* ────────────────────────────────────────────────────────────────────
   Клики
   ──────────────────────────────────────────────────────────────────── */
function onCanvasClick(ev) {
  if (G.gameOver || !isMyTurn() || G.awaitingRoll || G.aiThinking) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (ev.clientX - rect.left) * scaleX;
  const y = (ev.clientY - rect.top) * scaleY;
  const cell = xyToCell(x, y);
  if (!cell) return;

  if (G.selected) {
    const mv = G.selMoves.find(m => m.tr === cell.r && m.tc === cell.c);
    if (mv) {
      makeMove(mv);
      return;
    }
  }

  const myClr = ONLINE ? ONLINE.myColor : WHITE;
  const p = G.board[cell.r][cell.c];
  if (p && p.clr === myClr) {
    const moves = G.validMoves.filter(m => m.fr === cell.r && m.fc === cell.c);
    if (moves.length) {
      G.selected = { r: cell.r, c: cell.c };
      G.selMoves = moves;
      render();
      return;
    }
  }

  G.selected = null;
  G.selMoves = [];
  render();
}

function onBarClick(ev) {
  if (G.gameOver || !isMyTurn() || G.awaitingRoll) return;
  const myClr = ONLINE ? ONLINE.myColor : WHITE;
  if (G.bar[myClr].length === 0) return;

  // Находим слот бара, по которому кликнули
  const slot = ev.target.closest('.bar-slot');
  if (!slot) return;
  const col = parseInt(slot.dataset.col, 10);
  // Колонка должна быть в нашем баре
  if (!G.bar[myClr].includes(col)) return;

  // Отбираем входы именно из этой колонки
  const entryMoves = G.validMoves.filter(m => m.kind === 'ENTRY' && m.fromCol === col);
  if (entryMoves.length === 0) {
    updateStatus('Для этой шашки нет вариантов возврата по выпавшим числам.');
    setTimeout(updateStatus, 2200);
    return;
  }
  G.selected = { bar: true, col };
  G.selMoves = entryMoves;
  render();
}

// Клик по верхнему бару (для чёрных в онлайне)
function onBarClickTop(ev) {
  if (!ONLINE || ONLINE.myColor !== BLACK) return;
  if (G.gameOver || !isMyTurn() || G.awaitingRoll) return;
  if (G.bar[BLACK].length === 0) return;
  const slot = ev.target.closest('.bar-slot');
  if (!slot) return;
  const col = parseInt(slot.dataset.col, 10);
  if (!G.bar[BLACK].includes(col)) return;
  const entryMoves = G.validMoves.filter(m => m.kind === 'ENTRY' && m.fromCol === col);
  if (entryMoves.length === 0) {
    updateStatus('Для этой шашки нет вариантов возврата по выпавшим числам.');
    setTimeout(updateStatus, 2200);
    return;
  }
  G.selected = { bar: true, col };
  G.selMoves = entryMoves;
  render();
}

/* ────────────────────────────────────────────────────────────────────
   Настройки
   ──────────────────────────────────────────────────────────────────── */
function setupSettings() {
  document.querySelectorAll('[data-diff]').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('[data-diff]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      SETTINGS.difficulty = b.dataset.diff;
    };
  });
  document.querySelectorAll('[data-first]').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('[data-first]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      SETTINGS.firstPlayer = b.dataset.first;
    };
  });
}

/* ────────────────────────────────────────────────────────────────────
   Bootstrap
   ──────────────────────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  setupSettings();

  document.getElementById('rollBtn').addEventListener('click', () => {
    if (isMyTurn() && G.awaitingRoll) rollDice();
  });
  document.getElementById('passBtn').addEventListener('click', () => passTurn());
  document.getElementById('newGameBtn').addEventListener('click', () => {
    document.getElementById('overlay').classList.add('hidden');
    if (ONLINE) {
      // В онлайн-режиме кнопка «Новая игра» = выход в меню
      if (typeof leaveOnline === 'function') leaveOnline();
    } else {
      newGame();
    }
  });
  document.getElementById('restartBtn').addEventListener('click', () => {
    document.getElementById('overlay').classList.add('hidden');
    newGame();
  });
  document.getElementById('settingsBtn').addEventListener('click', () => {
    document.getElementById('settingsOverlay').classList.remove('hidden');
  });
  document.getElementById('settingsCloseBtn').addEventListener('click', () => {
    document.getElementById('settingsOverlay').classList.add('hidden');
  });
  document.getElementById('rulesBtn').addEventListener('click', () => {
    document.getElementById('rulesOverlay').classList.remove('hidden');
  });
  document.getElementById('rulesCloseBtn').addEventListener('click', () => {
    document.getElementById('rulesOverlay').classList.add('hidden');
  });
  // Клик по фону оверлея правил — тоже закрывает
  document.getElementById('rulesOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'rulesOverlay') {
      document.getElementById('rulesOverlay').classList.add('hidden');
    }
  });

  canvas.addEventListener('click', onCanvasClick);
  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    onCanvasClick({ clientX: t.clientX, clientY: t.clientY });
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  document.getElementById('barBottom').addEventListener('click', onBarClick);
  document.getElementById('barTop').addEventListener('click', onBarClickTop);

  // Не запускаем игру автоматически — ждём выбора режима в меню (online.js)
});
