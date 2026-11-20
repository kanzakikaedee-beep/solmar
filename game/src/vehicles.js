// Vehicles: definitions, spawning, and arcade driving physics.
// A car is data (type, colour, top speed) plus runtime state (position,
// heading, speed, health, driver). Driving is velocity along the heading
// with lateral grip; the handbrake drops grip so the car slides.

import { CAR_MAX_SPEED, CAR_ENGINE_FORCE, CAR_BRAKE_FORCE, CAR_REVERSE_MAX, CAR_STEER_RATE, CAR_GRIP, CAR_HANDBRAKE_GRIP, CAR_MAX_HEALTH, PALETTE } from './config.js';
import { clamp, angleLerp } from './rng.js';
import { circleHitsBuilding, resolveCircleVsBuildings, clampToWorld } from './city.js';

let nextCarId = 1;

export const CAR_TYPES = {
  sedan: { name: 'Sedan', color: PALETTE.sedan, length: 46, width: 22, accel: 1.0 },
  taxi: { name: 'Taxi', color: PALETTE.taxi, length: 46, width: 22, accel: 0.95 },
  sport: { name: 'Sports Car', color: PALETTE.sport, length: 48, width: 22, accel: 1.25 },
  truck: { name: 'Truck', color: PALETTE.truck, length: 62, width: 26, accel: 0.7 },
  van: { name: 'Van', color: PALETTE.van, length: 54, width: 24, accel: 0.8 },
  police: { name: 'Police Cruiser', color: PALETTE.police, length: 48, width: 22, accel: 1.15 },
};

export function createCar(type, x, y, angle) {
  const def = CAR_TYPES[type] || CAR_TYPES.sedan;
  return {
    id: nextCarId++,
    type,
    name: def.name,
    color: def.color,
    length: def.length,
    width: def.width,
    x, y,
    angle: angle || 0,
    speed: 0,
    steer: 0,
    health: CAR_MAX_HEALTH,
    driver: null, // 'player' | 'traffic' | 'police' | null (parked)
    wanted: false,
    smoke: 0,
    brakeLight: false,
    headlight: false,
    // Police cruisers are built to keep chasing: wall bumps slow them but
    // never wreck them (the player loses cops by outrunning them, not by
    // watching them grind themselves to death on buildings).
    noCrashDamage: type === 'police',
  };
}

// Drive one step. The car keeps a real velocity vector: engine force acts
// along the heading, lateral velocity is damped by grip, and the handbrake
// drops grip so the car slides. input: { throttle: -1..1, steer: -1..1,
// handbrake: bool }. Returns distance travelled and whether it skidded.
export function driveCar(car, input, dt, city) {
  const def = CAR_TYPES[car.type];
  const maxSpeed = CAR_MAX_SPEED[car.type] || 540;
  const accel = CAR_ENGINE_FORCE * (def.accel || 1);
  // A velocity component left undefined (a car staged by hand) must default
  // to 0: undefined * 0 is NaN in JS, and one NaN car would infect every
  // car it touches through collisions.
  if (car.vx === undefined) car.vx = 0;
  if (car.vy === undefined) car.vy = 0;

  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  // Split velocity into forward and lateral parts.
  let vf = car.vx * fx + car.vy * fy;

  if (input.throttle > 0) vf += accel * input.throttle * dt;
  else if (input.throttle < 0) {
    if (vf > 5) vf -= CAR_BRAKE_FORCE * dt; // brake
    else vf -= accel * 0.55 * dt; // reverse
  } else {
    vf -= vf * 0.9 * dt; // coast drag
  }
  vf = clamp(vf, -CAR_REVERSE_MAX, maxSpeed);

  // Steering fades with speed so the car stays controllable flat-out.
  const speedFactor = clamp(Math.abs(vf) / 260, 0, 1);
  const steerAuthority = CAR_STEER_RATE * (1 - speedFactor * 0.55);
  const targetSteer = input.steer * steerAuthority;
  car.steer += (targetSteer - car.steer) * Math.min(1, 10 * dt);
  if (Math.abs(vf) > 4) car.angle += car.steer * dt * Math.sign(vf);

  // Recompute axes after the turn, then rebuild the velocity: forward
  // speed is the updated vf, lateral velocity is the old velocity's
  // component across the new heading, damped by grip (the handbrake drops
  // grip, so the car slides instead of gripping).
  const fx2 = Math.cos(car.angle);
  const fy2 = Math.sin(car.angle);
  const rx2 = -fy2;
  const ry2 = fx2;
  const grip = input.handbrake ? CAR_HANDBRAKE_GRIP : CAR_GRIP;
  const vr = (car.vx * rx2 + car.vy * ry2) * Math.exp(-grip * dt);
  car.vx = fx2 * vf + rx2 * vr;
  car.vy = fy2 * vf + ry2 * vr;
  car.speed = vf;

  const nx = car.x + car.vx * dt;
  const ny = car.y + car.vy * dt;
  const dist = Math.hypot(nx - car.x, ny - car.y);

  const hit = circleHitsBuilding(city, nx, ny, car.length * 0.42);
  if (hit) {
    // Bounce off the wall: keep some speed, lose some, take damage
    // (unless this car is built to take wall bumps, like a police cruiser).
    car.vx *= -0.32;
    car.vy *= -0.32;
    car.speed *= -0.32;
    if (!car.noCrashDamage) {
      car.health = Math.max(0, car.health - Math.abs(car.speed) * 0.06 - 3);
    }
    car.x += fx2 * -8;
    car.y += fy2 * -8;
    return { dist: 0, crashed: true, skid: false };
  }
  car.x = nx;
  car.y = ny;
  clampToWorld(city, car, car.length * 0.42);
  const skidding = input.handbrake && Math.abs(car.speed) > 120;
  if (skidding) car.smoke = Math.min(1, car.smoke + dt * 2);
  else car.smoke = Math.max(0, car.smoke - dt);
  car.brakeLight = input.throttle < 0 && car.speed > 5;
  return { dist, crashed: false, skid: skidding };
}

// Simple circle-ish collision between two cars: push apart, swap some speed.
// A non-finite separation (a corrupted car) never collides: one bad car
// must not infect another through this contact.
export function collideCars(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const minDist = (a.length + b.length) * 0.36;
  if (!Number.isFinite(dist) || dist >= minDist || dist < 0.01) return false;
  const push = (minDist - dist) / 2;
  const nx = dx / dist;
  const ny = dy / dist;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const rel = Math.abs(a.speed - b.speed);
  if (rel > 60) {
    a.health = Math.max(0, a.health - rel * 0.02);
    b.health = Math.max(0, b.health - rel * 0.02);
  }
  const tmp = a.speed;
  a.speed = b.speed * 0.5;
  b.speed = tmp * 0.5;
  return true;
}

// Face a target point smoothly (used by police pursuit steering).
export function steerToward(car, tx, ty, dt) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  const diff = ((want - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return clamp(diff * 2.2, -1, 1);
}

export function carFront(car) {
  return { x: car.x + Math.cos(car.angle) * (car.length / 2), y: car.y + Math.sin(car.angle) * (car.length / 2) };
}
