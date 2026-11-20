// The wanted system and the police who respond to it.
// Heat rises with crimes and falls when the player is unseen; stars are
// thresholds of heat. Police cruisers spawn at the road edge, chase, ram,
// and (at three stars and up) shoot. On foot, a touch means busted.

import {
  WANTED_HEAT_PER_STAR, WANTED_MAX_STARS, WANTED_DECAY_PER_SEC,
  WANTED_DECAY_HIDDEN_MULT, POLICE_SPAWN_DISTANCE, POLICE_MAX_ACTIVE,
  HEAT_STEAL_CAR, HEAT_SHOT_HEARD, HEAT_KILL_PED, HEAT_KILL_COP, HEAT_RAM_COP,
} from './config.js';
import { createCar, driveCar, steerToward, collideCars } from './vehicles.js';
import { randomRoadPoint, nearestRoad } from './city.js';
import { makeRng } from './rng.js';

export function createWanted() {
  return {
    heat: 0,
    stars: 0,
    cops: [], // police cars { car, state: 'chase'|'ram'|'stuck', stuckT }
    footCops: [], // police on foot at 3+ stars
    rng: makeRng(31337),
    bustedTimer: 0,
  };
}

export function wantedStars(wanted) {
  return Math.min(WANTED_MAX_STARS, Math.floor(wanted.heat / WANTED_HEAT_PER_STAR));
}

export function addHeat(wanted, amount, reason) {
  const before = wantedStars(wanted);
  wanted.heat = Math.min(WANTED_MAX_STARS * WANTED_HEAT_PER_STAR + 19, wanted.heat + amount);
  wanted.stars = wantedStars(wanted);
  return { before, after: wanted.stars, reason };
}

export const HEAT = {
  stealCar: HEAT_STEAL_CAR,
  shotHeard: HEAT_SHOT_HEARD,
  killPed: HEAT_KILL_PED,
  killCop: HEAT_KILL_COP,
  ramCop: HEAT_RAM_COP,
};

// Decay while no police can see the player; faster when fully hidden.
export function decayWanted(wanted, dt, seen) {
  if (wanted.heat <= 0) return;
  const rate = seen ? 0 : WANTED_DECAY_PER_SEC * (wanted.stars >= 3 ? 1 : WANTED_DECAY_HIDDEN_MULT);
  wanted.heat = Math.max(0, wanted.heat - rate * dt);
  wanted.stars = wantedStars(wanted);
}

// Can any active cop see the player? (line of sight, range, no building cut)
export function policeCanSee(wanted, city, px, py) {
  for (const c of wanted.cops) {
    const d = Math.hypot(c.car.x - px, c.car.y - py);
    if (d < 520) return true;
  }
  for (const f of wanted.footCops) {
    const d = Math.hypot(f.x - px, f.y - py);
    if (d < 420) return true;
  }
  return false;
}

function spawnCopCar(wanted, city, px, py) {
  const p = randomRoadPoint(city, wanted.rng, px, py, POLICE_SPAWN_DISTANCE);
  const car = createCar('police', p.x, p.y, wanted.rng.range(0, Math.PI * 2));
  car.driver = 'police';
  car.vx = 0;
  car.vy = 0;
  return { car, state: 'chase', stuckT: 0, shootT: 0 };
}

function spawnFootCop(wanted, city, px, py) {
  const p = randomRoadPoint(city, wanted.rng, px, py, 420);
  return {
    x: p.x, y: p.y, angle: 0, health: 50, speed: 210,
    fireT: 1 + wanted.rng.next(), state: 'chase', dead: false,
  };
}

export function maintainPolice(wanted, city, px, py) {
  const target = POLICE_MAX_ACTIVE[wanted.stars] || 0;
  wanted.cops = wanted.cops.filter((c) => c.car.health > 0);
  while (wanted.cops.length < target) {
    wanted.cops.push(spawnCopCar(wanted, city, px, py));
  }
  // Foot cops only at three stars and up, at most two.
  wanted.footCops = wanted.footCops.filter((f) => !f.dead);
  const footTarget = wanted.stars >= 3 ? Math.min(2, wanted.stars - 2) : 0;
  while (wanted.footCops.length < footTarget) {
    wanted.footCops.push(spawnFootCop(wanted, city, px, py));
  }
  // Standing down: when the heat is gone, the remaining cops drive off.
  if (wanted.stars === 0) {
    wanted.cops.length = 0;
    wanted.footCops.length = 0;
  }
}

// Nearest road centreline to a coordinate (the grid the pursuit follows).
function snapToCentre(city, v) {
  let best = city.centers[0];
  let bd = Infinity;
  for (const c of city.centers) {
    const d = Math.abs(v - c);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

// One step of pursuit. Returns events: { type: 'ram'|'shoot', ... }.
export function updatePolice(wanted, dt, city, player, playerCar, onShoot) {
  const events = [];
  const tx = playerCar ? playerCar.x : player.x;
  const ty = playerCar ? playerCar.y : player.y;

  for (const c of wanted.cops) {
    const car = c.car;
    // Pursuit follows the road grid: aim at the intersection nearest the
    // player, so the cruiser drives streets instead of cutting through
    // buildings on a straight line. Close in, ram straight at the target.
    const ix = snapToCentre(city, tx);
    const iy = snapToCentre(city, ty);
    const distToIntersection = Math.hypot(ix - car.x, iy - car.y);
    const wx = distToIntersection > 90 ? ix : tx;
    const wy = distToIntersection > 90 ? iy : ty;
    const steer = steerToward(car, wx, wy, dt);
    const dist = Math.hypot(tx - car.x, ty - car.y);
    const throttle = dist > 60 ? 1 : 0.4;
    const res = driveCar(car, { throttle, steer, handbrake: false }, dt, city);
    // Stay on the road: cruisers chase along the street grid instead of
    // grinding through buildings on a straight line to the player.
    const road = nearestRoad(city, car.x, car.y);
    if (road.dist > 26) {
      const pull = road.axis === 'h' ? (road.line - car.y) : (road.line - car.x);
      if (road.axis === 'h') car.y += Math.sign(pull) * Math.min(Math.abs(pull), 140 * dt);
      else car.x += Math.sign(pull) * Math.min(Math.abs(pull), 140 * dt);
    }
    if (res.crashed) {
      c.stuckT += dt;
      if (c.stuckT > 1.2) {
        // Reverse out of the wall, then resume the chase.
        car.angle += Math.PI * 0.5;
        c.stuckT = 0;
      }
    } else {
      c.stuckT = 0;
    }
    // Ram the player's car on contact.
    if (playerCar) {
      const hit = collideCars(car, playerCar);
      if (hit && Math.abs(car.speed) > 80) {
        events.push({ type: 'ram', x: playerCar.x, y: playerCar.y, from: 'cop' });
      }
    } else if (dist < 30) {
      // A cruiser touching the player on foot is a bust.
      events.push({ type: 'bust', x: player.x, y: player.y });
    }
    // At three stars and up, cops shoot from the car window.
    if (wanted.stars >= 3) {
      c.shootT -= dt;
      if (c.shootT <= 0 && dist < 520) {
        c.shootT = 1.1 + wanted.rng.next() * 0.8;
        const angle = Math.atan2(ty - car.y, tx - car.x) + (wanted.rng.next() - 0.5) * 0.3;
        onShoot({ x: car.x, y: car.y, angle, damage: 6, from: 'cop' });
        events.push({ type: 'copShot', x: car.x, y: car.y });
      }
    }
  }

  // Foot cops chase on foot and shoot at close range.
  for (const f of wanted.footCops) {
    if (f.dead) continue;
    const dx = tx - f.x;
    const dy = ty - f.y;
    const d = Math.hypot(dx, dy);
    if (d > 60) {
      f.angle = Math.atan2(dy, dx);
      f.x += Math.cos(f.angle) * f.speed * dt;
      f.y += Math.sin(f.angle) * f.speed * dt;
    }
    f.fireT -= dt;
    if (f.fireT <= 0 && d < 460) {
      f.fireT = 1.3 + wanted.rng.next();
      const angle = Math.atan2(dy, dx) + (wanted.rng.next() - 0.5) * 0.24;
      onShoot({ x: f.x, y: f.y, angle, damage: 6, from: 'cop' });
    }
    if (!playerCar && d < 26) {
      events.push({ type: 'bust', x: player.x, y: player.y });
    }
  }
  return events;
}

export function clearWanted(wanted) {
  wanted.heat = 0;
  wanted.stars = 0;
  wanted.cops.length = 0;
  wanted.footCops.length = 0;
}
