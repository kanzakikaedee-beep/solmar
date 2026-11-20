// Combat: bullets, hit resolution, and melee swings.
// Hits are resolved from authoritative contact events: a bullet that reaches
// a target applies damage once, then the visuals follow the resolved event.

import { BULLET_SPEED, BULLET_RANGE } from './config.js';
import { circleHitsBuilding } from './city.js';

export function createCombat() {
  return { bullets: [] };
}

export function spawnBullet(combat, shot) {
  combat.bullets.push({
    x: shot.x, y: shot.y,
    vx: Math.cos(shot.angle) * BULLET_SPEED,
    vy: Math.sin(shot.angle) * BULLET_SPEED,
    travelled: 0,
    damage: shot.damage,
    from: shot.from, // 'player' | 'enemy' | 'cop'
  });
}

// Step all bullets. targets: [{ x, y, radius, onHit(damage, from), kind,
// hitBy: ['player'|'enemy'|'cop'] }] — a target only takes hits from the
// sources listed in hitBy, so a bullet can never hit its own side.
// returns events [{ type: 'hit'|'wall', x, y, from, kind }].
export function updateBullets(combat, dt, city, targets) {
  const events = [];
  for (let i = combat.bullets.length - 1; i >= 0; i--) {
    const b = combat.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.travelled += BULLET_SPEED * dt;
    let dead = b.travelled > BULLET_RANGE;
    if (!dead && circleHitsBuilding(city, b.x, b.y, 2)) {
      events.push({ type: 'wall', x: b.x, y: b.y, from: b.from });
      dead = true;
    }
    if (!dead) {
      for (const t of targets) {
        if (t.dead) continue;
        if (t.hitBy && !t.hitBy.includes(b.from)) continue;
        const dx = t.x - b.x;
        const dy = t.y - b.y;
        if (dx * dx + dy * dy < t.radius * t.radius) {
          t.onHit(b.damage, b.from);
          events.push({ type: 'hit', x: b.x, y: b.y, from: b.from, kind: t.kind });
          dead = true;
          break;
        }
      }
    }
    if (dead) combat.bullets.splice(i, 1);
  }
  return events;
}

// Melee swing: hits every live target whose centre is in the arc.
export function resolveMelee(swing, targets) {
  const hits = [];
  for (const t of targets) {
    if (t.dead) continue;
    const dx = t.x - swing.x;
    const dy = t.y - swing.y;
    const d = Math.hypot(dx, dy);
    if (d > swing.range + t.radius) continue;
    const ang = Math.atan2(dy, dx);
    let diff = Math.abs(ang - swing.angle);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff > 1.1) continue;
    t.onHit(swing.damage, 'player');
    hits.push({ x: t.x, y: t.y, kind: t.kind });
  }
  return hits;
}

export function clearBullets(combat) {
  combat.bullets.length = 0;
}
