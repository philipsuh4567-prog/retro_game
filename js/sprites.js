/* Pixel-art sprite data + pre-rendering. Each row is centred, '.' is transparent. */
(function () {
  'use strict';

  const PAL = {
    ship:   { d: '#0b1a55', b: '#1d4fe0', B: '#3d8bff', L: '#aef5ff', K: '#5ce6ff', W: '#ffffff', O: '#ff8a1c', o: '#b94a06', Y: '#ffd34d' },
    green:  { g: '#0b4f22', G: '#25d558', H: '#a8ffc2', D: '#b8f7ff', W: '#ffffff', 1: '#ffe94d', 2: '#ff55d6' },
    purple: { g: '#2a0b5c', G: '#a24dff', H: '#e4b8ff', D: '#ffd9f7', W: '#ffffff', 1: '#45ff96', 2: '#ff55d6', e: '#0b4f22', E: '#25d558', F: '#a8ffc2' },
    // green + purple families side by side (g/G/H green, p/P/Q purple)
    mix:    { g: '#0b4f22', G: '#25d558', H: '#a8ffc2', p: '#2a0b5c', P: '#a24dff', Q: '#e4b8ff', D: '#b8f7ff', W: '#ffffff',
              1: '#ffe94d', 2: '#ff55d6', e: '#0b4f22', E: '#25d558', F: '#a8ffc2' },
    shield: { c: '#1aa0ff', C: '#8ff6ff', W: '#ffffff' },
    laser:  { O: '#ff8a1c', Y: '#ffe27a', W: '#ffffff', d: '#0b1a55', B: '#3d8bff' },
    time:   { M: '#ff3df0', C: '#ffc2f8' },
  };

  // half + its mirror image (the last char of `half` is the centre column)
  const mirror = function (half) { return half + half.slice(0, -1).split('').reverse().join(''); };

  // left half incl. centre column (10 wide); mirrored into a 19-wide jet
  const SHIP_HALF = [
    '.........L',
    '.........L',
    '........LB',
    '........BB',
    '.......dKK',
    '.......dKW',
    '.......dBK',
    '.......dBB',
    '......dbBB',
    '.....dLbBO',
    '.....dLbBO',
    '....dLBbBO',
    '...dLBBbBO',
    '...dLBBbBO',
    '..dLBBBbBO',
    '.dLBBBBbBO',
    '.dOBBBBbBO',
    'dOOBBBBbBO',
    'dOOBBBBbBO',
    'dddddddbBO',
    '......dbBB',
    '......dOBB',
    '.......dBO',
    '.......dOY',
  ];
  const SHIP = SHIP_HALF.map(mirror);

  const LIFE = [
    '....B....',
    '....B....',
    '...dBd...',
    '..dBBBd..',
    '.dBBOBBd.',
    'dOBBOBBOd',
    'dO.dBd.Od',
    '...dOd...',
  ];

  // ---- enemy kinds, weakest (1) to strongest (10) -------------------------
  const K1 = [
    'ggggg',
    'gDDDDDg',
    'gDWDDDDDg',
    'gGGGGGGGGGg',
    'gHGGGGGGGGGHg',
    'gG1GGG2GGG1Gg',
    'ggGGGGGGGgg',
    'gggGGGggg',
    'ggHgg',
  ];

  const K2 = [
    'ggHHHgg',
    'gDDDDDDDg',
    'gDWDDDDDDDg',
    'ggGGGGGGGGGgg',
    'gHHGGGGGGGGGHHg',
    'gG1GGG2G2GGG1Gg',
    'gggGGGGGGGGGggg',
    'ggggGGGGGGGgggg',
    'gg.gggHggg.gg',
    'g....ggg....g',
  ];

  // twin-dome green saucer with purple pods
  const K3 = [
    'ggggg...ggggg',
    'gDDDg...gDDDg',
    'gDWDg...gDDDg',
    'ggGGGGGGGGGGGgg',
    'gHHGGGGGGGGGHHg',
    'gG1GGGG2GGGG1Gg',
    'gpPGGGGGGGGGPpg',
    '.gpPGGGGGGGPpg.',
    '...gggGGGggg...',
    '......ggg......',
  ];

  const K4 = [
    'g.......g',
    'gg.ggggg.gg',
    '.ggDDDDDgg.',
    '..gDWDDDDDg..',
    'ggGGGGGGGGGGGgg',
    'gHHHGGGGGGGGGHHHg',
    'gG1GGG2GGG2GGG1Gg',
    'ggGGGGGGGGGGGGGgg',
    '.ggggGGGGGGGgggg.',
    '...gggHHHHHggg...',
    '.....ggggggg.....',
  ];

  const K5 = [
    'ggggggg',
    'gDDDDDDDg',
    'gDWDDDDDDDg',
    'gDDDDDDDDDDDg',
    'g.ggGGGGGGGGGgg.g',
    'gHHHGGGGGGGGGGGHHHg',
    'gG1GGG2GG2GG2GGG1Gg',
    'ggGGGGGGGGGGGGGGGgg',
    '..ggGGGGGGGGGGGgg..',
    'g.g.gggHHHHHggg.g.g',
    'g...ggggggggggg...g',
    'g.......ggg.......g',
  ];

  // wide purple fighter-saucer
  const K6 = [
    'ggggg',
    'gDDDDDg',
    'gDWDDDDDg',
    'ggGGGGGGGgg',
    'gHHGGGGGGGGGHHg',
    'gHGGGGGGGGGGGGGGGGGHg',
    'gG1GGGG2GGGGG2GGGG1Gg',
    'gg.ggGGGGGGGGGGGgg.gg',
    'g....ggggGGGgggg....g',
    'g.......ggHgg.......g',
  ];

  const K7 = [
    'eeeeeee',
    'eFEEEEEFe',
    'eFWEEEEEEEe',
    'eEEEEEEEEEEEe',
    'eeEEEEEEEEEEEee',
    'ggggHHHHHHHHHHHgggg',
    'gHHHGGGGGGGGGGGGGGGHHHg',
    'gG1GG2GG1GG2GG1GG2GG1Gg',
    'gggGGGGGGGGGGGGGGGGGggg',
    '.gggGGGGGGGGGGGGGGGggg.',
    '..ggggHHHHHHHHHHHgggg..',
    'gg..ggggggggggggggg..gg',
    'gg....ggggggggggg....gg',
    'g.......ggggggg.......g',
  ];

  // ringed saucer: green dome, purple ring
  const K8 = [
    'ggg',
    'gDDD',
    'gDDDW',
    'gDDDDD',
    'ggGGGGG',
    'pPPPPPPPPPPPP',
    'pP1PPPPP2PPP2',
    'pPPPPPPPPPPPP',
    'ggGGGGGG',
    'gggGGGGG',
    '..ggHHHH',
    '....gggg',
  ].map(function (h) { return mirror(h); });

  // triple-dome carrier
  const K9 = [
    'ggggg..ggg',
    'gDDDg..gDD',
    'gDDDg..gDW',
    'ppPPPPPPPPPPP',
    'pQQQPPPPPPPPPP',
    'pP1PPPP2PPPPP1',
    'pPPPPPPPPPPPPP',
    '.ppPPPPPPPPPPP',
    '..pppQQQQQQQQ',
    '....pppppppp',
  ].map(function (h) { return mirror(h); });

  // boss saucer
  const K10 = [
    'eeee',
    'eFEEE',
    'eFEEEW',
    'eEEEEEE',
    'eeEEEEEE',
    'pppppQQQQQQ',
    'pQQQPPPPPPPPP',
    'pQQPPPPPPPPPPPP',
    'pP1PP2PP1PP2PP12',
    'pPPPPPPPPPPPPPPP',
    '.pPPPPPPPPPPPPP',
    '..ppPPPPPPPPP',
    '...ppQQQQQQ',
    '......pp',
  ].map(function (h) { return mirror(h); });

  const ICON_SHIELD = [
    'ccccccccccc',
    'cCCCCCCCCCc',
    'cCWCCCCCCCc',
    'cCCCCCCCCCc',
    'cCCCCCCCCCc',
    '.cCCCCCCCc.',
    '.cCCCCCCCc.',
    '..cCCCCCc..',
    '...cCCCc...',
    '....cCc....',
    '.....c.....',
  ];

  const ICON_LASER = [
    '...OWO...',
    '..OYWYO..',
    '..OYWYO..',
    '..OYWYO..',
    '..OYWYO..',
    '..OYWYO..',
    '..OYWYO..',
    '.OOYWYOO.',
    '..dBBBd..',
    '.dBBOBBd.',
    'dBBBBBBBd',
  ];

  const ICON_TIME = [
    'MMMMMMMMM',
    'MCCCCCCCM',
    '.MCCCCCM.',
    '..MCCCM..',
    '...MCM...',
    '....M....',
    '...MCM...',
    '..MCCCM..',
    '.MCCCCCM.',
    'MCCCCCCCM',
    'MMMMMMMMM',
  ];

  function swapLights(pal) {
    const p = Object.assign({}, pal);
    p[1] = pal[2];
    p[2] = pal[1];
    return p;
  }

  function paint(rows, pal) {
    const w = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    const h = rows.length;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    rows.forEach(function (row, y) {
      if (row.length % 2 === 0) console.warn('even sprite row', y, row);
      const off = Math.floor((w - row.length) / 2);
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '.') continue;
        const col = pal[ch];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(off + i, y, 1, 1);
      }
    });
    return c;
  }

  // glow: soft halo baked around the sprite; flash: white silhouette for hit feedback
  function decorate(base, glowCol, blur, pad) {
    const out = document.createElement('canvas');
    out.width = base.width + pad * 2;
    out.height = base.height + pad * 2;
    const g = out.getContext('2d');
    if (glowCol) {
      g.shadowColor = glowCol;
      g.shadowBlur = blur;
      g.drawImage(base, pad, pad);
      g.shadowBlur = 0;
    }
    g.drawImage(base, pad, pad);

    const flash = document.createElement('canvas');
    flash.width = out.width;
    flash.height = out.height;
    const f = flash.getContext('2d');
    f.drawImage(base, pad, pad);
    f.globalCompositeOperation = 'source-in';
    f.fillStyle = '#ffffff';
    f.fillRect(0, 0, flash.width, flash.height);

    return { c: out, flash: flash, base: base, w: base.width, h: base.height, pad: pad };
  }

  function build(rows, pal, glowCol, blur, pad) {
    return decorate(paint(rows, pal), glowCol, blur, pad);
  }

  // The final boss is drawn procedurally (left half, mirrored), then bevelled and outlined.
  function buildBoss() {
    const BW = 128, BH = 72, M = 1;
    const base = document.createElement('canvas');
    base.width = BW + M * 2; base.height = BH + M * 2;
    const g = base.getContext('2d');
    const px = function (x, y, col) { g.fillStyle = col; g.fillRect(x + M, y + M, 1, 1); g.fillRect(BW - 1 - x + M, y + M, 1, 1); };
    const inside = function (poly, x, y) {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    const fill = function (poly, col) {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      poly.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
      for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) if (inside(poly, x + 0.5, y + 0.5)) px(x, y, col);
    };
    const line = function (xa, ya, xb, yb, col) {
      const n = Math.max(Math.abs(xb - xa), Math.abs(yb - ya));
      for (let i = 0; i <= n; i++) px(Math.round(xa + (xb - xa) * i / n), Math.round(ya + (yb - ya) * i / n), col);
    };
    const disc = function (cx, cy, r, col) {
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if ((x + 0.5 - cx) * (x + 0.5 - cx) + (y + 0.5 - cy) * (y + 0.5 - cy) <= r * r) px(x, y, col);
      }
    };
    const rect = function (x0, y0, x1, y1, col) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(x, y, col); };

    // wings: swept leading edge on top, feathered trailing edge below
    fill([[58,14],[46,5],[30,0],[14,1],[3,8],[0,18],[8,16],[10,26],[19,22],[21,33],[31,28],[33,40],[43,34],[46,46],[55,38],[58,36]], '#7a35e0');
    [[14,2,8,16],[24,2,19,22],[36,4,31,28],[48,8,43,34],[56,14,55,38]].forEach(function (l) { line(l[0], l[1], l[2], l[3], '#3a1280'); });
    line(58, 14, 46, 5, '#e4b8ff'); line(46, 5, 30, 0, '#e4b8ff'); line(30, 0, 14, 1, '#e4b8ff'); line(14, 1, 3, 8, '#e4b8ff'); line(3, 8, 0, 18, '#e4b8ff');
    fill([[34,10],[44,8],[46,14],[36,16]], '#25d558');
    fill([[20,8],[30,6],[31,12],[22,14]], '#25d558');
    line(34, 10, 44, 8, '#a8ffc2'); line(20, 8, 30, 6, '#a8ffc2');
    // wingtip guns
    rect(2, 19, 5, 29, '#0b4f22'); rect(3, 28, 4, 33, '#25d558');
    // body, plating and crest
    fill([[64,3],[57,8],[52,18],[50,32],[52,46],[57,58],[61,66],[64,69]], '#4a1a9a');
    fill([[64,6],[60,12],[58,24],[58,40],[60,54],[64,62]], '#a24dff');
    fill([[64,0],[60,3],[57,8],[60,10],[64,7]], '#e4b8ff');
    rect(60, 66, 63, 70, '#ffd34d');
    // eye socket
    disc(64, 32, 9.5, '#ffd34d'); disc(64, 32, 8.2, '#12062e');
    // minion hatches (inside left / right)
    rect(33, 24, 44, 25, '#ff8a1c'); rect(33, 31, 44, 32, '#ff8a1c'); rect(34, 26, 43, 30, '#07020f');

    // bevel (light top edges, shaded undersides) + dark outline
    const w = base.width, h = base.height;
    const img = g.getImageData(0, 0, w, h), d = img.data;
    const A = function (x, y) { return x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3]; };
    const out = new Uint8ClampedArray(d);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3]) {
        if (!A(x, y - 1)) { for (let k = 0; k < 3; k++) out[i + k] = d[i + k] + (255 - d[i + k]) * 0.35; }
        else if (!A(x, y + 1)) { for (let k = 0; k < 3; k++) out[i + k] = d[i + k] * 0.7; }
      } else if (A(x - 1, y) || A(x + 1, y) || A(x, y - 1) || A(x, y + 1)) {
        out[i] = 18; out[i + 1] = 6; out[i + 2] = 46; out[i + 3] = 255;
      }
    }
    g.putImageData(new ImageData(out, w, h), 0, 0);
    return decorate(base, '#c04bff', 6, 8);
  }

  // Gaster-blaster style skull cannon (left half incl. centre, mirrored)
  const BLASTER = [
    '..sswww',
    '.swwwww',
    'swwwwww',
    'swkkwww',
    'swkkwww',
    'swwwwww',
    '.swwmmm',
    '..swmmm',
    '...smmm',
    '....smm',
    '.....sm',
  ].map(mirror);
  PAL.blaster = { w: '#e8ecff', s: '#8a94d0', k: '#12062e', m: '#ff3df0' };

  // [rows, palette, glow colour]
  const KINDS = [
    null,
    [K1, PAL.green, '#39ff7a'],
    [K2, PAL.green, '#39ff7a'],
    [K3, PAL.mix, '#39ff7a'],
    [K4, PAL.purple, '#c04bff'],
    [K5, PAL.purple, '#c04bff'],
    [K6, PAL.purple, '#c04bff'],
    [K7, PAL.purple, '#c04bff'],
    [K8, PAL.mix, '#c04bff'],
    [K9, PAL.mix, '#c04bff'],
    [K10, PAL.mix, '#ff4de0'],
  ];

  const enemy = [null];
  for (let k = 1; k <= 10; k++) {
    const spec = KINDS[k];
    enemy.push([
      build(spec[0], spec[1], spec[2], 4, 6),
      build(spec[0], swapLights(spec[1]), spec[2], 4, 6),
    ]);
  }

  window.Sprites = {
    ship: build(SHIP, PAL.ship, '#3a9bff', 4, 6),
    life: build(LIFE, PAL.ship, null, 0, 1),
    enemy: enemy,
    boss: buildBoss(),
    blaster: build(BLASTER, PAL.blaster, '#ff3df0', 4, 6),
    icon: {
      shield: paint(ICON_SHIELD, PAL.shield),
      laser: paint(ICON_LASER, PAL.laser),
      time: paint(ICON_TIME, PAL.time),
    },
  };
})();
