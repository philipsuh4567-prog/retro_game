/* Tiny synthesized sound effects (Web Audio, no files). Audio only starts after the first tap/key. */
(function () {
  'use strict';

  let ctx = null, master = null, noiseBuf = null, muted = false;
  const last = {};
  try { muted = localStorage.getItem('neon.mute') === '1'; } catch (_) {}

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(comp);
    comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function tone(o) {
    const t = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + o.dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.1, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + o.dur + 0.03);
  }

  function noise(o) {
    const t = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf;
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
    g.gain.setValueAtTime(o.vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + o.dur + 0.03);
  }

  const notes = function (list, type, vol, step, dur) {
    list.forEach(function (f, i) { tone({ type: type, f0: f, dur: dur || step * 1.6, vol: vol, delay: i * step }); });
  };

  const SOUNDS = {
    click:   function () { tone({ type: 'square', f0: 660, dur: 0.05, vol: 0.07 }); tone({ type: 'square', f0: 990, dur: 0.06, vol: 0.06, delay: 0.04 }); },
    start:   function () { notes([262, 330, 392, 523, 659], 'square', 0.07, 0.07); },
    shoot:   function () { tone({ type: 'square', f0: 980, f1: 320, dur: 0.07, vol: 0.035 }); },
    hit:     function () { tone({ type: 'triangle', f0: 420, f1: 260, dur: 0.05, vol: 0.06 }); },
    boom:    function () { noise({ f0: 2600, f1: 200, dur: 0.28, vol: 0.22 }); tone({ type: 'sine', f0: 160, f1: 40, dur: 0.25, vol: 0.18 }); },
    death:   function () { noise({ f0: 3200, f1: 120, dur: 0.8, vol: 0.38 }); tone({ type: 'sawtooth', f0: 220, f1: 30, dur: 0.7, vol: 0.18 }); },
    respawn: function () { notes([392, 523, 784], 'triangle', 0.08, 0.06); },
    shield:  function () { tone({ type: 'sine', f0: 1200, f1: 1800, dur: 0.08, vol: 0.06 }); },
    ready:   function () { notes([784, 1047, 1319], 'square', 0.06, 0.09); },
    power_shield: function () { tone({ type: 'sine', f0: 300, f1: 1100, dur: 0.45, vol: 0.14 }); tone({ type: 'triangle', f0: 600, f1: 1500, dur: 0.45, vol: 0.06 }); },
    power_laser:  function () { tone({ type: 'sawtooth', f0: 1400, f1: 90, dur: 0.6, vol: 0.14 }); noise({ f0: 3500, f1: 400, dur: 0.6, vol: 0.12 }); },
    power_time:   function () { tone({ type: 'sine', f0: 1000, f1: 120, dur: 0.7, vol: 0.14 }); tone({ type: 'triangle', f0: 500, f1: 60, dur: 0.7, vol: 0.08 }); },
    eshoot:  function () { tone({ type: 'sawtooth', f0: 520, f1: 200, dur: 0.09, vol: 0.025 }); },
    dive:    function () { tone({ type: 'sawtooth', f0: 700, f1: 160, dur: 0.35, vol: 0.04 }); },
    wave:    function () { notes([330, 392], 'square', 0.05, 0.09); },
    clear:   function () { notes([523, 659, 784, 1047], 'square', 0.07, 0.08); },
    warning: function () { for (let i = 0; i < 4; i++) tone({ type: 'sawtooth', f0: i % 2 ? 440 : 330, dur: 0.3, vol: 0.09, delay: i * 0.33 }); },
    boss:    function () { tone({ type: 'sawtooth', f0: 110, f1: 55, dur: 0.9, vol: 0.2 }); noise({ f0: 800, f1: 100, dur: 0.9, vol: 0.2 }); },
    phase:   function () { tone({ type: 'sawtooth', f0: 200, f1: 600, dur: 0.5, vol: 0.12 }); noise({ f0: 2000, f1: 300, dur: 0.5, vol: 0.14 }); },
    ring:    function () { tone({ type: 'sine', f0: 500, f1: 900, dur: 0.18, vol: 0.05 }); },
    spawn:   function () { notes([440, 554, 659], 'triangle', 0.05, 0.06); },
    blasterWarn: function () { tone({ type: 'square', f0: 880, dur: 0.07, vol: 0.05 }); tone({ type: 'square', f0: 880, dur: 0.07, vol: 0.05, delay: 0.14 }); },
    blasterFire: function () { tone({ type: 'sawtooth', f0: 260, f1: 70, dur: 0.8, vol: 0.2 }); noise({ f0: 4000, f1: 300, dur: 0.8, vol: 0.2 }); },
    bossdeath: function () { for (let i = 0; i < 6; i++) { noise({ f0: 3000, f1: 150, dur: 0.4, vol: 0.28, delay: i * 0.38 }); tone({ type: 'sine', f0: 140, f1: 35, dur: 0.4, vol: 0.18, delay: i * 0.38 }); } },
    gameover: function () { notes([392, 349, 294, 220], 'sawtooth', 0.09, 0.2, 0.3); },
    victory: function () { notes([523, 659, 784, 1047, 784, 1047, 1319], 'square', 0.08, 0.11); },
  };

  // minimum gap between repeats of the same sound (seconds), so rapid-fire events don't pile up
  const GAP = { shoot: 0.07, hit: 0.05, eshoot: 0.08, boom: 0.04, shield: 0.06, ring: 0.2, dive: 0.15, blasterWarn: 0.3 };

  function play(name) {
    if (!ctx || muted) return;
    const now = ctx.currentTime;
    if (now - (last[name] || -9) < (GAP[name] || 0)) return;
    last[name] = now;
    const f = SOUNDS[name];
    if (f) f();
  }

  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem('neon.mute', muted ? '1' : '0'); } catch (_) {}
    if (master) master.gain.value = muted ? 0 : 0.55;
    document.querySelectorAll('.sndBtn').forEach(function (b) { b.textContent = muted ? 'SOUND: OFF' : 'SOUND: ON'; });
  }

  ['pointerdown', 'touchend', 'keydown', 'click'].forEach(function (ev) { window.addEventListener(ev, init, { passive: true }); });
  document.addEventListener('visibilitychange', function () { if (ctx && !document.hidden && ctx.state === 'suspended') ctx.resume(); });

  window.SFX = { play: play, setMuted: setMuted, isMuted: function () { return muted; } };
})();
