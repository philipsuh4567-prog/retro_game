(function () {
  'use strict';

  const W = 270, H = 480, TAU = Math.PI * 2;
  const S = window.Sprites;

  /* ------------------------------------------------------------------ tuning */
  const CFG = {
    lives: 3,
    waves: 15,
    ship: {
      top: Math.round(H * 0.6), bottom: H - 26, margin: 12,
      maxSpeed: 190,        // px/s cap: stops ultra-fast dodging
      smooth: 9,            // higher = snappier follow, lower = more lag
      moveThreshold: 14,    // px/s: ship counts as "moving" (and fires) above this
      fireInterval: 0.115, bulletSpeed: 430,
      hitW: 9, hitH: 12,
      respawnDelay: 1.2, invuln: 2.4, keySpeed: 210,
    },
    hold: { time: 2.0, still: 0.12, moveDist: 2.5 },
    charge: { base: 4, perTier: 2 },
    shield: { duration: 6, radius: 18 },
    laser: { duration: 3, dps: 22, width: 30 },
    enemy: {
      enterTime: 1.1, stagger: 0.06, formationHold: 0.8, rampTime: 1.0,
      hpPerWave: 0.6,       // extra hp every wave on top of the tier's base hp
      spacingX: 40, spacingY: 32, topY: 64, driftSpeed: 0.8, driftMax: 60,
    },
    fire: { base: 0.55, perWave: 0.11, speedBase: 95, speedPerWave: 5 },
  };

  const TIER = [null,
    { hp: 1, score: 100, shots: 1, color: 'green' },
    { hp: 2, score: 200, shots: 1, color: 'green' },
    { hp: 3, score: 350, shots: 2, color: 'purple' },
    { hp: 4, score: 500, shots: 2, color: 'purple', fast: 1.25 },
    { hp: 5, score: 800, shots: 3, color: 'purple' },
  ];

  // one string per row (top first), one digit per enemy = its tier
  const WAVES = [
    ['1111', '1111'],
    ['11111', '11111'],
    ['222', '11111', '1111'],
    ['2222', '22222', '1111'],
    ['222222', '22222', '11111'],
    ['33', '222222', '22222', '111'],
    ['333', '22222', '222222', '11111'],
    ['3333', '333222', '22222'],
    ['4', '3333', '333333', '22222'],
    ['44', '33333', '333333', '2222'],
    ['444', '44333', '333333', '22222'],
    ['55', '4444', '444433', '33333'],
    ['555', '44444', '444444', '33333'],
    ['5555', '444444', '444444', '33333'],
    ['55555', '555444', '444444', '44444'],
  ];

  const POWER = {
    shield: { color: '#3ff0ff', name: 'SHIELD' },
    laser: { color: '#ff8a1c', name: 'LASER' },
  };
  const ENEMY_COL = { green: ['#25d558', '#a8ffc2', '#7dff3a'], purple: ['#a24dff', '#e4b8ff', '#ff4de0'] };

  const rand = function (a, b) { return a + Math.random() * (b - a); };
  const clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  /* ------------------------------------------------------------------ canvas */
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  function fit() {
    const dpr = window.devicePixelRatio || 1;
    let s = Math.min(window.innerWidth * dpr / W, window.innerHeight * dpr / H);
    const whole = Math.floor(s);          // whole device pixels per art pixel = crispest,
    if (whole >= 2 && whole / s >= 0.88) s = whole;   // but only if it doesn't waste much screen
    document.documentElement.style.setProperty('--u', (s / dpr) + 'px');
  }
  window.addEventListener('resize', fit);
  fit();

  /* -------------------------------------------------------------- background */
  const bg = (function () {
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
  })();

  const STAR_COLORS = ['#ffffff', '#9fd8ff', '#ffb8f2', '#b9ffb0', '#ffe9a8'];
  const stars = [];
  for (let i = 0; i < 100; i++) {
    const layer = i % 3;
    stars.push({
      x: Math.random() * W, y: Math.random() * H,
      v: [7, 16, 30][layer],
      big: layer === 2 && Math.random() < 0.2,
      ph: Math.random() * TAU, rate: rand(1.5, 5),
      col: STAR_COLORS[(Math.random() * STAR_COLORS.length) | 0],
    });
  }

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

  /* ------------------------------------------------------------------- state */
  const G = {
    mode: 'lobby',       // lobby | play | over | win
    t: 0, wave: 1, score: 0, lives: CFG.lives,
    ws: 'enter',         // wave state: enter | fight | clear
    wt: 0, formT: 0, fightT: 0, fireT: 1,
    banner: null, shake: 0, flash: 0,
    respawnT: 0, endT: 0, holding: false,
  };
  const ship = { x: W / 2, y: CFG.ship.bottom - 14, tx: W / 2, ty: CFG.ship.bottom - 14, vx: 0, vy: 0, speed: 0,
                 alive: true, inv: 0, fireCd: 0, moving: false };
  const P = { type: 'shield', charge: 0, state: 'charge', hold: 0, time: 0, dur: 1 };
  let enemies = [], pbul = [], ebul = [], parts = [], rings = [];

  try { const sv = localStorage.getItem('neon.power'); if (sv === 'shield' || sv === 'laser') P.type = sv; } catch (_) {}

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
    const kx = W / r.width, ky = H / r.height;
    ship.tx = clamp(ship.tx + (e.clientX - inp.lx) * kx, CFG.ship.margin, W - CFG.ship.margin);
    ship.ty = clamp(ship.ty + (e.clientY - inp.ly) * ky, CFG.ship.top, CFG.ship.bottom);
    inp.lx = e.clientX; inp.ly = e.clientY;
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

  /* ------------------------------------------------------------- game flow */
  function resetShip() {
    ship.x = ship.tx = W / 2;
    ship.y = ship.ty = CFG.ship.bottom - 14;
    ship.vx = ship.vy = ship.speed = 0;
    ship.alive = true; ship.inv = 0; ship.fireCd = 0;
  }

  function startGame() {
    const q = new URLSearchParams(location.search);
    const w0 = parseInt(q.get('wave'), 10);
    G.mode = 'play'; G.t = 0;
    G.score = 0; G.lives = CFG.lives; G.shake = 0; G.flash = 0; G.respawnT = 0; G.endT = 0;
    enemies = []; pbul = []; ebul = []; parts = []; rings = [];
    P.charge = 0; P.state = 'charge'; P.hold = 0;
    inp.down = false; inp.keys = Object.create(null); inp.lastMove = -9;
    resetShip();
    ui.lobby.classList.add('hidden');
    ui.end.classList.add('hidden');
    startWave(w0 >= 1 && w0 <= CFG.waves ? w0 : 1);
  }

  function startWave(n) {
    G.wave = n; G.ws = 'enter'; G.wt = 0; G.formT = 0; G.fightT = 0; G.fireT = 1.2;
    G.banner = { text: 'WAVE ' + n, color: '#3ff0ff', t: 0, dur: 1.9 };
    const E = CFG.enemy;
    enemies = [];
    let idx = 0;
    WAVES[n - 1].forEach(function (row, ri) {
      const x0 = W / 2 - (row.length - 1) * E.spacingX / 2;
      for (let i = 0; i < row.length; i++) {
        const tier = +row[i];
        const spr = S.enemy[tier][0];
        const hp = TIER[tier].hp + Math.floor((n - 1) * E.hpPerWave);
        enemies.push({
          tier: tier, hp: hp, maxHp: hp, w: spr.w, h: spr.h,
          ax: x0 + i * E.spacingX, ay: E.topY + ri * E.spacingY,
          x: x0 + i * E.spacingX, y: -30,
          state: 'enter', t: 0, delay: idx * E.stagger,
          swoop: (idx % 2 ? -1 : 1) * rand(30, 70),
          r: rand(6, 12), w2: (Math.random() < 0.5 ? -1 : 1) * rand(0.7, 1.8) * (1 + n * 0.035),
          th: rand(0, TAU), ramp: 0, flash: 0, ph: Math.random(),
        });
        idx++;
      }
    });
  }

  function endGame(win) {
    G.mode = win ? 'win' : 'over';
    ui.endTitle.textContent = win ? 'VICTORY' : 'GAME OVER';
    ui.endTitle.className = win ? 'win' : 'lose';
    ui.endStats.innerHTML = (win ? 'ALL 15 WAVES CLEARED' : 'REACHED WAVE ' + G.wave + ' / ' + CFG.waves) +
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
    if (P.charge >= 100) { P.state = 'ready'; P.hold = 0; }
  }

  function activatePower() {
    P.state = 'active'; P.dur = CFG[P.type].duration; P.time = P.dur; P.hold = 0;
    G.flash = 0.45; G.shake = 4;
    ring(ship.x, ship.y, POWER[P.type].color, 220, 90);
    burst(ship.x, ship.y, POWER[P.type].color, 18, 120);
  }

  function endPower() { P.state = 'charge'; P.charge = 0; P.hold = 0; }

  const laserOn = function () { return P.state === 'active' && P.type === 'laser'; };
  const shieldOn = function () { return P.state === 'active' && P.type === 'shield'; };

  /* ---------------------------------------------------------------- combat */
  function killEnemy(e) {
    e.dead = true;
    const spec = TIER[e.tier];
    G.score += spec.score;
    addCharge(CFG.charge.base + CFG.charge.perTier * e.tier);
    const c = ENEMY_COL[spec.color];
    burst(e.x, e.y, c[0], 14, 110);
    burst(e.x, e.y, c[1], 8, 80);
    burst(e.x, e.y, '#ffffff', 4, 60);
    ring(e.x, e.y, c[1], 110, 22);
  }

  function hitEnemy(e, dmg) {
    e.hp -= dmg;
    e.flash = 0.07;
    if (e.hp <= 0 && !e.dead) killEnemy(e);
  }

  function killShip() {
    ship.alive = false;
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
    const spec = TIER[e.tier];
    const speed = (CFG.fire.speedBase + CFG.fire.speedPerWave * G.wave) * (spec.fast || 1);
    const col = spec.color;
    const make = function (dx, ang) {
      ebul.push({ x: e.x + dx, y: e.y + e.h / 2, vx: Math.sin(ang) * speed, vy: Math.cos(ang) * speed, col: col });
    };
    if (spec.shots === 1) make(0, 0);
    else if (spec.shots === 2) { make(-4, 0); make(4, 0); }
    else { make(0, -0.2); make(0, 0); make(0, 0.2); }
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
    const sc = CFG.ship, k = inp.keys;
    const kx = (k.r ? 1 : 0) - (k.l ? 1 : 0), ky = (k.d ? 1 : 0) - (k.u ? 1 : 0);
    if (kx || ky) {
      ship.tx = clamp(ship.tx + kx * sc.keySpeed * dt, sc.margin, W - sc.margin);
      ship.ty = clamp(ship.ty + ky * sc.keySpeed * dt, sc.top, sc.bottom);
    }
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

  function updateEnemies(dt) {
    const E = CFG.enemy;
    let allIn = true;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      e.flash = Math.max(0, e.flash - dt);
      if (e.state === 'enter') {
        e.t += dt;
        const p = clamp((e.t - e.delay) / E.enterTime, 0, 1), k = 1 - Math.pow(1 - p, 3);
        e.x = e.ax + (1 - k) * e.swoop;
        e.y = -24 + (e.ay + 24) * k;
        if (p >= 1) e.state = 'hold'; else allIn = false;
      }
    }
    if (G.ws === 'enter' && allIn && enemies.length) {
      G.formT += dt;
      if (G.formT >= E.formationHold) {
        G.ws = 'fight';
        enemies.forEach(function (e) { e.state = 'free'; });
      }
    }
    if (G.ws === 'fight') {
      G.fightT += dt;
      const drift = Math.min(E.driftMax, E.driftSpeed * G.fightT);
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        e.th += e.w2 * dt;
        e.ramp = Math.min(1, e.ramp + dt / E.rampTime);
        const k = e.ramp * e.ramp * (3 - 2 * e.ramp);
        e.x = e.ax + Math.cos(e.th) * e.r * k;
        e.y = e.ay + drift + Math.sin(e.th) * e.r * k;
      }
      G.fireT -= dt;
      if (G.fireT <= 0 && enemies.length) {
        enemyShoot(enemies[(Math.random() * enemies.length) | 0]);
        const rate = CFG.fire.base + CFG.fire.perWave * G.wave;
        G.fireT = (1 / rate) * rand(0.6, 1.4);
      }
    }
  }

  function collisions(dt) {
    const sc = CFG.ship;
    // player bullets -> enemies
    for (let i = 0; i < pbul.length; i++) {
      const b = pbul[i];
      for (let j = 0; j < enemies.length; j++) {
        const e = enemies[j];
        if (e.dead) continue;
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
        if (e.dead) continue;
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
    enemies = enemies.filter(function (e) { return !e.dead; });
    pbul = pbul.filter(function (b) { return !b.dead && b.y > -12; });

    // enemy bullets / bodies -> ship
    if (ship.alive) {
      for (let i = 0; i < ebul.length; i++) {
        const b = ebul[i];
        if (b.dead) continue;
        if (shieldOn()) {
          if (Math.hypot(b.x - ship.x, b.y - ship.y) < CFG.shield.radius) {
            b.dead = true;
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
          if (Math.abs(e.x - ship.x) < e.w * 0.4 + sc.hitW / 2 && Math.abs(e.y - ship.y) < e.h * 0.4 + sc.hitH / 2) {
            if (shieldOn()) { hitEnemy(e, 3 * dt * 20); }
            else if (ship.inv <= 0) { killShip(); break; }
          }
        }
        enemies = enemies.filter(function (e) { return !e.dead; });
      }
    }
    ebul = ebul.filter(function (b) { return !b.dead && b.y < H + 10 && b.x > -10 && b.x < W + 10; });
  }

  function updateWaveFlow(dt) {
    if (G.ws !== 'clear' && enemies.length === 0) {
      G.ws = 'clear'; G.wt = 0;
      ebul.forEach(function (b) { burst(b.x, b.y, '#ffffff', 2, 40); });
      ebul = [];
      G.banner = { text: 'WAVE CLEAR', color: '#39ff7a', t: 0, dur: 1.8 };
    } else if (G.ws === 'clear') {
      G.wt += dt;
      if (G.wt >= 1.9) {
        if (G.wave >= CFG.waves) endGame(true); else startWave(G.wave + 1);
      }
    }
  }

  function updatePlay(dt) {
    if (ship.alive) { updateShip(dt); updatePower(dt); }
    else {
      G.holding = false;
      if (G.respawnT > 0) {
        G.respawnT -= dt;
        if (G.respawnT <= 0) { resetShip(); ship.inv = CFG.ship.invuln; inp.lastMove = G.t; }
      }
      if (G.endT > 0) { G.endT -= dt; if (G.endT <= 0) endGame(false); }
    }
    for (let i = 0; i < pbul.length; i++) pbul[i].y -= CFG.ship.bulletSpeed * dt;
    for (let i = 0; i < ebul.length; i++) { ebul[i].x += ebul[i].vx * dt; ebul[i].y += ebul[i].vy * dt; }
    updateEnemies(dt);
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

  function update(dt) {
    updateStars(dt);
    if (G.mode === 'play') updatePlay(dt);
    updateFx(dt);
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
      const frame = ((G.t * 2.5 + e.ph * 2) | 0) % 2;
      const spr = S.enemy[e.tier][frame];
      drawImg(spr.c, e.x, e.y);
      if (e.flash > 0) drawImg(spr.flash, e.x, e.y);
      if (e.hp < e.maxHp) {
        const bw = Math.round(e.w * 0.8), bx = Math.round(e.x - bw / 2), by = Math.round(e.y + e.h / 2 + 3);
        ctx.fillStyle = '#10102a'; ctx.fillRect(bx - 1, by - 1, bw + 2, 3);
        ctx.fillStyle = TIER[e.tier].color === 'green' ? '#7dff3a' : '#ff4de0';
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
      ctx.fillStyle = b.col === 'green' ? 'rgba(125,255,58,0.22)' : 'rgba(255,77,224,0.24)';
      ctx.fillRect(Math.round(b.x) - 2, Math.round(b.y) - 6, 5, 12);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < pbul.length; i++) {
      const b = pbul[i], x = Math.round(b.x), y = Math.round(b.y);
      ctx.fillStyle = '#5ce6ff'; ctx.fillRect(x - 1, y - 5, 2, 10);
      ctx.fillStyle = '#e8fdff'; ctx.fillRect(x - 1, y - 5, 1, 10);
    }
    for (let i = 0; i < ebul.length; i++) {
      const b = ebul[i], x = Math.round(b.x), y = Math.round(b.y);
      const c = b.col === 'green' ? ['#7dff3a', '#e4ffd0'] : ['#ff4de0', '#ffe0fa'];
      ctx.fillStyle = c[0]; ctx.fillRect(x - 1, y - 4, 3, 8);
      ctx.fillStyle = c[1]; ctx.fillRect(x, y - 4, 1, 8);
    }
  }

  function drawLaser() {
    const x = Math.round(ship.x), y0 = Math.round(ship.y - 12), w = CFG.laser.width;
    const fl = ((G.t * 30) | 0) % 2;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,70,40,0.20)'; ctx.fillRect(x - w / 2 - 5, 0, w + 10, y0);
    ctx.fillStyle = 'rgba(255,138,28,0.55)'; ctx.fillRect(x - w / 2, 0, w, y0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ff9a2e'; ctx.fillRect(x - 11 - fl, 0, 22 + fl * 2, y0);
    ctx.fillStyle = '#ffe27a'; ctx.fillRect(x - 7, 0, 14, y0);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 2, 0, 4, y0);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    const off = (G.t * 260) % 14;
    for (let y = y0 - off; y > 0; y -= 14) ctx.fillRect(x - 9, Math.round(y), 18, 2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 9, y0 - 2, 18, 3);
    ctx.fillStyle = '#ffe27a'; ctx.fillRect(x - 5, y0 - 5, 10, 3);
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
    const fx = Math.round(x), fy = Math.round(y) + 12;
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
    const bx = W - 16, by = H - 124, bh = 102, n = 25;
    const col = POWER[P.type].color;
    const ready = P.state === 'ready';
    const pulse = 0.5 + 0.5 * Math.sin(G.t * 5.5);
    ctx.drawImage(S.icon[P.type], bx + (P.type === 'laser' ? 0 : 0), by - 15);
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
    text('SCORE', 8, 8, '#6f86b8', 8);
    text(String(G.score).padStart(6, '0'), 8, 19, '#ffffff', 8);
    text('WAVE', W / 2, 8, '#6f86b8', 8, 'center');
    text(G.wave + '/' + CFG.waves, W / 2, 19, '#ffffff', 8, 'center');
    for (let i = 0; i < CFG.lives; i++) {
      ctx.globalAlpha = i < G.lives ? 1 : 0.18;
      ctx.drawImage(S.life.c, W - 8 - (CFG.lives - i) * 13 + 2, 8);
    }
    ctx.globalAlpha = 1;
    drawBar();
    if (P.state === 'ready' && ship.alive) {
      const blink = ((G.t * 3) | 0) % 2 === 0;
      if (P.hold > 0.15) text('HOLD...', W / 2, H - 16, '#ffffff', 8, 'center', 4);
      else if (blink) text('HOLD STILL', W / 2, H - 16, POWER[P.type].color, 8, 'center', 4);
    }
  }

  function drawBanner() {
    const b = G.banner;
    if (!b) return;
    const k = b.t / b.dur;
    ctx.globalAlpha = k < 0.15 ? k / 0.15 : k > 0.78 ? Math.max(0, (1 - k) / 0.22) : 1;
    text(b.text, W / 2, Math.round(H * 0.36), b.color, 16, 'center', 8);
    ctx.globalAlpha = 1;
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    drawStars();
    if (G.mode === 'lobby') return;

    ctx.save();
    if (G.shake > 0.3) ctx.translate(Math.round(rand(-1, 1) * G.shake), Math.round(rand(-1, 1) * G.shake));
    drawEnemies();
    if (laserOn() && ship.alive) drawLaser();
    drawBullets();
    drawShip();
    drawFx();
    ctx.restore();

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
    c.addEventListener('click', function () { selectPower(c.dataset.power); });
  });
  document.getElementById('startBtn').addEventListener('click', startGame);
  document.getElementById('retryBtn').addEventListener('click', startGame);
  document.getElementById('lobbyBtn').addEventListener('click', function () {
    G.mode = 'lobby';
    ui.end.classList.add('hidden');
    ui.lobby.classList.remove('hidden');
  });

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

  window.invaders = { G: G, ship: ship, P: P, CFG: CFG, startGame: startGame, startWave: startWave, endGame: endGame,
                      get enemies() { return enemies; }, get ebul() { return ebul; } };
})();
