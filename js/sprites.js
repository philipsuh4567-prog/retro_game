/* Pixel-art sprite data + pre-rendering. Each row is centred, '.' is transparent. */
(function () {
  'use strict';

  const PAL = {
    ship:   { d: '#0b1a55', b: '#1d4fe0', B: '#3d8bff', L: '#aef5ff', K: '#5ce6ff', W: '#ffffff', O: '#ff8a1c', o: '#b94a06', Y: '#ffd34d' },
    green:  { g: '#0b4f22', G: '#25d558', H: '#a8ffc2', D: '#b8f7ff', W: '#ffffff', 1: '#ffe94d', 2: '#ff55d6' },
    purple: { g: '#2a0b5c', G: '#a24dff', H: '#e4b8ff', D: '#ffd9f7', W: '#ffffff', 1: '#45ff96', 2: '#ff55d6', e: '#0b4f22', E: '#25d558', F: '#a8ffc2' },
    shield: { c: '#1aa0ff', C: '#8ff6ff', W: '#ffffff' },
    laser:  { O: '#ff8a1c', Y: '#ffe27a', W: '#ffffff', d: '#0b1a55', B: '#3d8bff' },
  };

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
  const SHIP = SHIP_HALF.map(function (r) {
    return r + r.slice(0, -1).split('').reverse().join('');
  });

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

  const T1 = [
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

  const T2 = [
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

  const T3 = [
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

  const T4 = [
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

  const T5 = [
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

  const enemyRows = [null, T1, T2, T3, T4, T5];
  const enemy = [null];
  for (let t = 1; t <= 5; t++) {
    const pal = t <= 2 ? PAL.green : PAL.purple;
    const glow = t <= 2 ? '#39ff7a' : '#c04bff';
    enemy.push([
      build(enemyRows[t], pal, glow, 4, 6),
      build(enemyRows[t], swapLights(pal), glow, 4, 6),
    ]);
  }

  window.Sprites = {
    ship: build(SHIP, PAL.ship, '#3a9bff', 4, 6),
    life: build(LIFE, PAL.ship, null, 0, 1),
    enemy: enemy,
    icon: {
      shield: paint(ICON_SHIELD, PAL.shield),
      laser: paint(ICON_LASER, PAL.laser),
    },
  };
})();
