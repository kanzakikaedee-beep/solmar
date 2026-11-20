// The player on foot: movement, sprint, aiming, shooting, melee, and
// getting in and out of cars. The player is a circle in the world; the
// camera and the HUD read this state, and combat resolves against it.

import {
  PLAYER_RADIUS, PLAYER_WALK_SPEED, PLAYER_SPRINT_SPEED, PLAYER_ACCEL,
  PLAYER_FRICTION, PLAYER_MAX_HEALTH, PLAYER_HEALTH_REGEN_DELAY,
  PLAYER_HEALTH_REGEN_RATE, PISTOL_DAMAGE, PISTOL_FIRE_INTERVAL,
  PISTOL_MAGAZINE, PISTOL_RELOAD_TIME, MELEE_DAMAGE, MELEE_RANGE,
  MELEE_INTERVAL,
} from './config.js';
import { clamp } from './rng.js';
import { resolveCircleVsBuildings, clampToWorld, isInWater } from './city.js';

export function createPlayer(x, y) {
  return {
    x, y,
    vx: 0, vy: 0,
    angle: 0, // facing (aim) angle
    moveAngle: 0,
    radius: PLAYER_RADIUS,
    health: PLAYER_MAX_HEALTH,
    armor: 0,
    ammo: PISTOL_MAGAZINE,
    reloading: 0,
    fireCooldown: 0,
    meleeCooldown: 0,
    lastDamageAt: -99,
    inCar: null, // the car object when driving, else null
    moving: false,
    sprinting: false,
  };
}

// One step on foot. input: { axis: {x, y}, aimAngle, firing, melee,
// sprint }. Returns events the main loop turns into sound and effects.
export function updatePlayerOnFoot(player, input, dt, city, now) {
  const events = [];
  const sprint = input.sprint && (input.axis.x !== 0 || input.axis.y !== 0);
  const maxSpeed = sprint ? PLAYER_SPRINT_SPEED : PLAYER_WALK_SPEED;
  let ax = input.axis.x;
  let ay = input.axis.y;
  const len = Math.hypot(ax, ay);
  if (len > 1) { ax /= len; ay /= len; }
  player.vx += ax * PLAYER_ACCEL * dt;
  player.vy += ay * PLAYER_ACCEL * dt;
  const drag = Math.exp(-PLAYER_FRICTION * dt);
  player.vx *= drag;
  player.vy *= drag;
  const speed = Math.hypot(player.vx, player.vy);
  if (speed > maxSpeed) {
    player.vx = (player.vx / speed) * maxSpeed;
    player.vy = (player.vy / speed) * maxSpeed;
  }
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  player.moving = speed > 24;
  player.sprinting = sprint && player.moving;
  if (player.moving) player.moveAngle = Math.atan2(player.vy, player.vx);
  player.angle = input.aimAngle;

  resolveCircleVsBuildings(city, player, player.radius);
  clampToWorld(city, player, player.radius);
  if (isInWater(city, player.x, player.y)) {
    // Wade back to the beach: the sea is not walkable.
    player.y = city.seaY - player.radius - 1;
    player.vy = Math.min(0, player.vy);
  }

  // Health regen after a quiet spell.
  if (now - player.lastDamageAt > PLAYER_HEALTH_REGEN_DELAY && player.health > 0) {
    player.health = Math.min(PLAYER_MAX_HEALTH, player.health + PLAYER_HEALTH_REGEN_RATE * dt);
  }

  // Fire-rate and reload timers.
  player.fireCooldown = Math.max(0, player.fireCooldown - dt);
  player.meleeCooldown = Math.max(0, player.meleeCooldown - dt);
  if (player.reloading > 0) {
    player.reloading -= dt;
    if (player.reloading <= 0) {
      player.ammo = PISTOL_MAGAZINE;
      player.reloading = 0;
      events.push({ type: 'reloaded' });
    }
  }
  return events;
}

// Try to fire the pistol. Returns a bullet spawn or null.
export function playerTryShoot(player, now) {
  if (player.inCar) return null;
  if (player.reloading > 0 || player.fireCooldown > 0) return null;
  if (player.ammo <= 0) {
    player.reloading = PISTOL_RELOAD_TIME;
    return { type: 'dryfire' };
  }
  player.ammo -= 1;
  player.fireCooldown = PISTOL_FIRE_INTERVAL;
  const bx = player.x + Math.cos(player.angle) * 20;
  const by = player.y + Math.sin(player.angle) * 20;
  return {
    type: 'bullet',
    x: bx, y: by,
    angle: player.angle,
    damage: PISTOL_DAMAGE,
    from: 'player',
  };
}

export function playerTryMelee(player) {
  if (player.inCar || player.meleeCooldown > 0) return null;
  player.meleeCooldown = MELEE_INTERVAL;
  return {
    x: player.x + Math.cos(player.angle) * 26,
    y: player.y + Math.sin(player.angle) * 26,
    angle: player.angle,
    range: MELEE_RANGE,
    damage: MELEE_DAMAGE,
  };
}

export function playerTakeDamage(player, amount, now) {
  if (player.health <= 0) return;
  let remaining = amount;
  if (player.armor > 0) {
    const absorbed = Math.min(player.armor, remaining);
    player.armor -= absorbed;
    remaining -= absorbed;
  }
  player.health = Math.max(0, player.health - remaining);
  player.lastDamageAt = now;
}

export function playerHeal(player, amount) {
  player.health = clamp(player.health + amount, 0, PLAYER_MAX_HEALTH);
}
