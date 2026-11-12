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
  function build(rows, pal, glowCol, blur, pad) {
    const base = paint(rows, pal);
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
    icon: {
      shield: paint(ICON_SHIELD, PAL.shield),
      laser: paint(ICON_LASER, PAL.laser),
      time: paint(ICON_TIME, PAL.time),
    },
  };
})();
