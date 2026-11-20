// Visual effects: pooled particles, screen shake, floating text.
// Meaning before spectacle: every effect is spawned from a resolved game
// event, capped so a crowded scene cannot leak objects or allocations.

export function createEffects() {
  const particles = [];
  const texts = [];
  let shakeTrauma = 0;
  let shakeTime = 0;

  function spawnParticle(p) {
    if (particles.length > 420) particles.shift();
    particles.push(p);
  }

  return {
    // Impact sparks (crashes, bullet hits).
    sparks(x, y, color, count) {
      for (let i = 0; i < (count || 10); i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 60 + Math.random() * 220;
        spawnParticle({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35 + Math.random() * 0.25, maxLife: 0.6, size: 2 + Math.random() * 2, color: color || '#ffd23f', kind: 'spark', drag: 4 });
      }
    },
    // Tyre smoke while drifting or burning out.
    smoke(x, y, count) {
      for (let i = 0; i < (count || 3); i++) {
        spawnParticle({ x: x + (Math.random() - 0.5) * 14, y: y + (Math.random() - 0.5) * 14, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20 - 12, life: 0.7 + Math.random() * 0.5, maxLife: 1.2, size: 6 + Math.random() * 8, color: 'rgba(200,200,200,0.5)', kind: 'smoke', drag: 1.5 });
      }
    },
    // Explosion: fire + smoke + a hard shake.
    explosion(x, y) {
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 80 + Math.random() * 320;
        spawnParticle({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.5, maxLife: 0.9, size: 3 + Math.random() * 5, color: Math.random() < 0.5 ? '#ff7a2f' : '#ffd23f', kind: 'spark', drag: 3 });
      }
      for (let i = 0; i < 10; i++) {
        spawnParticle({ x: x + (Math.random() - 0.5) * 30, y: y + (Math.random() - 0.5) * 30, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, life: 1 + Math.random() * 0.8, maxLife: 1.8, size: 10 + Math.random() * 12, color: 'rgba(60,60,60,0.55)', kind: 'smoke', drag: 1.2 });
      }
      this.addShake(0.9);
    },
    // Muzzle flash at the gun barrel.
    muzzle(x, y, angle) {
      spawnParticle({ x, y, vx: Math.cos(angle) * 40, vy: Math.sin(angle) * 40, life: 0.07, maxLife: 0.07, size: 9, color: '#ffe9a8', kind: 'flash', angle });
    },
    // Blood-free hit marker: small red puffs read as damage without gore.
    hitPuff(x, y) {
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        spawnParticle({ x, y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, life: 0.25, maxLife: 0.25, size: 2.5, color: '#e2574c', kind: 'spark', drag: 5 });
      }
    },
    // Floating text (cash earned, "MISSION COMPLETE", ...).
    floatText(x, y, text, color) {
      if (texts.length > 12) texts.shift();
      texts.push({ x, y, text, color: color || '#ffffff', life: 1.4, maxLife: 1.4 });
    },
    // Trauma-based shake: add trauma, the offset decays on its own.
    addShake(amount) {
      shakeTrauma = Math.min(1, shakeTrauma + amount);
    },
    // Current trauma (0..1) — the camera reads it for its shake offset.
    trauma() {
      return shakeTrauma;
    },
    shakeOffset() {
      const s = shakeTrauma * shakeTrauma * 14;
      return { x: (Math.random() - 0.5) * s, y: (Math.random() - 0.5) * s };
    },
    update(dt) {
      shakeTime += dt;
      shakeTrauma = Math.max(0, shakeTrauma - dt * 1.4);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        const drag = Math.exp(-(p.drag || 2) * dt);
        p.vx *= drag;
        p.vy *= drag;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      for (let i = texts.length - 1; i >= 0; i--) {
        const t = texts[i];
        t.life -= dt;
        t.y -= 34 * dt;
        if (t.life <= 0) texts.splice(i, 1);
      }
    },
    draw(ctx) {
      for (const p of particles) {
        const a = Math.max(0, p.life / p.maxLife);
        if (p.kind === 'smoke') {
          ctx.globalAlpha = a * 0.55;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === 'flash') {
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle);
          ctx.fillRect(-2, -p.size / 2, p.size * 1.6, p.size);
          ctx.restore();
        } else {
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      ctx.font = 'bold 15px Arial, sans-serif';
      for (const t of texts) {
        const a = Math.max(0, t.life / t.maxLife);
        ctx.globalAlpha = a;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(t.text, t.x, t.y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
      }
      ctx.globalAlpha = 1;
    },
    clear() {
      particles.length = 0;
      texts.length = 0;
      shakeTrauma = 0;
    },
  };
}
