// Deterministic screenshot scenes (?shot=<name>&seed=<n>).
// Each scene stages a composed, readable frame of the game: the start
// screen, driving downtown, a police chase, and a mission in progress.
// Scenes are fixed compositions (the seed only jitters traffic a little),
// so every capture shows the same open world at its best.

import { createCar } from './vehicles.js';
import { startMission, missionDefs } from './missions.js';
import { addHeat } from './police.js';

function clearWorld(game) {
  game.traffic.cars.length = 0;
  game.traffic.peds.length = 0;
  game.wanted.cops.length = 0;
  game.wanted.footCops.length = 0;
  game.missions.enemies.length = 0;
  // Keep the player's car; remove other parked cars.
  game.cars = game.cars.filter((c) => c === game.playerCar);
}

function addTrafficCar(game, type, x, y, angle, speed) {
  const car = createCar(type, x, y, angle);
  car.driver = 'traffic';
  car.speed = speed || 170;
  car.vx = Math.cos(angle) * car.speed;
  car.vy = Math.sin(angle) * car.speed;
  car.cruiseSpeed = car.speed;
  game.traffic.cars.push(car);
  return car;
}

function addPed(game, x, y, angle) {
  game.traffic.peds.push({
    x, y, angle: angle || 0, speed: 60,
    shirt: '#e8b64c', state: 'walk', stateT: 0, retargetT: 5, tx: x + 80, ty: y,
  });
}

function putPlayerInCar(game, type, x, y, angle, speed) {
  const car = createCar(type, x, y, angle);
  car.driver = 'player';
  car.speed = speed || 0;
  car.vx = Math.cos(angle) * car.speed;
  car.vy = Math.sin(angle) * car.speed;
  game.cars.push(car);
  game.player.inCar = car;
  game.playerCar = car;
  game.player.x = x;
  game.player.y = y;
  return car;
}

function startMissionById(game, id) {
  const def = missionDefs().find((d) => d.id === id);
  if (!def) return;
  startMission(game.missions, def);
  // Advance "First Fare" past the get-in-a-car step for the driving shots.
  if (id === 'first-fare') {
    game.missions.current.stepIndex = 1;
    game.missions.current.step = { ...def.steps[1], x: 1950, y: 3480 };
  }
}

function snapCamera(game) {
  const fx = game.playerCar ? game.playerCar.x : game.player.x;
  const fy = game.playerCar ? game.playerCar.y : game.player.y;
  game.camera.x = fx;
  game.camera.y = fy;
}

export function applyShot(game, name) {
  game.shotName = name;
  game.clockHours = 10.5;
  game.state = 'playing';
  switch (name) {
    case 'start': {
      // The title screen over the city at dawn.
      game.state = 'menu';
      game.clockHours = 8.0;
      game.camera.x = 1800;
      game.camera.y = 1800;
      break;
    }
    case 'drive': {
      // Downtown drive: Maya in a taxi on the 1350 road, traffic, pedestrians, mission marker.
      clearWorld(game);
      game.clockHours = 10.5;
      putPlayerInCar(game, 'taxi', 1500, 1350, 0, 260);
      addTrafficCar(game, 'sedan', 1950, 1350, 0, 180);
      addTrafficCar(game, 'van', 2100, 1366, Math.PI, 160);
      addTrafficCar(game, 'sport', 1650, 1050, Math.PI / 2, 220);
      addTrafficCar(game, 'sedan', 1950, 1200, Math.PI / 2, 170);
      addPed(game, 1500, 1304, 0);
      addPed(game, 1560, 1396, Math.PI);
      addPed(game, 1440, 1396, 0.5);
      addPed(game, 1700, 1304, -0.5);
      startMissionById(game, 'first-fare');
      game.shotAutoDrive = { throttle: 0.55, steer: 0 };
      snapCamera(game);
      break;
    }
    case 'chase': {
      // Three-star police pursuit: sports car on the 1650 road, two cruisers behind, dusk.
      clearWorld(game);
      game.clockHours = 18.5;
      putPlayerInCar(game, 'sport', 1650, 1650, 0, 420);
      addTrafficCar(game, 'sedan', 1950, 1950, Math.PI, 150);
      addTrafficCar(game, 'taxi', 1950, 1800, Math.PI / 2, 170);
      addPed(game, 1750, 1604, 0);
      addPed(game, 1850, 1696, Math.PI);
      startMissionById(game, 'first-fare');
      // 70 heat = 3 stars, with room to stay 3 stars through the capture
      // even if the cruisers briefly lose sight of Maya.
      addHeat(game.wanted, 70, 'shot');
      game.wanted.stars = 3;
      const cop1 = createCar('police', 1470, 1650, 0);
      cop1.driver = 'police';
      cop1.speed = 380;
      cop1.vx = 380;
      cop1.vy = 0;
      game.wanted.cops.push({ car: cop1, state: 'chase', stuckT: 0, shootT: 0.5 });
      const cop2 = createCar('police', 1410, 1634, 0);
      cop2.driver = 'police';
      cop2.speed = 360;
      cop2.vx = 360;
      cop2.vy = 0;
      game.wanted.cops.push({ car: cop2, state: 'chase', stuckT: 0, shootT: 1.2 });
      game.shotAutoDrive = { throttle: 1, steer: 0 };
      snapCamera(game);
      break;
    }
    case 'mission': {
      // Payback: Maya on foot at the Harbor Docks, gunmen in front of her.
      clearWorld(game);
      game.clockHours = 14.0;
      game.player.x = 3220;
      game.player.y = 1950;
      game.player.angle = 0;
      game.player.inCar = null;
      game.playerCar = null;
      const def = missionDefs().find((d) => d.id === 'payback');
      startMission(game.missions, def);
      // Skip to the fight step and stage the crew in view, on the road.
      game.missions.current.stepIndex = 1;
      game.missions.current.step = { ...def.steps[1], x: 3370, y: 1950 };
      game.missions.enemies = [
        { x: 3390, y: 1922, angle: Math.PI, health: 40, fireT: 1.5, dead: false, kind: 'gunman' },
        { x: 3440, y: 1978, angle: Math.PI, health: 40, fireT: 2.2, dead: false, kind: 'gunman' },
        { x: 3490, y: 1928, angle: Math.PI, health: 25, fireT: 0.8, dead: false, kind: 'gunman' },
        { x: 3530, y: 1972, angle: Math.PI, health: 40, fireT: 2.8, dead: false, kind: 'gunman' },
        { x: 3360, y: 1962, angle: Math.PI, health: 40, fireT: 1.1, dead: false, kind: 'gunman' },
      ];
      addTrafficCar(game, 'truck', 3150, 2100, Math.PI / 2, 0);
      addPed(game, 3220, 1996, Math.PI);
      snapCamera(game);
      break;
    }
    default:
      break;
  }
}
