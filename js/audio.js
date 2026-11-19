/* Tiny synthesized sound effects (Web Audio, no files). Audio only starts after the first tap/key. */
(function () {
  'use strict';

  let ctx = null, master = null, noiseBuf = null, muted = false, analyser = null;
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
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    comp.connect(analyser);
    musicInit();
  }

  function tone(o) {
    const t = o.at !== undefined ? o.at : ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + o.dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.1, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g); g.connect(o.dest || master);
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
    saberOn: function () {
      noise({ f0: 7000, f1: 1500, dur: 0.14, vol: 0.2, filter: 'highpass' });                 // the spark
      const t = ctx.currentTime;
      [['sawtooth', 70, 230, 0.15], ['triangle', 140, 460, 0.07]].forEach(function (v) {   // ignite sweep with a vibrato wobble
        const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
        o.type = v[0]; o.frequency.setValueAtTime(v[1], t); o.frequency.exponentialRampToValueAtTime(v[2], t + 0.32);
        lfo.frequency.value = 38; lg.gain.value = v[2] * 0.05; lfo.connect(lg); lg.connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v[3], t + 0.05); g.gain.exponentialRampToValueAtTime(v[3] * 0.55, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
        o.connect(g); g.connect(master); lfo.start(t); o.start(t); o.stop(t + 0.6); lfo.stop(t + 0.6);
      });
    },
    saberOff: function () { tone({ type: 'sawtooth', f0: 230, f1: 55, dur: 0.28, vol: 0.12 }); noise({ f0: 4000, f1: 800, dur: 0.12, vol: 0.08, filter: 'highpass' }); },
    laserOn: function () { tone({ type: 'sawtooth', f0: 1000, f1: 60, dur: 0.45, vol: 0.14 }); tone({ type: 'sine', f0: 90, f1: 38, dur: 0.5, vol: 0.3 }); noise({ f0: 3500, f1: 300, dur: 0.5, vol: 0.12 }); },
    timeOn: function () { tone({ type: 'sine', f0: 700, f1: 60, dur: 0.9, vol: 0.2 }); tone({ type: 'triangle', f0: 350, f1: 40, dur: 0.9, vol: 0.1 }); noise({ f0: 2500, f1: 120, dur: 0.9, vol: 0.1 }); },
    timeOff: function () { tone({ type: 'sine', f0: 70, f1: 520, dur: 0.4, vol: 0.14 }); },
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

  // Sustained layers that run while a power-up is active.
  const loops = {};
  let activePower = null;

  function startLoop(name) {
    if (!ctx || loops[name]) return;
    const t = ctx.currentTime, out = ctx.createGain(), osc = [];
    let vol = 0.1;
    const add = function (type, freq, gainVal, dest) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = type; o.frequency.value = freq; og.gain.value = gainVal;
      o.connect(og); og.connect(dest); o.start(t); osc.push(o);
    };
    const lfoTo = function (freq, depth, param) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = freq; lg.gain.value = depth; l.connect(lg); lg.connect(param); l.start(t); osc.push(l);
    };
    if (name === 'shield') {                      // lightsaber hum: detuned saws, a swinging filter, a gentle tremolo
      vol = 0.08;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 2; lp.connect(out);
      add('sawtooth', 110, 1, lp); add('sawtooth', 111.7, 1, lp); add('square', 220.5, 0.25, lp);
      lfoTo(0.8, 450, lp.frequency);
      lfoTo(5.5, vol * 0.3, out.gain);
    } else if (name === 'laser') {                // 50 Hz fundamental (+ 100 Hz so phone speakers can hear it), pulsing like a beam
      vol = 0.34;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 500; lp.connect(out);
      add('sine', 50, 1, lp); add('triangle', 100, 0.3, lp);
      lfoTo(16, vol * 0.18, out.gain);
    } else {                                      // time: a 90 Hz bed (+ 180 Hz) that slowly throbs
      vol = 0.26;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 600; lp.connect(out);
      add('sine', 90, 1, lp); add('triangle', 180, 0.22, lp);
      lfoTo(1.2, vol * 0.3, out.gain);
    }
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(vol, t + 0.12);
    out.connect(master);
    loops[name] = { out: out, osc: osc };
  }

  function stopLoop(name) {
    const l = loops[name];
    if (!l) return;
    delete loops[name];
    const t = ctx.currentTime;
    l.out.gain.cancelScheduledValues(t);
    l.out.gain.setValueAtTime(Math.max(0.0001, l.out.gain.value), t);
    l.out.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    l.osc.forEach(function (o) { try { o.stop(t + 0.3); } catch (_) {} });
  }

  // called by the game whenever the active power-up changes (null = none)
  function powerSet(type) {
    if (type === activePower) return;
    const prev = activePower;
    activePower = type;
    if (!ctx) return;
    if (prev) {
      stopLoop(prev);
      if (prev === 'shield') play('saberOff');
      if (prev === 'time') { play('timeOff'); MUS.rateT = 1; }
    }
    if (type) {
      play(type === 'shield' ? 'saberOn' : type === 'laser' ? 'laserOn' : 'timeOn');
      startLoop(type);
      if (type === 'time') MUS.rateT = 0.45;     // music drags down while time is stopped
    }
  }

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

  /* ------------------------------------------------------------------ music */
  // A small step sequencer. Lobby: relaxed deep-house take. Battle/boss: same arp motif, darker chords,
  // faster tempo, rolling bass, clap and stabs for tension.
  const MUS = { want: 'lobby', wave: 1, mode: null, bus: null, duck: null, bpm: 112, step: 0, next: 0, timer: null, enabled: true, rate: 1, rateT: 1 };
  try { MUS.enabled = localStorage.getItem('neon.music') !== '0'; } catch (_) {}
  let musicMaster = null, musicLP = null, fxIn = null, fxDelay = null;
  const MUSIC_VOL = 0.32;
  const hz = function (m) { return 440 * Math.pow(2, (m - 69) / 12) * (0.65 + 0.35 * MUS.rate); };   // pitch sags as the music slows

  // r = bass root, t = chord tones (midi)
  const PROG = {
    lobby: [
      { r: 45, t: [57, 60, 64, 67, 71] },   // Am9
      { r: 41, t: [53, 57, 60, 64, 67] },   // Fmaj7
      { r: 48, t: [60, 64, 67, 71, 74] },   // Cmaj7
      { r: 43, t: [55, 59, 62, 64, 69] },   // G6/9
    ],
    battle: [
      { r: 45, t: [57, 60, 64, 67, 71] },   // Am9
      { r: 41, t: [53, 57, 60, 64, 67] },   // Fmaj7
      { r: 38, t: [50, 53, 57, 60, 64] },   // Dm9
      { r: 40, t: [52, 56, 59, 62, 65] },   // E7b9: the tension chord
    ],
  };
  const ARP_LOBBY = [0, 2, 1, 3, 2, 4, 3, 1];
  const ARP_BATTLE = [0, 2, 1, 3, 2, 4, 3, 1, 0, 2, 4, 3, 2, 1, 3, 4];

  function musicInit() {
    musicMaster = ctx.createGain();
    musicMaster.gain.value = MUS.enabled ? MUSIC_VOL : 0;
    musicMaster.connect(master);
    musicLP = ctx.createBiquadFilter();
    musicLP.type = 'lowpass'; musicLP.frequency.value = 18000;
    musicLP.connect(musicMaster);
    fxIn = ctx.createGain();
    fxDelay = ctx.createDelay(1);
    const fb = ctx.createGain(), lp = ctx.createBiquadFilter(), wet = ctx.createGain();
    fb.gain.value = 0.38; lp.type = 'lowpass'; lp.frequency.value = 2400; wet.gain.value = 0.45;
    fxIn.connect(fxDelay); fxDelay.connect(lp); lp.connect(fb); fb.connect(fxDelay);
    fxDelay.connect(wet); wet.connect(musicLP);
    if (MUS.want && MUS.want !== 'off') switchMode(MUS.want);
  }

  function bpmFor(mode) { return mode === 'lobby' ? 112 : mode === 'boss' ? 140 : 128 + Math.min(8, Math.floor(MUS.wave / 2)); }

  function switchMode(mode) {
    const t = ctx.currentTime;
    if (MUS.bus) {
      const old = MUS.bus;
      old.gain.cancelScheduledValues(t);
      old.gain.setValueAtTime(old.gain.value, t);
      old.gain.linearRampToValueAtTime(0, t + 0.35);
      setTimeout(function () { try { old.disconnect(); } catch (_) {} }, 700);
    }
    MUS.mode = mode;
    if (mode === 'off') { MUS.bus = null; MUS.duck = null; return; }
    MUS.bus = ctx.createGain();
    MUS.bus.gain.setValueAtTime(0, t);
    MUS.bus.gain.linearRampToValueAtTime(1, t + 0.5);
    MUS.bus.connect(musicLP);
    MUS.duck = ctx.createGain();
    MUS.duck.connect(MUS.bus);
    MUS.bpm = bpmFor(mode);
    MUS.step = 0;
    MUS.next = t + 0.12;
    fxDelay.delayTime.setTargetAtTime(60 / MUS.bpm * 0.75, t, 0.05);
    if (!MUS.timer) MUS.timer = setInterval(musicTick, 30);
  }

  function musicTick() {
    if (!ctx || !MUS.bus || ctx.state !== 'running') return;
    if (MUS.next < ctx.currentTime - 0.3) MUS.next = ctx.currentTime + 0.05;
    MUS.rate += (MUS.rateT - MUS.rate) * 0.12;                      // ease the tempo down / back up
    musicLP.frequency.setTargetAtTime(900 * Math.pow(20, (MUS.rate - 0.45) / 0.55), ctx.currentTime, 0.08);   // muffles as it slows
    while (MUS.next < ctx.currentTime + 0.15) {
      schedStep(MUS.step, MUS.next);
      MUS.next += 60 / MUS.bpm / 4 / MUS.rate;
      MUS.step++;
    }
  }

  // --- music voices ---
  function mKick(t, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(155, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    o.connect(g); g.connect(MUS.bus); o.start(t); o.stop(t + 0.26);
    const d = MUS.duck.gain;                      // sidechain-style pump on everything else
    d.cancelScheduledValues(t); d.setValueAtTime(0.35, t); d.linearRampToValueAtTime(1, t + 0.2);
  }
  function mNoise(t, dur, vol, ftype, f0, f1, dest) {
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true;
    f.type = ftype; f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    src.connect(f); f.connect(g); g.connect(dest || MUS.bus);
    src.start(t); src.stop(t + dur + 0.02);
  }
  const mHat = function (t, vol, open) { mNoise(t, open ? 0.16 : 0.04, vol, 'highpass', 7500); };
  function mClap(t, vol) { mNoise(t, 0.012, vol, 'bandpass', 1500); mNoise(t + 0.014, 0.012, vol, 'bandpass', 1500); mNoise(t + 0.028, 0.14, vol, 'bandpass', 1400); }
  function mBass(t, dur, midi, vol, cut) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = hz(midi);
    f.type = 'lowpass'; f.Q.value = 5; f.frequency.setValueAtTime(cut, t); f.frequency.exponentialRampToValueAtTime(Math.max(120, cut * 0.35), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(MUS.duck); o.start(t); o.stop(t + dur + 0.02);
  }
  function mPad(t, dur, midis, vol, cut) {
    midis.forEach(function (m) {
      [-7, 7].forEach(function (det) {
        const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), send = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det;
        f.type = 'lowpass'; f.frequency.value = cut;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.4); g.gain.linearRampToValueAtTime(0.0001, t + dur);
        send.gain.value = 0.5;
        o.connect(f); f.connect(g); g.connect(MUS.duck); g.connect(send); send.connect(fxIn);
        o.start(t); o.stop(t + dur + 0.05);
      });
    });
  }
  function mArp(t, midi, vol, cut, dur, type) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), send = ctx.createGain();
    o.type = type; o.frequency.value = hz(midi);
    f.type = 'lowpass'; f.Q.value = 3; f.frequency.setValueAtTime(cut, t); f.frequency.exponentialRampToValueAtTime(cut * 0.4, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    send.gain.value = 0.6;
    o.connect(f); f.connect(g); g.connect(MUS.duck); g.connect(send); send.connect(fxIn);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function mStab(t, midis, vol) {
    midis.forEach(function (m) {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = hz(m);
      f.type = 'lowpass'; f.frequency.setValueAtTime(3500, t); f.frequency.exponentialRampToValueAtTime(600, t + 0.14);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(f); f.connect(g); g.connect(MUS.duck); o.start(t); o.stop(t + 0.17);
    });
  }

  function schedStep(step, t) {
    const mode = MUS.mode, lobby = mode === 'lobby', boss = mode === 'boss';
    const bar = (step >> 4) & 3, s = step & 15;
    const ch = PROG[lobby ? 'lobby' : 'battle'][bar];
    const spb = 60 / MUS.bpm / 4;                  // seconds per 16th note
    const lvl = lobby ? 0 : MUS.wave;

    // drums
    if (s % 4 === 0) mKick(t, lobby ? 0.55 : 0.8);
    if (lobby) {
      if (s % 4 === 2) mHat(t, 0.05, s === 14);
    } else {
      if (s === 4 || s === 12) mClap(t, 0.16);
      mHat(t, s % 2 ? 0.035 : 0.06, false);
      if (s % 4 === 2) mHat(t, 0.08, true);
    }
    // bass: relaxed off-beat pulses in the lobby, rolling 16ths in battle
    if (lobby) {
      if (s % 4 === 2) mBass(t, spb * 1.7, ch.r, 0.16, 420);
    } else if (s % 4 !== 0) {
      mBass(t, spb * 0.9, ch.r + (s === 7 || s === 15 ? 12 : 0), 0.12, boss ? 900 : 650);
    }
    // pad: one long chord per bar (darker and tighter in battle)
    if (s === 0) mPad(t, spb * 16 * 0.98, ch.t.slice(0, 4), lobby ? 0.03 : 0.026, lobby ? 1400 : 800);
    // arp: same motif in both moods, but eighths vs sixteenths
    if (lobby) {
      if (s % 2 === 0) mArp(t, ch.t[ARP_LOBBY[(s >> 1) & 7]] + 12, 0.032, 2200, spb * 1.8, 'triangle');
    } else {
      mArp(t, ch.t[ARP_BATTLE[s]] + 12 + (s % 8 === 6 ? 12 : 0), 0.03, 3400, spb * 0.9, 'square');
    }
    // battle-only tension: off-beat stabs as the waves climb, a riser into every 4th bar, boss crashes
    if (!lobby && (lvl >= 4 || boss) && (s === 6 || s === 14 || (boss && s === 10))) mStab(t, ch.t.slice(0, 3).map(function (m) { return m + 12; }), 0.045);
    if (!lobby && bar === 3 && s === 8) mNoise(t, spb * 8, 0.07, 'highpass', 900, 9000);
    if (boss && s === 0 && bar % 2 === 0) mNoise(t, 0.9, 0.1, 'highpass', 5000);
  }

  function musicSet(mode, wave) {
    MUS.want = mode;
    if (wave) MUS.wave = wave;
    if (!ctx) return;
    if (mode !== MUS.mode) switchMode(mode);
    else if (mode !== 'off') { MUS.bpm = bpmFor(mode); fxDelay.delayTime.setTargetAtTime(60 / MUS.bpm * 0.75, ctx.currentTime, 0.05); }
  }

  function setMusicEnabled(on) {
    MUS.enabled = !!on;
    try { localStorage.setItem('neon.music', MUS.enabled ? '1' : '0'); } catch (_) {}
    if (musicMaster) musicMaster.gain.setTargetAtTime(MUS.enabled ? MUSIC_VOL : 0, ctx.currentTime, 0.05);
    document.querySelectorAll('.musBtn').forEach(function (b) { b.textContent = MUS.enabled ? 'MUSIC: ON' : 'MUSIC: OFF'; });
  }

  function level() {
    if (!analyser) return -1;
    const a = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(a);
    let peak = 0;
    for (let i = 0; i < a.length; i++) peak = Math.max(peak, Math.abs(a[i]));
    return peak;
  }

  ['pointerdown', 'touchend', 'keydown', 'click'].forEach(function (ev) { window.addEventListener(ev, init, { passive: true }); });
  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else if (ctx.state === 'suspended') ctx.resume();
  });

  window.SFX = { play: play, power: powerSet, setMuted: setMuted, isMuted: function () { return muted; } };
  window.MUSIC = {
    set: musicSet, setEnabled: setMusicEnabled, isEnabled: function () { return MUS.enabled; },
    debug: function () { return { mode: MUS.mode, bpm: MUS.bpm, step: MUS.step, wave: MUS.wave, rate: +MUS.rate.toFixed(2), loops: Object.keys(loops), ctx: ctx ? ctx.state : 'none', level: level() }; },
  };
  setMusicEnabled(MUS.enabled);
})();
