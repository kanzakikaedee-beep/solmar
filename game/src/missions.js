// Missions and story: a data-driven chain with a state machine.
// Each mission is data (title, briefing, steps, payout); the manager runs
// the current step, checks its completion, and pays exactly once. Rewards
// are idempotent, and a failed mission can be retried from its first step.

import { makeRng } from './rng.js';
import { nearestRoad } from './city.js';

// Mission steps reference named places in the city (x, y set at start).
const MISSION_DEFS = [
  {
    id: 'first-fare',
    title: 'First Fare',
    payout: 500,
    briefing: [
      'ROOK: Maya. You owe me, and I collect. Drive my client to the Marina.',
      'ROOK: Get in any car and follow the yellow marker. No detours.',
    ],
    steps: [
      { type: 'enterCar', label: 'Get in a car', x: 0, y: 0, radius: 0 },
      { type: 'driveTo', label: 'Drive the client to the Marina', place: 'pier', radius: 90 },
    ],
  },
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    payout: 800,
    briefing: [
      'ROOK: A red sports car is parked at the Downtown lot. It is not theirs anymore.',
      'ROOK: Bring it to my garage in one piece. The owner will notice. So will the cops.',
    ],
    steps: [
      { type: 'goto', label: 'Go to the Downtown lot', place: 'tower', radius: 120 },
      { type: 'stealCar', label: 'Steal the red sports car', place: 'tower', radius: 60 },
      { type: 'deliverCar', label: 'Deliver it to Rook\'s Garage', place: 'garageNorth', radius: 90 },
    ],
  },
  {
    id: 'payback',
    title: 'Payback',
    payout: 1200,
    briefing: [
      'ROOK: The Dock crew skimmed my cut. Five of them are at the Harbor Docks.',
      'ROOK: Settle it. Bring a gun — or your fists, if you are feeling brave.',
    ],
    steps: [
      { type: 'goto', label: 'Go to the Harbor Docks', place: 'docks', radius: 130 },
      { type: 'kill', label: 'Take out the Dock crew (0/5)', place: 'docks', radius: 200, count: 5, kind: 'gunman' },
    ],
  },
  {
    id: 'getaway',
    title: 'Getaway',
    payout: 1500,
    briefing: [
      'ROOK: The cops got a tip. Three stars, Maya, and they are already rolling.',
      'ROOK: Lose them and get to the Safehouse. Do not lead them to my door.',
    ],
    steps: [
      { type: 'escape', label: 'Lose the heat, then reach the Safehouse', place: 'safehouse', radius: 90 },
    ],
  },
  {
    id: 'the-drop',
    title: 'The Drop',
    payout: 2000,
    briefing: [
      'ROOK: A package, Old Town, ninety seconds. The buyer does not wait.',
      'ROOK: Drive like the rent is due. Because it is.',
    ],
    steps: [
      { type: 'goto', label: 'Pick up the package', place: 'cityHall', radius: 80 },
      { type: 'timed', label: 'Deliver to Old Town', place: 'hospital', radius: 90, timeLimit: 90 },
    ],
  },
  {
    id: 'king-of-solmar',
    title: 'King of Solmar',
    payout: 5000,
    briefing: [
      'ROOK: Last job. An armored truck at the Docks, four stars of heat, one pier.',
      'ROOK: Pull this off and your debt is gone. You will be the king of Solmar.',
    ],
    steps: [
      { type: 'stealCar', label: 'Steal the armored truck', place: 'docks', radius: 70 },
      { type: 'deliverCar', label: 'Lose the heat and deliver it to the Pier', place: 'pier', radius: 100, needStars: 0 },
    ],
  },
];

export function missionDefs() {
  return MISSION_DEFS;
}

export function createMissionManager(city) {
  const rng = makeRng(20261120);
  return {
    city,
    rng,
    current: null, // { def, stepIndex, step, timer, kills, targetCar, enemies }
    enemies: [], // mission gunmen { x, y, angle, health, fireT, dead, kind }
    targetCar: null, // the car a steal/deliver step points at
    dialogue: [], // lines waiting to be shown [{ text, who }]
    startedHeat: 0,
  };
}

function placeOf(manager, step) {
  if (!step.place) return { x: 0, y: 0 };
  const lm = manager.city.landmarks[step.place];
  if (lm) return { x: lm.x, y: lm.y };
  if (step.place === 'pier') return { x: manager.city.pier.x + 30, y: manager.city.pier.y + 120 };
  return { x: 0, y: 0 };
}

function spawnGunmen(manager, x, y, count) {
  manager.enemies = [];
  for (let i = 0; i < count; i++) {
    manager.enemies.push({
      x: x + manager.rng.range(-120, 120),
      y: y + manager.rng.range(-120, 120),
      angle: 0,
      health: 40,
      fireT: 1 + manager.rng.next() * 1.5,
      dead: false,
      kind: 'gunman',
    });
  }
}

function spawnTargetCar(manager, step, type) {
  // Park the target car on the nearest road to the step's place, never
  // inside a building: the marker must point at a car Maya can reach.
  const p = placeOf(manager, step);
  const road = nearestRoad(manager.city, p.x, p.y);
  const x = road.axis === 'h' ? p.x : road.line;
  const y = road.axis === 'h' ? road.line : p.y;
  return { type, x, y, angle: road.axis === 'h' ? 0 : Math.PI / 2 };
}

export function startMission(manager, def) {
  manager.current = {
    def,
    stepIndex: 0,
    step: null,
    timer: 0,
    kills: 0,
    status: 'active',
  };
  manager.enemies = [];
  manager.targetCar = null;
  manager.dialogue = def.briefing.map((text) => ({ text, who: 'ROOK' }));
  advanceStep(manager);
  return manager.current;
}

function advanceStep(manager) {
  const cur = manager.current;
  if (!cur) return;
  const step = cur.def.steps[cur.stepIndex];
  if (!step) {
    cur.status = 'done';
    return;
  }
  const p = placeOf(manager, step);
  cur.step = { ...step, x: p.x, y: p.y };
  cur.timer = step.timeLimit || 0;
  cur.kills = 0;
  if (step.type === 'kill') {
    spawnGunmen(manager, p.x, p.y, step.count);
  }
  if (step.type === 'stealCar') {
    const type = cur.def.id === 'king-of-solmar' ? 'truck' : 'sport';
    manager.targetCar = spawnTargetCar(manager, step, type);
    cur.step.targetType = type;
    // Point the marker at the car itself, not at the named place.
    cur.step.x = manager.targetCar.x;
    cur.step.y = manager.targetCar.y;
  }
}

export function abandonMission(manager) {
  manager.current = null;
  manager.enemies = [];
  manager.targetCar = null;
}

// One step. ctx: { player, playerCar, cars, wanted, dt, onEvent }.
// Returns events: { type: 'stepDone'|'missionDone'|'missionFailed'|'dialogue', ... }.
export function updateMission(manager, ctx) {
  const events = [];
  const cur = manager.current;
  if (!cur || cur.status !== 'active') return events;
  const step = cur.step;
  const dt = ctx.dt;
  if (step.timeLimit) {
    cur.timer -= dt;
    if (cur.timer <= 0) {
      cur.status = 'failed';
      events.push({ type: 'missionFailed', reason: 'Out of time.' });
      return events;
    }
  }
  const px = ctx.playerCar ? ctx.playerCar.x : ctx.player.x;
  const py = ctx.playerCar ? ctx.playerCar.y : ctx.player.y;
  const dist = Math.hypot(px - step.x, py - step.y);

  function stepDone(label) {
    cur.stepIndex += 1;
    events.push({ type: 'stepDone', label: label || step.label });
    if (cur.stepIndex >= cur.def.steps.length) {
      cur.status = 'done';
      events.push({ type: 'missionDone', mission: cur.def });
    } else {
      advanceStep(manager);
    }
  }

  switch (step.type) {
    case 'goto':
      if (dist < step.radius) stepDone();
      break;
    case 'enterCar':
      if (ctx.playerCar) stepDone();
      break;
    case 'driveTo':
      if (ctx.playerCar && dist < step.radius) stepDone();
      break;
    case 'stealCar':
      if (ctx.playerCar && ctx.playerCar.missionTarget) stepDone();
      break;
    case 'deliverCar': {
      const ok = ctx.playerCar && ctx.playerCar.missionTarget && dist < step.radius;
      const heatOk = step.needStars === undefined || ctx.wanted.stars <= step.needStars;
      if (ok && heatOk) stepDone();
      break;
    }
    case 'kill': {
      const left = manager.enemies.filter((e) => !e.dead).length;
      cur.step.label = 'Take out the Dock crew (' + (step.count - left) + '/' + step.count + ')';
      if (left === 0) stepDone();
      break;
    }
    case 'escape':
      if (dist < step.radius && ctx.wanted.stars === 0) stepDone();
      break;
    case 'timed':
      if (dist < step.radius) stepDone();
      break;
    default:
      break;
  }
  return events;
}

// Mission gunmen think: approach the player and shoot.
export function updateMissionEnemies(manager, dt, player, playerCar, onShoot) {
  const tx = playerCar ? playerCar.x : player.x;
  const ty = playerCar ? playerCar.y : player.y;
  for (const e of manager.enemies) {
    if (e.dead) continue;
    const dx = tx - e.x;
    const dy = ty - e.y;
    const d = Math.hypot(dx, dy);
    if (d > 90) {
      e.angle = Math.atan2(dy, dx);
      e.x += Math.cos(e.angle) * 150 * dt;
      e.y += Math.sin(e.angle) * 150 * dt;
    } else {
      e.angle = Math.atan2(dy, dx);
    }
    e.fireT -= dt;
    if (e.fireT <= 0 && d < 480) {
      e.fireT = 1.2 + Math.random() * 0.9;
      onShoot({ x: e.x, y: e.y, angle: e.angle + (Math.random() - 0.5) * 0.26, damage: 7, from: 'enemy' });
    }
  }
}

export function missionObjective(manager) {
  const cur = manager.current;
  if (!cur || cur.status !== 'active') return null;
  return {
    title: cur.def.title,
    label: cur.step.label,
    x: cur.step.x,
    y: cur.step.y,
    timer: cur.step.timeLimit ? cur.timer : null,
    stepIndex: cur.stepIndex + 1,
    stepCount: cur.def.steps.length,
  };
}
