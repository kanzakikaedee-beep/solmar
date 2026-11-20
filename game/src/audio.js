// Procedural WebAudio sound: every effect is synthesized, no audio files.
// Unlocks on the first user gesture, caps simultaneous voices, and keeps a
// light music loop (bass + pad) that changes with the game state.

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenPhase = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      // Engine hum: sawtooth through a low-pass, pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Police siren: two alternating tones.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      return false;
    }
    return true;
  }

  // Call from any user gesture (click / key) to unlock audio in browsers.
  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
  }

  function noiseBuffer(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noiseHit(dur, vol, filterFreq) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
  }

  // Music: a slow 8-step bass line over a warm pad, one step per 240 ms.
  const BASS_LINE = [55, 0, 65.41, 0, 49, 0, 58.27, 73.42];
  function musicTick() {
    if (!ctx || muted) return;
    const step = musicStep % 8;
    const freq = BASS_LINE[step];
    if (freq > 0) blip(freq, 0.22, 'triangle', 0.5);
    if (step === 0) {
      blip(220, 1.8, 'sine', 0.05);
      blip(277.18, 1.8, 'sine', 0.04);
    }
    musicStep++;
  }

  return {
    unlock,
    isMuted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    startMusic() {
      if (!ensure()) return;
      if (musicTimer) return;
      musicTimer = setInterval(musicTick, 240);
    },
    stopMusic() {
      if (musicTimer) clearInterval(musicTimer);
      musicTimer = null;
    },
    // Engine hum follows the car's speed (0..1).
    setEngine(speedNorm, driving) {
      if (!ctx) return;
      const target = driving ? 0.05 + speedNorm * 0.09 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(48 + speedNorm * 130, ctx.currentTime, 0.08);
    },
    // Siren wails while police are near; on = 0..1 strength.
    setSiren(strength) {
      if (!ctx) return;
      sirenGain.gain.setTargetAtTime(strength * 0.045, ctx.currentTime, 0.1);
      sirenPhase += 0.06;
      sirenOsc.frequency.setTargetAtTime(sirenPhase % 2 < 1 ? 720 : 960, ctx.currentTime, 0.05);
    },
    shoot() {
      noiseHit(0.12, 0.4, 2600);
      blip(160, 0.08, 'square', 0.12, 60);
    },
    enemyShoot() {
      noiseHit(0.1, 0.18, 1800);
    },
    crash(intensity) {
      noiseHit(0.25, 0.15 + intensity * 0.35, 500);
    },
    pickup() {
      blip(660, 0.09, 'sine', 0.22);
      setTimeout(() => blip(990, 0.12, 'sine', 0.22), 70);
    },
    cash() {
      blip(880, 0.08, 'sine', 0.2);
      setTimeout(() => blip(1174, 0.1, 'sine', 0.2), 60);
      setTimeout(() => blip(1568, 0.14, 'sine', 0.2), 120);
    },
    missionComplete() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.22), i * 110));
    },
    missionFail() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => blip(f, 0.25, 'sawtooth', 0.12), i * 140));
    },
    wantedUp() {
      blip(440, 0.12, 'square', 0.14, 880);
    },
    busted() {
      [330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'sawtooth', 0.14), i * 160));
    },
    click() {
      blip(700, 0.05, 'sine', 0.15);
    },
    carDoor() {
      noiseHit(0.08, 0.2, 900);
    },
    skid() {
      noiseHit(0.18, 0.1, 2400);
    },
  };
}
