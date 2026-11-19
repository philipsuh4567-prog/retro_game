(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const BASE_W = 270, BASE_H = 480;   // smallest field we ever use (portrait 9:16)
  const MAX_W = 304, MAX_H = 900;     // caps for very wide / very tall screens
  let W = BASE_W, H = BASE_H;         // current field size in art pixels (set by layout())
  const SAFE = { top: 0, bottom: 0 }; // notch / home-bar insets in art pixels
  const S = window.Sprites;

  /* ------------------------------------------------------------------ tuning */
  const CFG = {
    lives: 3,
    waves: 15,
    ship: {
      margin: 12,
      maxSpeed: 340,        // px/s cap
      smooth: 17,           // higher = lighter/snappier follow
      dragGain: 1.2,        // ship travels a bit further than the finger
      moveThreshold: 10,    // px/s: ship counts as "moving" (and fires) above this
      fireInterval: 0.11, bulletSpeed: 440,
      hitW: 9, hitH: 12,
      respawnDelay: 1.2, invuln: 2.4, keySpeed: 250,
    },
    hold: { time: 0.5, still: 0.06, moveDist: 7 },     // short, forgiving hold-to-activate
    dive: {                // Galaga-style dive bombs
      startDelay: 3.0,     // seconds after the formation breaks before the first dive
      interval: 2.6, intervalPerWave: 0.13, minInterval: 1.0,
      maxBase: 1, maxPerWave: 0.25,
      loop: 0.55, back: 1.1, speedBase: 165, speedPerWave: 6,
    },
    boss: { hp: 1100, baseY: 116, score: 25000 },   // baseY = boss centre below the HUD (plus any notch)
    charge: { base: 3, perKind: 0.8 },
    shield: { duration: 7, radius: 18 },
    laser: { duration: 4, dps: 22, width: 30 },
    time: { duration: 3, scale: 0.3 },     // shortest power-up; enemies + their bullets run at 30% speed
    enemy: {
      count: [10, 1.55],     // enemies per wave = round(a + b * wave)
      enterTime: 1.1, enterBudget: 1.2, formationHold: 0.7, rampTime: 0.9,
      hpPerWave: 0.3,        // extra hp every wave on top of the kind's base hp
      driftSpeed: 0.9, driftMax: 36,
      orbitMin: 5, orbitMaxLow: 10, orbitMaxHigh: 22,   // circle radius range; better kinds get bigger circles
      wanderBase: 3, wanderPerKind: 0.8,
    },
    fire: { base: 0.8, perWave: 0.17, speedBase: 105, speedPerWave: 5.5 },
  };

  // 10 kinds, weakest to strongest. pat = bullet pattern, col = bullet colour group
  const KIND = [null,
    { hp: 1, score: 100,  pat: 'single',  col: 'g', speed: 1.0 },
    { hp: 1, score: 150,  pat: 'single',  col: 'g', speed: 1.15 },
    { hp: 2, score: 250,  pat: 'double',  col: 'g', speed: 1.0 },
    { hp: 2, score: 350,  pat: 'aimed',   col: 'm', speed: 1.0 },
    { hp: 3, score: 500,  pat: 'fan3',    col: 'm', speed: 1.0 },
    { hp: 3, score: 650,  pat: 'burst',   col: 'm', speed: 1.1 },
    { hp: 4, score: 850,  pat: 'aimed3',  col: 'm', speed: 1.0 },
    { hp: 5, score: 1100, pat: 'fan5',    col: 'y', speed: 1.0 },
    { hp: 6, score: 1400, pat: 'aimed2',  col: 'y', speed: 1.1 },
    { hp: 8, score: 2000, pat: 'fan5aim', col: 'y', speed: 1.1 },
  ];
  const BCOL = {
    g: ['#7dff3a', '#e4ffd0', 'rgba(125,255,58,0.22)'],
    m: ['#ff4de0', '#ffe0fa', 'rgba(255,77,224,0.24)'],
    y: ['#ffd34d', '#fff6cf', 'rgba(255,211,77,0.24)'],
  };
  const EXP = { g: ['#25d558', '#a8ffc2'], m: ['#a24dff', '#e4b8ff'], y: ['#ffd34d', '#a24dff'] };

  // the 5 formations, spread so each shows up three times across the 15 waves
  const WAVE_FORM = ['grid', 'chevron', 'diamond', 'ring', 'wave',
                     'grid', 'diamond', 'chevron', 'wave', 'ring',
                     'chevron', 'grid', 'wave', 'ring', 'diamond'];

  const POWER = {
    shield: { color: '#3ff0ff' },
    laser: { color: '#ff8a1c' },
    time: { color: '#ff3df0' },
  };

  const SHIP_H = S.ship.h / 2;   // half the ship's height: nose/tail offset
  const rand = function (a, b) { return a + Math.random() * (b - a); };
  const clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  const lerp = function (a, b, t) { return a + (b - a) * t; };
  const sfx = function (n) { if (window.SFX) window.SFX.play(n); };
  const music = function (m, w) { if (window.MUSIC) window.MUSIC.set(m, w); };

  /* ------------------------------------------------------------------ canvas */
  const canvas = document.getElementById('game');
  const mainCtx = canvas.getContext('2d');
  let ctx = mainCtx;                 // render target: the screen, or the offscreen scene while the time-warp is on
  const scene = document.createElement('canvas'), sctx = scene.getContext('2d');
  const warpTmp = document.createElement('canvas'), tctx = warpTmp.getContext('2d');
  const stageEl = document.getElementById('stage');
  let bg = null;

  /* ------------------------------------------------------------------- state */
  const G = {
    mode: 'lobby',       // lobby | play | over | win
    t: 0, wave: 1, score: 0, lives: CFG.lives,
    ws: 'enter',         // wave state: enter | fight | clear
    wt: 0, formT: 0, fightT: 0, fireT: 1, etime: 0, ts: 1, diveT: 0.3,
    banner: null, shake: 0, flash: 0,
    respawnT: 0, endT: 0, holding: false,
  };
  const ship = { x: W / 2, y: H - 36, tx: W / 2, ty: H - 36, vx: 0, vy: 0, speed: 0,
                 alive: true, inv: 0, fireCd: 0, moving: false };
  const P = { type: 'shield', charge: 0, state: 'charge', hold: 0, time: 0, dur: 1 };
  let enemies = [], pbul = [], ebul = [], parts = [], rings = [];
  let boss = null, blasters = [];
  const stars = [];

  try { const sv = localStorage.getItem('neon.power'); if (sv === 'shield' || sv === 'laser' || sv === 'time') P.type = sv; } catch (_) {}

  function zone() {
    const bottom = H - 22 - SAFE.bottom;
    const top = Math.max(Math.round(H * 0.5), Math.round(H - SAFE.bottom - clamp(H * 0.4, 190, 260)));
    return { top: top, bottom: bottom };
  }

  /* ------------------------------------------------------ background + layout */
  function makeBg() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    for (let y = 0; y < H; y += 3) {
      const t = y / H;
      g.fillStyle = 'rgb(' + Math.round(5 + t * 15) + ',' + Math.round(3 + t * 6) + ',' + Math.round(20 + t * 42) + ')';
      g.fillRect(0, y, W, 3);
    }
    const bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    const img = g.getImageData(0, 0, W, H);
    const d = img.data;
    const f = function (x, y) {
      return (Math.sin(x * 0.021 + Math.sin(y * 0.013) * 2.1) +
              Math.sin(y * 0.017 + Math.cos(x * 0.011) * 1.7) +
              Math.sin((x + y) * 0.009 + 1.3) * 0.7) / 2.7;
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const th = bayer[y & 3][x & 3] / 16;
        const a = (f(x, y) - 0.3) / 0.7;
        const b = (f(x + 140, y * 1.3 + 90) - 0.42) / 0.58;
        let rgb = null;
        if (a > 0 && a > th) rgb = [48, 18, 100];
        else if (b > 0 && b > th) rgb = [12, 42, 100];
        if (rgb) {
          const i = (y * W + x) * 4;
          d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
        }
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  const STAR_COLORS = ['#ffffff', '#9fd8ff', '#ffb8f2', '#b9ffb0', '#ffe9a8'];
  function scatterStars() {
    stars.length = 0;
    const n = Math.round(100 * (W * H) / (BASE_W * BASE_H));
    for (let i = 0; i < n; i++) {
      const layer = i % 3;
      stars.push({
        x: Math.random() * W, y: Math.random() * H,
        v: [7, 16, 30][layer],
        big: layer === 2 && Math.random() < 0.2,
        ph: Math.random() * TAU, rate: rand(1.5, 5),
        col: STAR_COLORS[(Math.random() * STAR_COLORS.length) | 0],
      });
    }
  }

  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;visibility:hidden;pointer-events:none;' +
                        'padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom) 0';
  document.body.appendChild(probe);

  // Fill the whole screen: the field is always 270+ art pixels wide and 480-640 tall, whatever the phone's shape
  function layout() {
    const dpr = window.devicePixelRatio || 1;
    const vw = window.innerWidth;
    let vh = window.innerHeight;
    // iOS home-screen mode can report a viewport shorter than the screen (status bar area): cover it anyway
    if (window.navigator.standalone && vh > vw) vh = Math.max(vh, document.documentElement.clientHeight, Math.max(screen.width, screen.height));
    let s = Math.min(vw * dpr / BASE_W, vh * dpr / BASE_H);
    const whole = Math.floor(s);
    if (whole >= 2 && whole / s >= 0.88) s = whole;      // crisp whole-pixel scale when it wastes little
    const nW = clamp(Math.floor(vw * dpr / s), BASE_W, MAX_W);
    const nH = clamp(Math.floor(vh * dpr / s), BASE_H, MAX_H);
    const u = s / dpr;
    document.documentElement.style.setProperty('--u', u + 'px');
    stageEl.style.width = (nW * u) + 'px';
    stageEl.style.height = (nH * u) + 'px';
    const cs = getComputedStyle(probe);
    SAFE.top = (parseFloat(cs.paddingTop) || 0) / u;
    SAFE.bottom = (parseFloat(cs.paddingBottom) || 0) / u;
    if (nW === W && nH === H && bg) return;
    const dW = nW - W;
    W = nW; H = nH;
    canvas.width = W; canvas.height = H;
    scene.width = warpTmp.width = W; scene.height = warpTmp.height = H;
    mainCtx.imageSmoothingEnabled = sctx.imageSmoothingEnabled = tctx.imageSmoothingEnabled = false;
    bg = makeBg();
    scatterStars();
    if (G.mode === 'play') {
      enemies.forEach(function (e) { e.ax += dW / 2; e.x += dW / 2; });
      ship.x += dW / 2; ship.tx += dW / 2;
      const z = zone();
      ship.y = clamp(ship.y, z.top, z.bottom); ship.ty = clamp(ship.ty, z.top, z.bottom);
    }
  }
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', layout);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);
  layout();

  const auraCache = {};
  function aura(col) {
    if (!auraCache[col]) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
      gr.addColorStop(0, col + 'cc');
      gr.addColorStop(1, col + '00');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      auraCache[col] = c;
    }
    return auraCache[col];
  }

  /* ------------------------------------------------------------------- input */
  const inp = { down: false, id: null, lx: 0, ly: 0, ax: 0, ay: 0, lastMove: -9, keys: Object.create(null) };

  canvas.addEventListener('pointerdown', function (e) {
    if (G.mode !== 'play') return;
    e.preventDefault();
    inp.down = true; inp.id = e.pointerId;
    inp.lx = inp.ax = e.clientX; inp.ly = inp.ay = e.clientY;
    inp.lastMove = G.t;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!inp.down || e.pointerId !== inp.id || G.mode !== 'play') return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const kx = W / r.width, ky = H / r.height, z = zone(), sc = CFG.ship;
    const co = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    const list = co && co.length ? co : [e];
    for (let i = 0; i < list.length; i++) {
      ship.tx = clamp(ship.tx + (list[i].clientX - inp.lx) * kx * sc.dragGain, sc.margin, W - sc.margin);
      ship.ty = clamp(ship.ty + (list[i].clientY - inp.ly) * ky * sc.dragGain, z.top, z.bottom);
      inp.lx = list[i].clientX; inp.ly = list[i].clientY;
    }
    if (Math.hypot((e.clientX - inp.ax) * kx, (e.clientY - inp.ay) * ky) > CFG.hold.moveDist) {
      inp.lastMove = G.t; inp.ax = e.clientX; inp.ay = e.clientY;
    }
  });
  function release(e) { if (e.pointerId === inp.id) inp.down = false; }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  const KEYMAP = { ArrowLeft: 'l', a: 'l', ArrowRight: 'r', d: 'r', ArrowUp: 'u', w: 'u', ArrowDown: 'd', s: 'd', ' ': 'hold' };
  window.addEventListener('keydown', function (e) {
    const k = KEYMAP[e.key];
    if (k && G.mode === 'play') { inp.keys[k] = true; e.preventDefault(); }
    if (e.key === 'Enter' && (G.mode === 'lobby' || G.mode === 'over' || G.mode === 'win')) startGame();
  });
  window.addEventListener('keyup', function (e) { const k = KEYMAP[e.key]; if (k) inp.keys[k] = false; });
  window.addEventListener('blur', function () { inp.keys = Object.create(null); inp.down = false; });

  /* ------------------------------------------------------------- formations */
  // each generator returns slots {x, y, rank}; rank 0 = strongest position, 1 = weakest
  function evenCounts(n, rows) {
    const out = [];
    for (let r = 0; r < rows; r++) out.push(Math.floor(n / rows) + (r < n % rows ? 1 : 0));
    return out;
  }
  const maxOf = function (a) { return Math.max.apply(null, a); };

  function genGrid(n, b) {
    const cols = clamp(Math.ceil(Math.sqrt(n * 1.6)), 4, 7);
    const rows = Math.ceil(n / cols), counts = evenCounts(n, rows);
    const sx = Math.min(38, (b.w - 10) / Math.max(1, maxOf(counts) - 1));
    const sy = rows > 1 ? Math.min(34, b.h / (rows - 1)) : 0;
    const out = [];
    counts.forEach(function (c, r) {
      for (let i = 0; i < c; i++) out.push({ x: b.cx + (i - (c - 1) / 2) * sx, y: b.y0 + r * sy, rank: rows > 1 ? r / (rows - 1) : 0 });
    });
    return out;
  }

  function genChevron(n, b) {
    const m = Math.ceil(n / 9), counts = evenCounts(n, m);
    const kmax = Math.ceil((maxOf(counts) - 1) / 2);
    const dx = Math.min(30, (b.w / 2 - 10) / Math.max(1, kmax)), dy = dx * 0.5;
    const vs = m > 1 ? Math.min(40, (b.h - kmax * dy) / (m - 1)) : 0;
    const out = [];
    counts.forEach(function (c, v) {
      const apexY = b.y0 + kmax * dy + v * vs;
      for (let j = 0; j < c; j++) {
        const k = Math.ceil(j / 2), side = j === 0 ? 0 : (j % 2 ? -1 : 1);
        out.push({ x: b.cx + side * k * dx, y: apexY - k * dy, rank: clamp((v + 0.6 * (k / Math.max(1, kmax))) / m, 0, 1) });
      }
    });
    return out;
  }

  function genDiamond(n, b) {
    let R = 0;
    while (2 * R * R + 2 * R + 1 < n) R++;
    const pts = [];
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
      const d = Math.abs(i) + Math.abs(j);
      if (d <= R) pts.push({ i: i, j: j, d: d });
    }
    pts.sort(function (p, q) { return p.d - q.d || Math.abs(p.i) - Math.abs(q.i) || p.i - q.i; });
    const sel = pts.slice(0, n);
    const rx = Math.max(1, maxOf(sel.map(function (p) { return Math.abs(p.i); })));
    const ry = Math.max(1, maxOf(sel.map(function (p) { return Math.abs(p.j); })));
    const sx = Math.min(36, (b.w / 2 - 10) / rx), sy = Math.min(34, b.h / 2 / ry);
    const cy = b.y0 + ry * sy;
    return sel.map(function (p) { return { x: b.cx + p.i * sx, y: cy + p.j * sy, rank: clamp(p.d / (R + 0.01), 0, 1) }; });
  }

  function genRing(n, b) {
    const m = n <= 12 ? 1 : (n <= 26 ? 2 : 3);
    const Rx = b.w / 2 - 16, Ry = b.h / 2 - 8, cy = b.y0 + b.h / 2;
    const fr = [];
    let sum = 0;
    for (let k = 1; k <= m; k++) { fr.push(k / m); sum += k / m; }
    const counts = fr.map(function (f) { return Math.round(n * f / sum); });
    counts[m - 1] += n - counts.reduce(function (a, c) { return a + c; }, 0);
    const out = [];
    counts.forEach(function (c, ki) {
      const off = ki % 2 ? Math.PI / c : 0;
      for (let i = 0; i < c; i++) {
        const a = -Math.PI / 2 + off + i * TAU / c;
        out.push({ x: b.cx + Math.cos(a) * Rx * fr[ki], y: cy + Math.sin(a) * Ry * fr[ki], rank: clamp(ki / m + 0.1 * (i / c), 0, 1) });
      }
    });
    return out;
  }

  function genWave(n, b) {
    const cols = clamp(Math.ceil(Math.sqrt(n * 1.9)), 5, 8);
    const rows = Math.ceil(n / cols), counts = evenCounts(n, rows);
    const amp = Math.min(12, b.h / (rows * 3));
    const sx = Math.min(36, (b.w - 10) / (cols - 1));
    const sy = rows > 1 ? Math.min(32, (b.h - 2 * amp) / (rows - 1)) : 0;
    const out = [];
    counts.forEach(function (c, r) {
      for (let i = 0; i < c; i++) {
        const xn = i - (c - 1) / 2;
        out.push({ x: b.cx + xn * sx, y: b.y0 + amp + r * sy + Math.sin(xn * 0.9 + r * 0.35) * amp, rank: rows > 1 ? r / (rows - 1) : 0 });
      }
    });
    return out;
  }

  const GEN = { grid: genGrid, chevron: genChevron, diamond: genDiamond, ring: genRing, wave: genWave };

  function formationBox() {
    const z = zone();
    const y0 = 62 + SAFE.top, y1 = z.top - 46;
    return { w: W - 44, cx: W / 2, y0: y0, h: Math.max(90, y1 - y0) };
  }

  // gradual difficulty: the strongest kind present climbs 1 -> 10 across the 15 waves, with a widening mix below it
  function pickKinds(slots, wave) {
    const L = 1 + (wave - 1) * 0.62;
    const spread = Math.min(L - 1, 2.5 + wave * 0.2);
    return slots.map(function (s) { return clamp(Math.round(L - s.rank * spread + rand(-0.4, 0.4)), 1, 10); });
  }

  /* ------------------------------------------------------------- game flow */
  function resetShip() {
    const z = zone();
    ship.x = ship.tx = W / 2;
    ship.y = ship.ty = z.bottom - 14;
    ship.vx = ship.vy = ship.speed = 0;
    ship.alive = true; ship.inv = 0; ship.fireCd = 0;
  }

  function startGame() {
    const q = new URLSearchParams(location.search);
    const w0 = parseInt(q.get('wave'), 10);
    sfx('start');
    G.mode = 'play'; G.t = 0; G.ts = 1; G.etime = 0;
    G.score = 0; G.lives = CFG.lives; G.shake = 0; G.flash = 0; G.respawnT = 0; G.endT = 0;
    enemies = []; pbul = []; ebul = []; parts = []; rings = []; boss = null; blasters = [];
    P.charge = 0; P.state = 'charge'; P.hold = 0;
    inp.down = false; inp.keys = Object.create(null); inp.lastMove = -9;
    resetShip();
    ui.lobby.classList.add('hidden');
    ui.end.classList.add('hidden');
    if (w0 === CFG.waves + 1) startBoss(); else startWave(w0 >= 1 && w0 <= CFG.waves ? w0 : 1);
  }

  function startWave(n) {
    music('battle', n);
    G.wave = n; G.ws = 'enter'; G.wt = 0; G.formT = 0; G.fightT = 0; G.fireT = 1.2; G.diveT = 0.3; boss = null; blasters = [];
    G.banner = { text: 'WAVE ' + n, color: '#3ff0ff', t: 0, dur: 1.9 };
    sfx('wave');
    const E = CFG.enemy;
    const count = Math.round(E.count[0] + E.count[1] * n);
    const slots = GEN[WAVE_FORM[n - 1]](count, formationBox());
    const kinds = pickKinds(slots, n);
    const order = slots.map(function (s, i) { return i; }).sort(function (a, b) { return slots[a].y - slots[b].y; });
    const stagger = Math.min(0.06, E.enterBudget / count);
    enemies = slots.map(function (s, i) {
      const kind = kinds[i], spr = S.enemy[kind][0];
      const hp = KIND[kind].hp + Math.floor((n - 1) * E.hpPerWave);
      const k01 = (kind - 1) / 9;
      return {
        kind: kind, hp: hp, maxHp: hp, w: spr.w, h: spr.h,
        ax: s.x, ay: s.y, x: s.x, y: -30,
        state: 'enter', t: 0, delay: order.indexOf(i) * stagger,
        swoop: (i % 2 ? -1 : 1) * rand(30, 70),
        // circle: size random from small to small-medium (bigger ceiling for better kinds); better kinds spin faster
        r: rand(E.orbitMin, lerp(E.orbitMaxLow, E.orbitMaxHigh, k01)),
        w2: (Math.random() < 0.5 ? -1 : 1) * (0.5 + 0.14 * kind) * rand(0.85, 1.15) * (1 + n * 0.02),
        th: rand(0, TAU), ramp: 0, flash: 0, ph: Math.random(),
        wa: E.wanderBase + E.wanderPerKind * kind,
        wf1: rand(0.3, 0.7), wf2: rand(0.3, 0.7), wp1: rand(0, TAU), wp2: rand(0, TAU),
      };
    });
  }

  function endGame(win) {
    music('lobby');
    G.mode = win ? 'win' : 'over';
    sfx(win ? 'victory' : 'gameover');
    ui.endTitle.textContent = win ? 'VICTORY' : 'GAME OVER';
    ui.endTitle.className = win ? 'win' : 'lose';
    ui.endStats.innerHTML = (win ? 'BOSS DEFEATED<br>ALL WAVES CLEARED' : G.wave > CFG.waves ? 'FELL TO THE BOSS' : 'REACHED WAVE ' + G.wave + ' / ' + CFG.waves) +
      '<br><br>SCORE ' + String(G.score).padStart(6, '0');
    ui.end.classList.remove('hidden');
  }

  /* --------------------------------------------------------------- effects */
  function burst(x, y, col, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = spd * (0.3 + Math.random() * 0.9);
      parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.35 + Math.random() * 0.45,
                   col: col, size: Math.random() < 0.3 ? 2 : 1 });
    }
  }
  function ring(x, y, col, speed, max) { rings.push({ x: x, y: y, r: 2, speed: speed, max: max, col: col, life: 0 }); }

  /* --------------------------------------------------------------- powerups */
  function addCharge(n) {
    if (P.state !== 'charge') return;
    P.charge = Math.min(100, P.charge + n);
    if (P.charge >= 100) { P.state = 'ready'; P.hold = 0; sfx('ready'); }
  }

  function activatePower() {
    P.state = 'active'; P.dur = CFG[P.type].duration; P.time = P.dur; P.hold = 0;
    G.flash = 0.45; G.shake = P.type === 'time' ? 0 : 4;
    ring(ship.x, ship.y, POWER[P.type].color, 240, 110);
    burst(ship.x, ship.y, POWER[P.type].color, 18, 120);
  }

  function endPower() { P.state = 'charge'; P.charge = 0; P.hold = 0; }

  const laserOn = function () { return P.state === 'active' && P.type === 'laser'; };
  const shieldOn = function () { return P.state === 'active' && P.type === 'shield'; };
  const timeOn = function () { return P.state === 'active' && P.type === 'time'; };

  /* ---------------------------------------------------------------- combat */
  function killEnemy(e) {
    e.dead = true;
    sfx('boom');
    const spec = KIND[e.kind];
    G.score += spec.score;
    addCharge(CFG.charge.base + CFG.charge.perKind * e.kind);
    const c = EXP[spec.col];
    burst(e.x, e.y, c[0], 14, 110);
    burst(e.x, e.y, c[1], 8, 80);
    burst(e.x, e.y, '#ffffff', 4, 60);
    ring(e.x, e.y, c[1], 110, 22);
  }

  function hitEnemy(e, dmg) {
    e.hp -= dmg;
    e.flash = 0.07;
    sfx('hit');
    if (e.hp <= 0 && !e.dead) killEnemy(e);
  }

  function killShip() {
    ship.alive = false;
    sfx('death');
    G.lives--;
    G.shake = 7;
    inp.keys = Object.create(null);
    if (P.state === 'active') endPower(); else P.hold = 0;
    burst(ship.x, ship.y, '#3d8bff', 22, 130);
    burst(ship.x, ship.y, '#ff8a1c', 22, 150);
    burst(ship.x, ship.y, '#ffffff', 10, 90);
    ring(ship.x, ship.y, '#ffd34d', 160, 50);
    ring(ship.x, ship.y, '#ff8a1c', 100, 34);
    if (G.lives <= 0) G.endT = 1.6; else G.respawnT = CFG.ship.respawnDelay;
  }

  function enemyShoot(e) {
    sfx('eshoot');
    const spec = KIND[e.kind];
    const sp = (CFG.fire.speedBase + CFG.fire.speedPerWave * G.wave) * spec.speed;
    const aim = ship.alive ? Math.atan2(ship.x - e.x, ship.y - e.y) : 0;
    const make = function (dx, ang, dy) {
      ebul.push({ x: e.x + dx, y: e.y + e.h / 2 + (dy || 0), vx: Math.sin(ang) * sp, vy: Math.cos(ang) * sp, col: spec.col });
    };
    const fan = function (base, steps) { steps.forEach(function (a) { make(0, base + a); }); };
    switch (spec.pat) {
      case 'single': make(0, 0); break;
      case 'double': make(-4, 0); make(4, 0); break;
      case 'aimed': make(0, aim); break;
      case 'fan3': fan(0, [-0.22, 0, 0.22]); break;
      case 'burst': make(0, 0, 0); make(0, 0, -12); make(0, 0, -24); break;
      case 'aimed3': fan(aim, [-0.2, 0, 0.2]); break;
      case 'fan5': fan(0, [-0.4, -0.2, 0, 0.2, 0.4]); break;
      case 'aimed2': make(-4, aim); make(4, aim); break;
      default: fan(aim, [-0.4, -0.2, 0, 0.2, 0.4]);
    }
  }

  /* ---------------------------------------------------------------- update */
  function updateStars(dt) {
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      s.y += s.v * dt;
      if (s.y > H) { s.y -= H + 2; s.x = Math.random() * W; }
    }
  }

  function updateShip(dt) {
    const sc = CFG.ship, k = inp.keys, z = zone();
    const kx = (k.r ? 1 : 0) - (k.l ? 1 : 0), ky = (k.d ? 1 : 0) - (k.u ? 1 : 0);
    if (kx || ky) {
      ship.tx = clamp(ship.tx + kx * sc.keySpeed * dt, sc.margin, W - sc.margin);
      ship.ty = clamp(ship.ty + ky * sc.keySpeed * dt, z.top, z.bottom);
    }
    ship.ty = clamp(ship.ty, z.top, z.bottom);
    const f = 1 - Math.exp(-sc.smooth * dt);
    let sx = (ship.tx - ship.x) * f, sy = (ship.ty - ship.y) * f;
    const m = Math.hypot(sx, sy), lim = sc.maxSpeed * dt;
    if (m > lim) { sx *= lim / m; sy *= lim / m; }
    ship.x += sx; ship.y += sy;
    ship.vx = sx / dt; ship.vy = sy / dt;
    ship.speed = Math.hypot(ship.vx, ship.vy);
    ship.moving = ship.speed > sc.moveThreshold;
    if (ship.inv > 0) ship.inv -= dt;

    ship.fireCd = Math.max(0, ship.fireCd - dt);
    if (ship.moving && !laserOn() && ship.fireCd <= 0) {
      pbul.push({ x: ship.x - 4, y: ship.y - 8 }, { x: ship.x + 4, y: ship.y - 8 });
      sfx('shoot');
      ship.fireCd = sc.fireInterval;
    }
  }

  function updatePower(dt) {
    const stillFinger = inp.down && (G.t - inp.lastMove) > CFG.hold.still;
    G.holding = ship.alive && (stillFinger || !!inp.keys.hold);
    if (P.state === 'ready') {
      if (G.holding) {
        P.hold += dt;
        if (P.hold >= CFG.hold.time) activatePower();
      } else P.hold = Math.max(0, P.hold - dt * 2.5);
    } else if (P.state === 'active') {
      P.time -= dt;
      P.charge = 100 * Math.max(0, P.time) / P.dur;
      if (P.time <= 0) endPower();
    }
  }

  function aimedShot(e) {
    sfx('eshoot');
    const sp = (CFG.fire.speedBase + CFG.fire.speedPerWave * G.wave) * 1.1;
    const a = ship.alive ? Math.atan2(ship.x - e.x, ship.y - e.y) : 0;
    ebul.push({ x: e.x, y: e.y + e.h / 2, vx: Math.sin(a) * sp, vy: Math.cos(a) * sp, col: KIND[e.kind].col });
  }

  function startDive(e) {
    sfx('dive');
    e.state = 'loop'; e.dt = 0; e.side = Math.random() < 0.5 ? -1 : 1;
    e.p0x = e.x; e.p0y = e.y;
    e.diveTarget = ship.x + rand(-28, 28);
    e.shots = 2;
  }

  // edt = enemy time step (slowed while the time power-up is active)
  function updateEnemies(edt) {
    const E = CFG.enemy, D = CFG.dive;
    let allIn = true;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.state === 'enter') {
        e.t += edt;
        const p = clamp((e.t - e.delay) / E.enterTime, 0, 1), k = 1 - Math.pow(1 - p, 3);
        e.x = e.ax + (1 - k) * e.swoop;
        e.y = -24 + (e.ay + 24) * k;
        if (p >= 1) e.state = 'hold'; else allIn = false;
      }
    }
    if (G.ws === 'enter' && allIn && enemies.length) {
      G.formT += edt;
      if (G.formT >= E.formationHold) {
        G.ws = 'fight';
        enemies.forEach(function (e) { e.state = 'free'; });
      }
    }
    if (G.ws === 'fight') {
      G.fightT += edt; G.etime += edt;
      const drift = Math.min(E.driftMax, E.driftSpeed * G.fightT);
      let divers = 0;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.state === 'free') {
          e.th += e.w2 * edt;
          e.ramp = Math.min(1, e.ramp + edt / E.rampTime);
          const k = e.ramp * e.ramp * (3 - 2 * e.ramp);
          e.x = e.ax + (Math.cos(e.th) * e.r + Math.sin(G.etime * e.wf1 + e.wp1) * e.wa) * k;
          e.y = e.ay + drift + (Math.sin(e.th) * e.r + Math.sin(G.etime * e.wf2 + e.wp2) * e.wa * 0.7) * k;
          e.x = clamp(e.x, e.w / 2 + 2, W - e.w / 2 - 2);
        } else if (e.state === 'loop') {
          divers++;
          e.dt += edt;
          const a = clamp(e.dt / D.loop, 0, 1) * TAU;
          e.x = e.p0x + e.side * Math.sin(a) * 14;
          e.y = e.p0y - (1 - Math.cos(a)) * 9;
          if (e.dt >= D.loop) {
            e.state = 'swoop'; e.dt = 0; e.p0x = e.x; e.p0y = e.y;
            e.dur = Math.max(1.5, (H + 30 - e.p0y) / (D.speedBase + D.speedPerWave * G.wave));
          }
        } else if (e.state === 'swoop') {
          divers++;
          e.dt += edt;
          const u = clamp(e.dt / e.dur, 0, 1);
          const x2 = clamp(e.diveTarget, 14, W - 14), y2 = H + 30;
          const cx = lerp(e.p0x, x2, 0.15) + e.side * 70, cy = e.p0y + (y2 - e.p0y) * 0.35;
          const q0 = (1 - u) * (1 - u), q1 = 2 * (1 - u) * u, q2 = u * u;
          e.x = q0 * e.p0x + q1 * cx + q2 * x2;
          e.y = q0 * e.p0y + q1 * cy + q2 * y2;
          while (e.shots > 0 && u >= (e.shots === 2 ? 0.25 : 0.55)) { aimedShot(e); e.shots--; }
          if (u >= 1) { e.state = 'return'; e.dt = 0; }
        } else if (e.state === 'return') {
          divers++;
          e.dt += edt;
          const u = clamp(e.dt / D.back, 0, 1), k = 1 - (1 - u) * (1 - u);
          e.x = e.ax + (1 - k) * e.side * 40;
          e.y = lerp(-24, e.ay + drift, k);
          if (u >= 1) { e.state = 'free'; e.ramp = 0; }
        }
      }
      G.diveT -= edt;
      if (G.fightT >= D.startDelay && G.diveT <= 0) {
        if (divers < Math.floor(D.maxBase + D.maxPerWave * G.wave)) {
          const pool = enemies.filter(function (e) { return e.state === 'free' && e.ramp >= 1; });
          if (pool.length) startDive(pool[(Math.random() * pool.length) | 0]);
        }
        G.diveT = Math.max(D.minInterval, D.interval - D.intervalPerWave * G.wave) * rand(0.8, 1.25);
      }
      G.fireT -= edt;
      if (G.fireT <= 0 && enemies.length) {
        const free = enemies.filter(function (e) { return e.state === 'free'; });
        if (free.length) enemyShoot(free[(Math.random() * free.length) | 0]);
        const rate = CFG.fire.base + CFG.fire.perWave * G.wave;
        G.fireT = (1 / rate) * rand(0.6, 1.4);
      }
    }
  }

  /* ------------------------------------------------------------------ boss */
  // per phase: ring [interval, bullets, speed, repeats], fan [interval, shots], blaster [interval, count],
  // spiral [interval, duration, arms], minion interval
  const BOSS_PH = [null,
    { ring: [2.6, 14, 80, 1],  fan: [4.0, 3], blaster: [11, 1],  spiral: [0, 0, 0],     minion: 9 },
    { ring: [2.2, 18, 90, 2],  fan: [3.4, 5], blaster: [7.5, 2], spiral: [6.0, 2.4, 1], minion: 8 },
    { ring: [1.8, 22, 100, 2], fan: [2.8, 5], blaster: [5.5, 3], spiral: [4.5, 2.6, 2], minion: 7 },
  ];

  function startBoss() {
    const spr = S.boss;
    music('boss');
    G.wave = CFG.waves + 1; G.ws = 'boss'; G.wt = 0; G.fireT = 2;
    enemies = []; ebul = []; blasters = [];
    G.banner = { text: 'WARNING', color: '#ff4455', t: 0, dur: 2.6, flicker: true };
    sfx('warning');
    boss = { x: W / 2, y: -spr.h, w: spr.w, h: spr.h, k: spr.k, hp: CFG.boss.hp, maxHp: CFG.boss.hp, state: 'enter', t: 0,
             flash: 0, phase: 1, hatch: 0, dyingT: 0, boomT: 0, queue: [],
             tm: { ring: 2.5, fan: 4, blaster: 7, spiral: 3, minion: 3.5 }, sp: { left: 0, tick: 0, a: 0, arms: 1 } };
  }

  function bossHit(d) {
    const b = boss;
    if (!b || b.state !== 'fight') return;
    b.hp -= d; b.flash = 0.05;
    sfx('hit');
    addCharge(d * 0.12);
    G.score += Math.round(d * 10);
    if (b.hp <= 0) {
      b.hp = 0; sfx('bossdeath'); b.state = 'dying'; b.dyingT = 0; b.boomT = 0; b.queue = [];
      ebul = []; blasters = []; G.banner = null; G.shake = 6;
      enemies.forEach(function (e) { killEnemy(e); });
    }
  }

  function bossRing(b, n, sp, off) {
    sfx('ring');
    for (let i = 0; i < n; i++) {
      const a = off + i * TAU / n;
      ebul.push({ x: b.x, y: b.y - 4 * b.k, vx: Math.sin(a) * sp, vy: Math.cos(a) * sp, col: 'm', orb: true });
    }
  }

  function spawnBlasters(n) {
    sfx('blasterWarn');
    const offs = [0, -72, 72, -144, 144];
    for (let i = 0; i < n; i++) {
      blasters.push({ x: clamp(ship.x + offs[i], 22, W - 22), w: 24, y0: boss.y + boss.h / 2 - 8,
                      t: 0, inT: 0.6, warn: 1.0, fire: 0.8, out: 0.7, side: Math.random() < 0.5 ? -1 : 1, state: 'in' });
    }
  }

  function spawnMinions(b) {
    const offs = [-100, -60, -20, 20, 60, 100];
    b.hatch = 0.9;
    sfx('spawn');
    offs.forEach(function (off, i) {
      const kind = i % 3 === 2 ? 2 : 1, spr = S.enemy[kind][0], side = off < 0 ? -1 : 1;
      enemies.push({
        kind: kind, hp: 1, maxHp: 1, w: spr.w, h: spr.h, minion: true, hidden: true, off: off, side: side,
        ax: b.x + off, ay: b.y + b.h / 2 + 40, x: b.x, y: b.y,
        state: 'spawn', t: 0, delay: (side < 0 ? i : i - 3) * 0.18,
        r: rand(3, 7), w2: (Math.random() < 0.5 ? -1 : 1) * rand(1, 2), th: rand(0, TAU), ramp: 0, flash: 0, ph: Math.random(),
      });
    });
  }

  function updateMinions(edt) {
    const b = boss;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.minion) continue;
      if (e.state === 'spawn') {
        e.t += edt;
        e.hidden = e.t < e.delay;
        const u = clamp((e.t - e.delay) / 1.1, 0, 1), k = 1 - Math.pow(1 - u, 3);
        const sx = b.x + e.side * 25.5 * b.k, sy = b.y - 8 * b.k, tx = b.x + e.off, ty = b.y + b.h / 2 + 40;
        e.x = lerp(sx, tx, k) + e.side * Math.sin(u * Math.PI) * 18;
        e.y = lerp(sy, ty, k) - Math.sin(u * Math.PI) * 10;
        if (u >= 1) { e.state = 'free'; e.ramp = 0; }
      } else {
        e.th += e.w2 * edt;
        e.ramp = Math.min(1, e.ramp + edt / 0.6);
        const k = e.ramp * e.ramp * (3 - 2 * e.ramp);
        e.x = b.x + e.off + Math.cos(e.th) * e.r * k;
        e.y = b.y + b.h / 2 + 40 + Math.sin(e.th) * e.r * k;
      }
    }
  }

  function bossAttacks(b, edt) {
    const f = b.hp / b.maxHp, ph = f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
    if (ph !== b.phase) {
      b.phase = ph;
      G.banner = { text: ph === 2 ? 'PHASE 2' : 'FINAL PHASE', color: '#ff4455', t: 0, dur: 1.8, flicker: true };
      G.shake = 6; sfx('phase');
      ring(b.x, b.y, '#ff4455', 220, 130);
      ebul.forEach(function (x) { burst(x.x, x.y, '#ffffff', 2, 40); });
      ebul = [];
      b.tm.ring = 1.5; b.tm.fan = 3; b.tm.blaster = 3; b.tm.minion = 2.5;
    }
    const C = BOSS_PH[ph], tm = b.tm;
    if ((tm.ring -= edt) <= 0) {
      tm.ring = C.ring[0];
      const off = Math.random() * TAU, n = C.ring[1], sp = C.ring[2];
      bossRing(b, n, sp, off);
      if (C.ring[3] > 1) b.queue.push({ t: 0.4, f: function () { if (boss) bossRing(boss, n, sp, off + TAU / n / 2); } });
    }
    if ((tm.fan -= edt) <= 0) {
      tm.fan = C.fan[0];
      const aim = ship.alive ? Math.atan2(ship.x - b.x, ship.y - (b.y + b.h / 2)) : 0, k = C.fan[1];
      for (let i = 0; i < k; i++) {
        const a = aim + (i - (k - 1) / 2) * 0.17;
        ebul.push({ x: b.x, y: b.y + b.h / 2, vx: Math.sin(a) * 130, vy: Math.cos(a) * 130, col: 'm' });
      }
    }
    if (C.blaster[0] > 0 && (tm.blaster -= edt) <= 0) { tm.blaster = C.blaster[0]; spawnBlasters(C.blaster[1]); }
    if (C.spiral[0] > 0) {
      if (b.sp.left <= 0 && (tm.spiral -= edt) <= 0) { tm.spiral = C.spiral[0] + C.spiral[1]; b.sp.left = C.spiral[1]; b.sp.arms = C.spiral[2]; }
      if (b.sp.left > 0) {
        b.sp.left -= edt; b.sp.tick -= edt;
        if (b.sp.tick <= 0) {
          b.sp.tick = 0.075;
          for (let k = 0; k < b.sp.arms; k++) {
            const a = b.sp.a + k * TAU / b.sp.arms;
            ebul.push({ x: b.x, y: b.y - 4 * b.k, vx: Math.sin(a) * 95, vy: Math.cos(a) * 95, col: 'm', orb: true });
          }
          b.sp.a += 0.33;
        }
      }
    }
    if ((tm.minion -= edt) <= 0) { tm.minion = C.minion; if (enemies.length < 6) spawnMinions(b); }
  }

  function updateBoss(edt, dt) {
    if (G.ws === 'bossdone') { G.wt += dt; if (G.wt >= 1.8) endGame(true); return; }
    const b = boss;
    b.t += edt; b.flash = Math.max(0, b.flash - dt); b.hatch = Math.max(0, b.hatch - dt);
    if (b.state === 'enter') {
      const p = clamp(b.t / 3.2, 0, 1);
      b.y = lerp(-b.h, CFG.boss.baseY + SAFE.top, 1 - Math.pow(1 - p, 3));
      if (p >= 1) { b.state = 'fight'; b.t = 0; G.banner = { text: 'FINAL BOSS', color: '#ff3df0', t: 0, dur: 2 }; sfx('boss'); }
    } else if (b.state === 'fight') {
      b.x = W / 2 + Math.sin(b.t * 0.45) * Math.max(10, (W - b.w) / 2) ;
      b.y = CFG.boss.baseY + SAFE.top + Math.sin(b.t * 0.9) * 6;
      bossAttacks(b, edt);
      for (let i = b.queue.length - 1; i >= 0; i--) {
        b.queue[i].t -= edt;
        if (b.queue[i].t <= 0) { const q = b.queue.splice(i, 1)[0]; q.f(); }
      }
      updateMinions(edt);
      G.fireT -= edt;
      if (G.fireT <= 0) {
        const free = enemies.filter(function (e) { return e.state === 'free'; });
        if (free.length) enemyShoot(free[(Math.random() * free.length) | 0]);
        G.fireT = rand(1.1, 2.0);
      }
    } else if (b.state === 'dying') {
      b.dyingT += dt; b.boomT -= dt;
      if (b.boomT <= 0) {
        b.boomT = 0.1;
        const x = b.x + rand(-b.w * 0.4, b.w * 0.4), y = b.y + rand(-b.h * 0.4, b.h * 0.4);
        burst(x, y, '#ffd34d', 10, 110); burst(x, y, '#ff3df0', 8, 90); burst(x, y, '#ffffff', 4, 70);
        ring(x, y, '#ffe27a', 130, 26);
        G.shake = Math.max(G.shake, 3);
      }
      if (b.dyingT >= 2.6) {
        for (let i = 0; i < 8; i++) { burst(b.x + rand(-50, 50), b.y + rand(-25, 25), i % 2 ? '#ffd34d' : '#ff3df0', 16, 160); }
        G.flash = 0.9; G.shake = 8; G.score += CFG.boss.score;
        boss = null; G.ws = 'bossdone'; G.wt = 0;
      }
    }
    for (let i = 0; i < blasters.length; i++) {
      const bl = blasters[i];
      const was = bl.state;
      bl.t += edt;
      const t1 = bl.inT, t2 = t1 + bl.warn, t3 = t2 + bl.fire;
      bl.state = bl.t < t1 ? 'in' : bl.t < t2 ? 'warn' : bl.t < t3 ? 'fire' : 'out';
      if (was === 'warn' && bl.state === 'fire') sfx('blasterFire');
    }
    blasters = blasters.filter(function (bl) { return bl.t < bl.inT + bl.warn + bl.fire + bl.out; });
  }

  function collisions(dt) {
    const sc = CFG.ship;
    // player bullets -> enemies
    for (let i = 0; i < pbul.length; i++) {
      const b = pbul[i];
      for (let j = 0; j < enemies.length; j++) {
        const e = enemies[j];
        if (e.dead || e.hidden) continue;
        if (Math.abs(b.x - e.x) < e.w * 0.45 + 1 && Math.abs(b.y - e.y) < e.h * 0.5 + 4) {
          b.dead = true;
          hitEnemy(e, 1);
          burst(b.x, b.y, '#8ff6ff', 3, 60);
          break;
        }
      }
    }
    // giant laser
    if (laserOn() && ship.alive) {
      const half = CFG.laser.width / 2;
      for (let j = 0; j < enemies.length; j++) {
        const e = enemies[j];
        if (e.dead || e.hidden) continue;
        if (Math.abs(e.x - ship.x) < half + e.w * 0.35 && e.y < ship.y) {
          e.hp -= CFG.laser.dps * dt;
          e.flash = 0.07;
          if (Math.random() < dt * 25) burst(e.x + rand(-6, 6), e.y + e.h * 0.4, '#ffe27a', 2, 70);
          if (e.hp <= 0) killEnemy(e);
        }
      }
      for (let i = 0; i < ebul.length; i++) {
        const b = ebul[i];
        if (Math.abs(b.x - ship.x) < half && b.y < ship.y) { b.dead = true; burst(b.x, b.y, '#ffe27a', 3, 60); }
      }
    }
    if (boss && boss.state === 'fight') {
      for (let i = 0; i < pbul.length; i++) {
        const b = pbul[i];
        if (b.dead) continue;
        if (Math.abs(b.x - boss.x) < boss.w * 0.42 && Math.abs(b.y - boss.y) < boss.h * 0.45) {
          b.dead = true; bossHit(1); burst(b.x, b.y, '#ff9af5', 2, 60);
        }
      }
      if (laserOn() && ship.alive && boss && Math.abs(boss.x - ship.x) < CFG.laser.width / 2 + boss.w * 0.3) {
        bossHit(CFG.laser.dps * dt);
        if (Math.random() < dt * 30) burst(ship.x + rand(-10, 10), boss.y + boss.h * 0.45, '#ffe27a', 2, 80);
      }
    }
    enemies = enemies.filter(function (e) { return !e.dead; });
    pbul = pbul.filter(function (b) { return !b.dead && b.y > -12; });

    // blaster beams -> ship (the warning box is harmless)
    if (ship.alive) {
      for (let i = 0; i < blasters.length; i++) {
        const bl = blasters[i];
        if (bl.state === 'fire' && ship.y > bl.y0 && Math.abs(ship.x - bl.x) < bl.w / 2 + sc.hitW / 2 - 1) {
          if (shieldOn()) { if (Math.random() < dt * 30) burst(ship.x + rand(-8, 8), ship.y - 10, '#8ff6ff', 2, 70); }
          else if (ship.inv <= 0) { killShip(); break; }
        }
      }
    }

    // enemy bullets / bodies -> ship
    if (ship.alive) {
      for (let i = 0; i < ebul.length; i++) {
        const b = ebul[i];
        if (b.dead) continue;
        if (shieldOn()) {
          if (Math.hypot(b.x - ship.x, b.y - ship.y) < CFG.shield.radius) {
            b.dead = true;
            sfx('shield');
            burst(b.x, b.y, '#8ff6ff', 5, 70);
          }
        } else if (ship.inv <= 0 && Math.abs(b.x - ship.x) < sc.hitW / 2 + 1.5 && Math.abs(b.y - ship.y) < sc.hitH / 2 + 4) {
          b.dead = true;
          killShip();
          break;
        }
      }
      if (ship.alive) {
        for (let j = 0; j < enemies.length; j++) {
          const e = enemies[j];
          if (e.hidden) continue;
          if (Math.abs(e.x - ship.x) < e.w * 0.4 + sc.hitW / 2 && Math.abs(e.y - ship.y) < e.h * 0.4 + sc.hitH / 2) {
            if (shieldOn()) hitEnemy(e, 60 * dt);
            else if (ship.inv <= 0) { killShip(); break; }
          }
        }
        enemies = enemies.filter(function (e) { return !e.dead; });
      }
    }
    ebul = ebul.filter(function (b) { return !b.dead && b.y < H + 10 && b.y > -40 && b.x > -10 && b.x < W + 10; });
  }

  function updateWaveFlow(dt) {
    if (G.ws === 'boss' || G.ws === 'bossdone') return;
    if (G.ws !== 'clear' && enemies.length === 0) {
      G.ws = 'clear'; G.wt = 0;
      ebul.forEach(function (b) { burst(b.x, b.y, '#ffffff', 2, 40); });
      ebul = [];
      G.banner = { text: 'WAVE CLEAR', color: '#39ff7a', t: 0, dur: 1.8 };
      sfx('clear');
    } else if (G.ws === 'clear') {
      G.wt += dt;
      if (G.wt >= 1.9) {
        if (G.wave >= CFG.waves) startBoss(); else startWave(G.wave + 1);
      }
    }
  }

  function updatePlay(dt) {
    G.ts += ((timeOn() ? CFG.time.scale : 1) - G.ts) * Math.min(1, dt * 12);
    const edt = dt * G.ts;
    if (ship.alive) { updateShip(dt); updatePower(dt); }
    else {
      G.holding = false;
      if (G.respawnT > 0) {
        G.respawnT -= dt;
        if (G.respawnT <= 0) { resetShip(); ship.inv = CFG.ship.invuln; inp.lastMove = G.t; sfx('respawn'); }
      }
      if (G.endT > 0) { G.endT -= dt; if (G.endT <= 0) endGame(false); }
    }
    for (let i = 0; i < pbul.length; i++) pbul[i].y -= CFG.ship.bulletSpeed * dt;
    for (let i = 0; i < ebul.length; i++) { ebul[i].x += ebul[i].vx * edt; ebul[i].y += ebul[i].vy * edt; }
    if (G.ws === 'boss' || G.ws === 'bossdone') updateBoss(edt, dt); else updateEnemies(edt);
    for (let i = 0; i < enemies.length; i++) enemies[i].flash = Math.max(0, enemies[i].flash - dt);
    collisions(dt);
    if (G.mode === 'play') updateWaveFlow(dt);
    if (G.banner) { G.banner.t += dt; if (G.banner.t >= G.banner.dur) G.banner = null; }
  }

  function updateFx(dt) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - dt * 2.2; p.vy *= 1 - dt * 2.2;
    }
    parts = parts.filter(function (p) { return p.life < p.max; });
    for (let i = 0; i < rings.length; i++) { rings[i].life += dt; rings[i].r += rings[i].speed * dt; }
    rings = rings.filter(function (r) { return r.r < r.max; });
    G.shake = Math.max(0, G.shake - dt * 18);
    G.flash = Math.max(0, G.flash - dt);
  }

  let powerAudio = null;
  function syncPower() {
    const a = G.mode === 'play' && P.state === 'active' ? P.type : null;
    if (a !== powerAudio) { powerAudio = a; if (window.SFX) window.SFX.power(a); }
  }

  function update(dt) {
    updateStars(dt * (G.mode === 'play' ? 0.3 + 0.7 * G.ts : 1));
    if (G.mode === 'play') updatePlay(dt);
    updateFx(dt);
    syncPower();
  }

  /* ---------------------------------------------------------------- render */
  function drawImg(c, x, y) { ctx.drawImage(c, Math.round(x - c.width / 2), Math.round(y - c.height / 2)); }

  function pixelRing(cx, cy, r, col, a0, a1, dash) {
    ctx.fillStyle = col;
    const n = Math.ceil((a1 - a0) * r * 1.6);
    let lx = null, ly = null;
    for (let i = 0; i <= n; i++) {
      if (dash && ((i / dash) | 0) % 2) continue;
      const a = a0 + (a1 - a0) * i / n;
      const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
      if (x === lx && y === ly) continue;
      lx = x; ly = y;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  function text(str, x, y, col, size, align, glow) {
    ctx.font = size + 'px "Press Start 2P", monospace';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'top';
    if (glow) { ctx.shadowColor = col; ctx.shadowBlur = glow; }
    ctx.fillStyle = col;
    ctx.fillText(str, Math.round(x), Math.round(y));
    ctx.shadowBlur = 0;
  }

  function drawStars() {
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const a = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(G.t * s.rate + s.ph));
      ctx.globalAlpha = a;
      ctx.fillStyle = s.col;
      const x = Math.round(s.x), y = Math.round(s.y);
      ctx.fillRect(x, y, 1, 1);
      if (s.big && a > 0.6) {
        ctx.globalAlpha = a * 0.6;
        ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1);
        ctx.fillRect(x, y - 1, 1, 1); ctx.fillRect(x, y + 1, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawEnemies() {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.hidden) continue;
      const frame = ((G.t * 2.5 + e.ph * 2) | 0) % 2;
      const spr = S.enemy[e.kind][frame];
      drawImg(spr.c, e.x, e.y);
      if (e.flash > 0) drawImg(spr.flash, e.x, e.y);
      if (e.hp < e.maxHp) {
        const bw = Math.round(e.w * 0.8), bx = Math.round(e.x - bw / 2), by = Math.round(e.y + e.h / 2 + 3);
        ctx.fillStyle = '#10102a'; ctx.fillRect(bx - 1, by - 1, bw + 2, 3);
        ctx.fillStyle = BCOL[KIND[e.kind].col][0];
        ctx.fillRect(bx, by, Math.max(1, Math.round(bw * Math.max(0, e.hp) / e.maxHp)), 1);
      }
    }
  }

  function drawBullets() {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < pbul.length; i++) {
      const b = pbul[i];
      ctx.fillStyle = 'rgba(95,230,255,0.22)';
      ctx.fillRect(Math.round(b.x) - 2, Math.round(b.y) - 7, 5, 14);
    }
    for (let i = 0; i < ebul.length; i++) {
      const b = ebul[i];
      ctx.fillStyle = BCOL[b.col][2];
      if (b.orb) ctx.fillRect(Math.round(b.x) - 4, Math.round(b.y) - 4, 9, 9);
      else ctx.fillRect(Math.round(b.x) - 2, Math.round(b.y) - 6, 5, 12);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < pbul.length; i++) {
      const b = pbul[i], x = Math.round(b.x), y = Math.round(b.y);
      ctx.fillStyle = '#5ce6ff'; ctx.fillRect(x - 1, y - 5, 2, 10);
      ctx.fillStyle = '#e8fdff'; ctx.fillRect(x - 1, y - 5, 1, 10);
    }
    for (let i = 0; i < ebul.length; i++) {
      const b = ebul[i], x = Math.round(b.x), y = Math.round(b.y), c = BCOL[b.col];
      if (b.orb) {
        ctx.fillStyle = c[0]; ctx.fillRect(x - 2, y - 1, 5, 3); ctx.fillRect(x - 1, y - 2, 3, 5);
        ctx.fillStyle = c[1]; ctx.fillRect(x - 1, y - 1, 3, 3);
        continue;
      }
      ctx.fillStyle = c[0]; ctx.fillRect(x - 1, y - 4, 3, 8);
      ctx.fillStyle = c[1]; ctx.fillRect(x, y - 4, 1, 8);
    }
  }

  function drawLaser() {
    const x = Math.round(ship.x), y0 = Math.round(ship.y - SHIP_H), w = CFG.laser.width, k = w / 30;
    const fl = ((G.t * 30) | 0) % 2;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,70,40,0.20)'; ctx.fillRect(x - w / 2 - 5, 0, w + 10, y0);
    ctx.fillStyle = 'rgba(255,138,28,0.55)'; ctx.fillRect(x - w / 2, 0, w, y0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ff9a2e'; ctx.fillRect(Math.round(x - 11 * k) - fl, 0, Math.round(22 * k) + fl * 2, y0);
    ctx.fillStyle = '#ffe27a'; ctx.fillRect(Math.round(x - 7 * k), 0, Math.round(14 * k), y0);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 3, 0, 6, y0);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    const off = (G.t * 260) % 14;
    for (let y = y0 - off; y > 0; y -= 14) ctx.fillRect(Math.round(x - 9 * k), Math.round(y), Math.round(18 * k), 2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x - 9 * k), y0 - 2, Math.round(18 * k), 3);
    ctx.fillStyle = '#ffe27a'; ctx.fillRect(Math.round(x - 5 * k), y0 - 5, Math.round(10 * k), 3);
  }

  function drawBoss() {
    const b = boss;
    if (!b) return;
    const spr = S.boss;
    const jx = b.state === 'dying' ? Math.round(rand(-2, 2)) : 0;
    drawImg(spr.c, b.x + jx, b.y);
    if (b.flash > 0) drawImg(spr.flash, b.x + jx, b.y);
    const col = b.phase === 1 ? '#3ff0ff' : b.phase === 2 ? '#ffd34d' : '#ff4455';
    const pulse = 0.5 + 0.5 * Math.sin(G.t * 6);
    const kk = b.k, ex = Math.round(b.x) + jx, ey = Math.round(b.y - 4 * kk), er = 6.3 * kk;
    ctx.globalAlpha = 0.55 + 0.45 * pulse;
    ctx.fillStyle = col;
    for (let dy = -Math.ceil(er); dy <= Math.ceil(er); dy++) { const half = Math.floor(Math.sqrt(er * er - dy * dy)); if (half > 0) ctx.fillRect(ex - half, ey + dy, half * 2, 1); }
    ctx.fillStyle = '#ffffff';
    const cr = Math.round(2 * kk);
    ctx.fillRect(ex - cr, ey - cr, cr * 2, cr * 2);
    if (b.hatch > 0) {
      ctx.globalAlpha = Math.min(1, b.hatch * 2);
      ctx.fillStyle = '#ff8a1c';
      const hw = Math.round(8 * kk), hh = Math.round(4 * kk), hx = Math.round(25.5 * kk), hy = Math.round(10 * kk);
      ctx.fillRect(Math.round(b.x) - hx - Math.round(hw / 2), Math.round(b.y) - hy, hw, hh);
      ctx.fillRect(Math.round(b.x) + hx - Math.round(hw / 2), Math.round(b.y) - hy, hw, hh);
    }
    ctx.globalAlpha = 1;
  }

  function drawBlasters() {
    const sk = S.blaster.c;
    for (let i = 0; i < blasters.length; i++) {
      const bl = blasters[i], x = Math.round(bl.x), y0 = Math.round(bl.y0), half = bl.w / 2, len = H - y0;
      const tF = bl.inT + bl.warn, tO = tF + bl.fire;
      if (bl.state === 'warn') {
        const on = ((bl.t * 12) | 0) % 2;
        ctx.globalAlpha = on ? 0.32 : 0.12;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - half, y0, bl.w, len);
        ctx.globalAlpha = on ? 0.9 : 0.45;
        ctx.fillRect(x - half, y0, 1, len); ctx.fillRect(x + half - 1, y0, 1, len);
        ctx.fillRect(x - half, H - 2, bl.w, 1);
        ctx.globalAlpha = 1;
      } else if (bl.state === 'fire' || (bl.state === 'out' && bl.t - tO < 0.25)) {
        const k = bl.state === 'fire' ? 1 : Math.max(0, 1 - (bl.t - tO) / 0.25);
        const fl = ((G.t * 30) | 0) % 2;
        ctx.globalAlpha = k;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,61,240,0.35)'; ctx.fillRect(x - half - 5, y0, bl.w + 10, len);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#ff7af0'; ctx.fillRect(x - half + fl, y0, bl.w - fl * 2, len);
        ctx.fillStyle = '#ffd9fb'; ctx.fillRect(x - half + 5, y0, bl.w - 10, len);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 3, y0, 6, len);
        ctx.globalAlpha = 1;
      }

      // skull: spirals in, settles and charges, recoils while firing, spirals away
      const R0 = 140, spin = TAU * 0.8;
      let sx = bl.x, sy = y0 - 14, rot = 0, alpha = 1;
      if (bl.state === 'in') {
        const u = clamp(bl.t / bl.inT, 0, 1), e = 1 - (1 - u) * (1 - u);
        const ang = -Math.PI / 2 + bl.side * (1 - e) * spin, R = R0 * (1 - e);
        sx += Math.cos(ang) * R; sy += Math.sin(ang) * R;
        rot = bl.side * (1 - e) * spin; alpha = Math.min(1, u * 4);
      } else if (bl.state === 'out') {
        const u = clamp((bl.t - tO) / bl.out, 0, 1), e = u * u;
        const ang = -Math.PI / 2 + bl.side * e * spin, R = R0 * e;
        sx += Math.cos(ang) * R; sy += Math.sin(ang) * R;
        rot = -bl.side * e * spin; alpha = 1 - e * e;
      } else if (bl.state === 'fire') {
        sx += rand(-1, 1); sy += rand(-1.5, 0.5);
      } else if (bl.t > tF - 0.35) {
        sx += ((G.t * 45) | 0) % 2 ? 0.8 : -0.8;
      }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(Math.round(sx), Math.round(sy));
      ctx.rotate(rot);
      ctx.drawImage(sk, -Math.round(sk.width / 2), -Math.round(sk.height / 2));
      if (bl.state === 'warn' || bl.state === 'fire') {
        const c = bl.state === 'fire' ? 1 : clamp((bl.t - bl.inT) / bl.warn, 0, 1);
        ctx.globalAlpha = alpha * (0.25 + 0.75 * c);
        ctx.fillStyle = bl.state === 'fire' ? '#ffffff' : '#ff3df0';
        ctx.fillRect(-3, 7, 7, 7);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-1, 9, 3, 4);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  function drawShip() {
    if (!ship.alive) return;
    if (ship.inv > 0 && ((ship.inv * 14) | 0) % 2 === 0) return;
    const x = ship.x, y = ship.y, spr = S.ship;
    const col = POWER[P.type].color;
    const pulse = 0.5 + 0.5 * Math.sin(G.t * 5.5);
    if (P.state === 'ready' || P.state === 'active') {
      ctx.globalAlpha = P.state === 'ready' ? 0.25 + 0.5 * pulse : 0.5;
      drawImg(aura(col), x, y);
      ctx.globalAlpha = 1;
    }
    const fl = 3 + (ship.moving ? 3 : 0) + ((Math.random() * 3) | 0);
    const fx = Math.round(x), fy = Math.round(y) + SHIP_H;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,120,20,0.3)'; ctx.fillRect(fx - 3, fy, 7, fl + 3);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ff7a12'; ctx.fillRect(fx - 1, fy, 3, fl);
    ctx.fillStyle = '#fff2a8'; ctx.fillRect(fx, fy, 1, Math.max(1, fl - 2));
    drawImg(spr.c, x, y);
    if (P.state === 'ready') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 * pulse;
      drawImg(spr.c, x, y);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    if (shieldOn()) {
      const left = P.time, flick = left < 1.5 && ((G.t * 14) | 0) % 2;
      if (!flick) {
        const r = CFG.shield.radius;
        ctx.globalAlpha = 0.14; ctx.fillStyle = '#3ff0ff';
        ctx.beginPath(); ctx.arc(Math.round(x) + 0.5, Math.round(y) + 0.5, r, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        const spin = G.t * 1.5;
        pixelRing(x, y, r, '#8ff6ff', spin, spin + TAU, 5);
        pixelRing(x, y, r - 1, '#3ff0ff', 0, TAU, 0);
      }
    }
    if (timeOn()) {
      const r = 14 + ((G.t * 30) % 12);
      ctx.globalAlpha = 0.5;
      pixelRing(x, y, r, '#ff9af5', 0, TAU, 3);
      ctx.globalAlpha = 1;
    }
    if (P.hold > 0) {
      pixelRing(x, y, 22, 'rgba(255,255,255,0.22)', 0, TAU, 0);
      pixelRing(x, y, 22, '#ffffff', -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, P.hold / CFG.hold.time), 0);
      pixelRing(x, y, 23, col, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, P.hold / CFG.hold.time), 0);
    }
  }

  function drawFx() {
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      ctx.globalAlpha = Math.max(0, 1 - r.r / r.max);
      pixelRing(r.x, r.y, r.r, r.col, 0, TAU, 0);
    }
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.fillStyle = p.col;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawBar() {
    const bx = W - 16, bh = 102, n = 25, by = H - 124 - SAFE.bottom;
    const col = POWER[P.type].color;
    const ready = P.state === 'ready';
    const pulse = 0.5 + 0.5 * Math.sin(G.t * 5.5);
    const icon = S.icon[P.type];
    ctx.drawImage(icon, bx + Math.round((10 - icon.width) / 2), by - 15);
    ctx.globalAlpha = ready ? 0.5 + 0.5 * pulse : 0.7;
    ctx.fillStyle = ready && pulse > 0.5 ? '#ffffff' : col;
    ctx.fillRect(bx, by, 10, 1); ctx.fillRect(bx, by + bh - 1, 10, 1);
    ctx.fillRect(bx, by, 1, bh); ctx.fillRect(bx + 9, by, 1, bh);
    ctx.globalAlpha = 1;
    const filled = Math.ceil(P.charge / 100 * n - 1e-6);
    for (let i = 0; i < n; i++) {
      const y = by + 1 + (n - 1 - i) * 4;
      if (i < filled) {
        ctx.fillStyle = ready ? (pulse > 0.5 ? '#ffffff' : col) : col;
        ctx.globalAlpha = ready ? 0.7 + 0.3 * pulse : 1;
      } else {
        ctx.fillStyle = '#1b1747';
        ctx.globalAlpha = 0.9;
      }
      ctx.fillRect(bx + 2, y, 6, 3);
    }
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    const ty = 8 + SAFE.top;
    text('SCORE', 8, ty, '#6f86b8', 8);
    text(String(G.score).padStart(6, '0'), 8, ty + 11, '#ffffff', 8);
    text(G.wave > CFG.waves ? 'FINAL' : 'WAVE', W / 2, ty, '#6f86b8', 8, 'center');
    text(G.wave > CFG.waves ? 'BOSS' : G.wave + '/' + CFG.waves, W / 2, ty + 11, G.wave > CFG.waves ? '#ff4455' : '#ffffff', 8, 'center');
    for (let i = 0; i < CFG.lives; i++) {
      ctx.globalAlpha = i < G.lives ? 1 : 0.18;
      ctx.drawImage(S.life.c, W - 8 - (CFG.lives - i) * 13 + 2, ty);
    }
    ctx.globalAlpha = 1;
    if (boss && boss.state !== 'enter') {
      const bx = 44, bw = W - 56, by = ty + 25, frac = Math.max(0, boss.hp / boss.maxHp);
      text('BOSS', 6, by - 1, '#ff4455', 8);
      ctx.fillStyle = '#0b0620'; ctx.fillRect(bx - 1, by - 1, bw + 2, 8);
      ctx.fillStyle = boss.phase === 1 ? '#ff3df0' : boss.phase === 2 ? '#ffd34d' : '#ff4455';
      ctx.fillRect(bx, by, Math.round(bw * frac), 6);
      ctx.fillStyle = '#0b0620';
      ctx.fillRect(bx + Math.round(bw * 0.33), by, 1, 6); ctx.fillRect(bx + Math.round(bw * 0.66), by, 1, 6);
      if (boss.flash > 0) { ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.5; ctx.fillRect(bx, by, Math.round(bw * frac), 6); ctx.globalAlpha = 1; }
    }
    drawBar();
    if (P.state === 'ready' && ship.alive) {
      const blink = ((G.t * 3) | 0) % 2 === 0, hy = H - 16 - SAFE.bottom;
      if (P.hold > 0.15) text('HOLD...', W / 2, hy, '#ffffff', 8, 'center', 4);
      else if (blink) text('HOLD STILL', W / 2, hy, POWER[P.type].color, 8, 'center', 4);
    }
  }

  function drawBanner() {
    const b = G.banner;
    if (!b) return;
    const k = b.t / b.dur;
    ctx.globalAlpha = (k < 0.15 ? k / 0.15 : k > 0.78 ? Math.max(0, (1 - k) / 0.22) : 1) * (b.flicker && ((G.t * 6) | 0) % 2 ? 0.35 : 1);
    text(b.text, W / 2, Math.round(H * 0.36), b.color, 16, 'center', 8);
    ctx.globalAlpha = 1;
  }

  // Time-stop: pull the picture inward like looking through a lens (rows narrow toward the top/bottom, columns toward the sides)
  function warpAmount() { return clamp((1 - G.ts) / 0.7, 0, 1) * 0.05 * (1 + 0.15 * Math.sin(G.t * 3)); }

  function applyWarp(a) {
    const cx = W / 2, cy = H / 2;
    tctx.clearRect(0, 0, W, H);
    for (let y = 0; y < H; y++) {
      const d = (y + 0.5 - cy) / cy, sc = 1 - a * d * d;
      tctx.drawImage(scene, 0, y, W, 1, cx - W * sc / 2, y, W * sc, 1);
    }
    mainCtx.setTransform(1, 0, 0, 1, 0, 0);
    mainCtx.drawImage(bg, 0, 0);
    for (let x = 0; x < W; x++) {
      const d = (x + 0.5 - cx) / cx, sc = 1 - a * d * d;
      mainCtx.drawImage(warpTmp, x, 0, 1, H, x, cy - H * sc / 2, 1, H * sc);
    }
  }

  function render() {
    const warp = G.mode === 'play' ? warpAmount() : 0;
    ctx = warp > 0.004 ? sctx : mainCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    drawStars();
    if (G.mode === 'lobby') return;

    ctx.save();
    if (G.shake > 0.3) ctx.translate(Math.round(rand(-1, 1) * G.shake), Math.round(rand(-1, 1) * G.shake));
    drawBoss();
    drawBlasters();
    drawEnemies();
    if (laserOn() && ship.alive) drawLaser();
    drawBullets();
    drawShip();
    drawFx();
    ctx.restore();

    if (timeOn() || G.ts < 0.98) {
      const k = 1 - G.ts;
      ctx.globalAlpha = 0.2 * k;
      ctx.fillStyle = '#5a2dff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.07 * k;
      ctx.fillStyle = '#ffffff';
      const off = Math.floor(G.t * 20) % 6;
      for (let y = off; y < H; y += 6) ctx.fillRect(0, y, W, 1);
      ctx.globalAlpha = 0.5 * k;
      ctx.strokeStyle = '#ff3df0'; ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, W - 2, H - 2);
      ctx.globalAlpha = 1;
    }
    if (P.state === 'ready' && G.mode === 'play') {
      const pulse = 0.5 + 0.5 * Math.sin(G.t * 5.5);
      ctx.globalAlpha = 0.03 + 0.09 * pulse;
      ctx.fillStyle = POWER[P.type].color;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.25 + 0.6 * pulse;
      ctx.strokeStyle = POWER[P.type].color;
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, W - 2, H - 2);
      ctx.globalAlpha = 1;
    }
    if (G.flash > 0) { ctx.globalAlpha = G.flash * 1.2; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    drawHud();
    drawBanner();
    if (ctx === sctx) { ctx = mainCtx; applyWarp(warp); }
  }

  /* ------------------------------------------------------------------- ui */
  const ui = {
    lobby: document.getElementById('lobby'),
    end: document.getElementById('end'),
    endTitle: document.getElementById('endTitle'),
    endStats: document.getElementById('endStats'),
  };

  function drawIcons() {
    document.querySelectorAll('.icon').forEach(function (cv) {
      const src = S.icon[cv.dataset.icon];
      cv.width = src.width; cv.height = src.height;
      cv.getContext('2d').drawImage(src, 0, 0);
      cv.style.setProperty('--w', src.width);
    });
  }

  function selectPower(type) {
    P.type = type;
    document.querySelectorAll('.card').forEach(function (c) { c.classList.toggle('sel', c.dataset.power === type); });
    try { localStorage.setItem('neon.power', type); } catch (_) {}
  }

  document.querySelectorAll('.card').forEach(function (c) {
    c.addEventListener('click', function () { sfx('click'); selectPower(c.dataset.power); });
  });
  document.getElementById('startBtn').addEventListener('click', startGame);
  document.getElementById('retryBtn').addEventListener('click', startGame);
  document.getElementById('lobbyBtn').addEventListener('click', function () {
    sfx('click');
    music('lobby');
    G.mode = 'lobby';
    ui.end.classList.add('hidden');
    ui.lobby.classList.remove('hidden');
  });

  document.querySelectorAll('.sndBtn').forEach(function (b) {
    b.addEventListener('click', function () { window.SFX.setMuted(!window.SFX.isMuted()); sfx('click'); });
  });
  window.SFX.setMuted(window.SFX.isMuted());
  document.querySelectorAll('.musBtn').forEach(function (b) {
    b.addEventListener('click', function () { window.MUSIC.setEnabled(!window.MUSIC.isEnabled()); sfx('click'); });
  });
  music('lobby');
  drawIcons();
  selectPower(P.type);

  /* ----------------------------------------------------------------- loop */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    G.t += dt;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.invaders = { G: G, ship: ship, P: P, CFG: CFG, KIND: KIND, startGame: startGame, startWave: startWave, endGame: endGame,
                      zone: zone, layout: layout,
                      step: function (dt) { G.t += dt; update(dt); },
                      render: render,
                      get W() { return W; }, get H() { return H; },
                      startBoss: startBoss,
                      get boss() { return boss; }, get blasters() { return blasters; },
                      get enemies() { return enemies; }, get ebul() { return ebul; } };
})();
