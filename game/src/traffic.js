// Traffic and pedestrians: the city feels alive. Traffic cars drive the road
// graph (lane offset, slow at intersections, despawn far from the camera);
// pedestrians walk the sidewalks and scatter when a car or a gunshot comes
// close. Spawning is bounded and camera-relative, so the count stays flat.

import { TRAFFIC_TARGET_COUNT, PED_TARGET_COUNT, TRAFFIC_SPAWN_DISTANCE, TRAFFIC_DESPAWN_DISTANCE, PALETTE } from './config.js';
import { createCar, driveCar, collideCars, steerToward } from './vehicles.js';
import { nearestRoad, randomRoadPoint, isInWater } from './city.js';
import { makeRng } from './rng.js';

const TRAFFIC_TYPES = ['sedan', 'sedan', 'taxi', 'van', 'truck', 'sport'];

export function createTraffic(city) {
  return {
    city,
    cars: [], // traffic cars (driver: 'traffic')
    peds: [], // pedestrians
    rng: makeRng(777),
  };
}

function spawnTrafficCar(traffic, fx, fy) {
  const city = traffic.city;
  const p = randomRoadPoint(city, traffic.rng, fx, fy, TRAFFIC_SPAWN_DISTANCE * 0.6);
  const road = nearestRoad(city, p.x, p.y);
  // Align to the road axis, offset into the right-hand lane.
  let angle;
  let x = p.x;
  let y = p.y;
  if (road.axis === 'h') {
    angle = traffic.rng.chance(0.5) ? 0 : Math.PI;
    y = road.line + (angle === 0 ? 16 : -16);
  } else {
    angle = traffic.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
    x = road.line + (angle === Math.PI / 2 ? -16 : 16);
  }
  const car = createCar(traffic.rng.pick(TRAFFIC_TYPES), x, y, angle);
  car.driver = 'traffic';
  car.speed = traffic.rng.range(140, 220);
  car.vx = Math.cos(angle) * car.speed;
  car.vy = Math.sin(angle) * car.speed;
  car.cruiseSpeed = car.speed;
  car.turnAt = null;
  return car;
}

function spawnPed(traffic, fx, fy) {
  const city = traffic.city;
  const p = randomRoadPoint(city, traffic.rng, fx, fy, 300);
  return {
    x: p.x + traffic.rng.range(-30, 30),
    y: p.y + traffic.rng.range(-30, 30),
    angle: traffic.rng.range(0, Math.PI * 2),
    speed: traffic.rng.range(40, 80),
    shirt: traffic.rng.pick(PALETTE.pedShirt),
    state: 'walk', // walk | flee | down
    stateT: 0,
    retargetT: traffic.rng.range(0, 4),
    tx: p.x, ty: p.y,
  };
}

// Keep the counts near their targets, spawning near the camera.
export function maintainPopulation(traffic, fx, fy) {
  const city = traffic.city;
  traffic.cars = traffic.cars.filter((c) => {
    const d = Math.hypot(c.x - fx, c.y - fy);
    return d < TRAFFIC_DESPAWN_DISTANCE && c.health > 0;
  });
  traffic.peds = traffic.peds.filter((p) => {
    const d = Math.hypot(p.x - fx, p.y - fy);
    return d < TRAFFIC_DESPAWN_DISTANCE && p.state !== 'down';
  });
  while (traffic.cars.length < TRAFFIC_TARGET_COUNT) {
    traffic.cars.push(spawnTrafficCar(traffic, fx, fy));
  }
  while (traffic.peds.length < PED_TARGET_COUNT) {
    traffic.peds.push(spawnPed(traffic, fx, fy));
  }
}

// One traffic step: lane driving with intersection turns and car-car bumps.
export function updateTraffic(traffic, dt, playerCar, player) {
  const city = traffic.city;
  for (const car of traffic.cars) {
    const road = nearestRoad(city, car.x, car.y);
    // At an intersection, sometimes turn onto the crossing road.
    const nearX = Math.abs(car.x - Math.round(car.x / 300) * 300) < 40;
    const onIntersection = road.dist < 40;
    if (onIntersection && !car.turnAt) {
      car.turnAt = traffic.rng.range(0.4, 1.2);
      if (traffic.rng.chance(0.35)) {
        // Turn: aim along the crossing axis, keep the lane offset.
        const vertical = road.axis === 'h';
        car.targetAngle = vertical ? (traffic.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (traffic.rng.chance(0.5) ? 0 : Math.PI);
      }
    }
    if (car.turnAt) {
      car.turnAt -= dt;
      if (car.targetAngle !== undefined) {
        const diff = ((car.targetAngle - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
        if (Math.abs(diff) < 0.08) { car.targetAngle = undefined; car.turnAt = 0; }
      } else if (car.turnAt <= 0) {
        car.turnAt = null;
      }
    }
    // Slow for the car ahead on the same road.
    let targetSpeed = car.cruiseSpeed;
    for (const other of traffic.cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
      const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
      if (ahead > 0 && ahead < 90 && side < 26) { targetSpeed = Math.min(targetSpeed, 40); break; }
    }
    // And for the player's car right in front.
    if (playerCar) {
      const dx = playerCar.x - car.x;
      const dy = playerCar.y - car.y;
      const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
      const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
      if (ahead > 0 && ahead < 80 && side < 26) targetSpeed = Math.min(targetSpeed, 30);
    }
    // Ease toward the target speed, then roll forward on the road.
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    const vf = car.vx * fx + car.vy * fy;
    const nvf = vf + (targetSpeed - vf) * Math.min(1, 1.6 * dt);
    car.vx = fx * nvf;
    car.vy = fy * nvf;
    car.speed = nvf;
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    // Stay on the road: if pushed off, steer back toward the centreline.
    const r2 = nearestRoad(city, car.x, car.y);
    if (r2.dist > 26) {
      const pull = r2.axis === 'h' ? (r2.line - car.y) : (r2.line - car.x);
      if (r2.axis === 'h') car.y += Math.sign(pull) * Math.min(Math.abs(pull), 60 * dt);
      else car.x += Math.sign(pull) * Math.min(Math.abs(pull), 60 * dt);
    }
  }
  // Car-car bumps (traffic vs traffic, traffic vs player car).
  const all = playerCar ? [...traffic.cars, playerCar] : traffic.cars;
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      collideCars(all[i], all[j]);
    }
  }
}

// Pedestrians: stroll the sidewalks, flee from danger.
export function updatePeds(traffic, dt, danger) {
  // danger: { x, y, radius } — a gunshot, a crash, a speeding car.
  for (const p of traffic.peds) {
    p.stateT -= dt;
    p.retargetT -= dt;
    if (p.state === 'flee') {
      p.x += Math.cos(p.angle) * 190 * dt;
      p.y += Math.sin(p.angle) * 190 * dt;
      if (p.stateT <= 0) p.state = 'walk';
    } else {
      if (danger) {
        const d = Math.hypot(p.x - danger.x, p.y - danger.y);
        if (d < danger.radius) {
          p.state = 'flee';
          p.stateT = 1.6 + Math.random() * 1.4;
          p.angle = Math.atan2(p.y - danger.y, p.x - danger.x);
          continue;
        }
      }
      if (p.retargetT <= 0) {
        // Pick a nearby sidewalk point to stroll toward.
        const road = nearestRoad(traffic.city, p.x, p.y);
        const along = (Math.random() - 0.5) * 500;
        if (road.axis === 'h') {
          p.tx = p.x + along;
          p.ty = road.line + (Math.random() < 0.5 ? 46 : -46);
        } else {
          p.tx = road.line + (Math.random() < 0.5 ? 46 : -46);
          p.ty = p.y + along;
        }
        p.retargetT = 3 + Math.random() * 4;
      }
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 8) {
        p.angle = Math.atan2(dy, dx);
        p.x += Math.cos(p.angle) * p.speed * dt;
        p.y += Math.sin(p.angle) * p.speed * dt;
      }
    }
    if (isInWater(traffic.city, p.x, p.y)) {
      p.y = traffic.city.seaY - 14;
    }
  }
}

// A pedestrian near a point (for taxi pickup, melee targets, stray bullets).
export function nearestPed(traffic, x, y, maxDist) {
  let best = null;
  let bd = maxDist;
  for (const p of traffic.peds) {
    if (p.state === 'down') continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
