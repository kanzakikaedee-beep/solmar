// SOLMAR — main loop and wiring.
// Owns the game object, the state machine (menu / playing / paused /
// busted / wasted / story), and the per-frame update + render. Every
// system (city, traffic, police, missions, combat, HUD) is a module with
// one job; this file only connects them.

import {
  VIEW_WIDTH, VIEW_HEIGHT, WORLD_SIZE,
  PLAYER_MAX_HEALTH, PISTOL_MAGAZINE, PISTOL_RELOAD_TIME,
  CAR_MAX_SPEED, CAMERA_ZOOM_FOOT, CAMERA_ZOOM_DRIVE, CAMERA_LOOKAHEAD,
  BUST_CASH_LOSS, PAYNSPRAY_COST,
  HEAT_STEAL_CAR, HEAT_SHOT_HEARD, HEAT_KILL_PED, HEAT_KILL_COP, HEAT_RAM_COP,
} from './config.js';
import { generateCity, randomRoadPoint, nearestRoad } from './city.js';
import { makeRng, clamp } from './rng.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { createProgress } from './progress.js';
import { createCar, driveCar, collideCars } from './vehicles.js';
import { createPlayer, updatePlayerOnFoot, playerTryShoot, playerTryMelee, playerTakeDamage } from './player.js';
import { createCombat, spawnBullet, updateBullets, resolveMelee } from './combat.js';
import { createTraffic, maintainPopulation, updateTraffic, updatePeds, nearestPed } from './traffic.js';
import { createWanted, addHeat, decayWanted, policeCanSee, maintainPolice, updatePolice, clearWanted, wantedStars } from './police.js';
import { createMissionManager, missionDefs, startMission, abandonMission, updateMission, updateMissionEnemies, missionObjective } from './missions.js';
import { createCamera, updateCamera, drawWorld, drawMarker, drawCar, drawPed, drawPlayer, drawEnemy, drawBullets } from './render.js';
import { drawHUD, drawMinimap } from './hud.js';
import { drawStartScreen, drawPauseScreen, drawMissionBriefing, drawBanner, drawDialogue, drawEndCard, drawStoryComplete } from './ui.js';
import { applyShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const shotName = params.get('shot');

// ---------- boot ----------
const city = generateCity();
const input = createInput(canvas);
const audio = createAudio();
const effects = createEffects();
const camera = createCamera();

let savedData = null;
const loaded = loadGame();
if (loaded.ok) savedData = loaded.data;

const progress = createProgress(savedData);
const startPos = savedData && savedData.player
  ? { x: savedData.player.x, y: savedData.player.y, angle: savedData.player.angle || 0 }
  : { x: 780, y: 780, angle: 0 };

const game = {
  state: 'menu', // menu | playing | paused | busted | wasted | story
  time: 0,
  clockHours: 9.5,
  night: false,
  city, input, audio, effects, camera,
  player: createPlayer(startPos.x, startPos.y),
  playerCar: null,
  cars: [], // parked cars + mission target cars
  traffic: createTraffic(city),
  wanted: createWanted(),
  missions: createMissionManager(city),
  combat: createCombat(),
  progress,
  fare: null, // { ped, destX, destY, fare, state: 'offered'|'riding' }
  fareOfferT: 10,
  dialogue: [], // queue of { text, who }
  dialogueCurrent: null,
  dialogueT: 0,
  banner: null, // { text, sub, color, life }
  briefing: null, // mission def being offered
  briefingOpen: false,
  storyT: 0,
  zoom: 1,
  hasSave: hasSave(),
  shotName,
  shotAutoDrive: null,
  muted: false,
  autosaveT: 20,
  lastCarHitT: 0,
  lastRamHeatT: 0,
  rng: makeRng(999),
};
game.player.angle = startPos.angle;

// Parked cars: a mix of types at the lots and along the roads.
(function spawnParkedCars() {
  const rng = makeRng(555);
  const types = ['sedan', 'sedan', 'taxi', 'sport', 'van', 'truck', 'sedan', 'taxi'];
  for (let i = 0; i < 14; i++) {
    const p = randomRoadPoint(city, rng, 1800, 1800, 200);
    const road = nearestRoad(city, p.x, p.y);
    const angle = road.axis === 'h' ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
    const off = rng.range(-18, 18);
    const x = road.axis === 'h' ? p.x : road.line + off;
    const y = road.axis === 'h' ? road.line + off : p.y;
    const car = createCar(rng.pick(types), x, y, angle);
    car.driver = null;
    game.cars.push(car);
  }
})();

function showBanner(text, sub, color, life) {
  game.banner = { text, sub: sub || '', color: color || '#ffffff', life: life || 2.6 };
}

function say(text, who) {
  game.dialogue.push({ text, who: who || 'ROOK' });
}

function persist() {
  saveGame({
    cash: progress.cash,
    missionIndex: progress.state.missionIndex,
    completedMissions: progress.state.completedMissions,
    packagesCollected: progress.state.packagesCollected,
    stats: progress.state.stats,
    player: { x: game.player.x, y: game.player.y, angle: game.player.angle },
  });
}

function nextMissionDef() {
  const defs = missionDefs();
  const done = progress.state.completedMissions;
  return defs.find((d) => !done.includes(d.id)) || null;
}

function beginMission(def) {
  startMission(game.missions, def);
  for (const line of game.missions.dialogue) say(line.text, line.who);
  if (def.id === 'getaway') {
    addHeat(game.wanted, 60, 'getaway');
    say('Three stars and counting. Lose them, Maya.', 'ROOK');
  }
  game.missions.targetCarSpawned = false;
}

function failActiveMission(reason) {
  if (game.missions.current) {
    abandonMission(game.missions);
    removeTargetCar();
    showBanner('MISSION FAILED', reason || '', '#f87171');
    audio.missionFail();
  }
}

function removeTargetCar() {
  const tc = game.cars.find((c) => c.missionTarget);
  if (!tc) { game.missions.targetCar = null; game.missions.targetCarSpawned = false; return; }
  if (game.playerCar === tc) {
    tc.missionTarget = false; // Maya keeps the car she stole.
  } else {
    game.cars = game.cars.filter((c) => c !== tc);
  }
  game.missions.targetCar = null;
  game.missions.targetCarSpawned = false;
}

function spawnTargetCarIfNeeded() {
  const m = game.missions;
  if (!m.targetCar || m.targetCarSpawned) return;
  const car = createCar(m.targetCar.type, m.targetCar.x, m.targetCar.y, m.targetCar.angle);
  car.driver = null;
  car.missionTarget = true;
  game.cars.push(car);
  m.targetCarSpawned = true;
}

function doBusted() {
  if (game.state !== 'playing') return;
  const lost = Math.floor(progress.cash * BUST_CASH_LOSS);
  progress.addCash(-lost, 'busted');
  clearWanted(game.wanted);
  failActiveMission('Busted by the Solmar PD.');
  game.state = 'busted';
  game.endDetail = 'The PD took $' + lost.toLocaleString('en-US') + ' and your freedom — for now.';
  audio.busted();
  persist();
}

function doWasted() {
  if (game.state !== 'playing') return;
  const lost = Math.floor(progress.cash * BUST_CASH_LOSS);
  progress.addCash(-lost, 'wasted');
  clearWanted(game.wanted);
  failActiveMission('Maya did not make it.');
  game.state = 'wasted';
  game.endDetail = 'Hospital bill: $' + lost.toLocaleString('en-US') + '. The debt is still there.';
  audio.busted();
  persist();
}

function respawn() {
  const hospital = city.landmarks.hospital;
  game.player.x = hospital.x;
  game.player.y = hospital.y + 120;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.health = PLAYER_MAX_HEALTH;
  game.player.ammo = PISTOL_MAGAZINE;
  game.player.reloading = 0;
  if (game.playerCar) {
    game.playerCar.driver = null;
    game.playerCar = null;
    game.player.inCar = null;
  }
  game.state = 'playing';
  say('ROOK: You are alive. That is the good news. The debt is still the bad news.', 'ROOK');
}

function clockString() {
  const h = Math.floor(game.clockHours) % 24;
  const m = Math.floor((game.clockHours % 1) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// ---------- update ----------
function update(dt) {
  game.time += dt;
  game.clockHours = (game.clockHours + dt * (0.5 / 60)) % 24;
  game.night = game.clockHours >= 19 || game.clockHours < 6;

  if (input.mouse.clicked) audio.unlock();
  if (input.wasPressed('mute')) {
    game.muted = audio.toggleMute();
  }

  if (game.state === 'menu') {
    if (input.consumeAnyKey() || input.mouse.clicked) {
      game.state = 'playing';
      audio.unlock();
      audio.startMusic();
      say('ROOK: There you are. Rook\'s Garage, north side. Come see me.', 'ROOK');
    }
    return;
  }
  if (game.state === 'paused') {
    if (input.wasPressed('pause')) game.state = 'playing';
    return;
  }
  if (game.state === 'busted' || game.state === 'wasted') {
    if (input.consumeAnyKey() || input.mouse.clicked) respawn();
    return;
  }
  if (game.state === 'story') {
    if (input.consumeAnyKey() || input.mouse.clicked) game.state = 'playing';
    return;
  }

  // --- playing ---
  if (input.wasPressed('pause')) {
    game.state = 'paused';
    persist();
    return;
  }

  // Mission briefing overlay: the world freezes while Rook talks.
  if (game.briefingOpen) {
    if (input.wasPressed('interact')) {
      const def = game.briefing;
      game.briefing = null;
      game.briefingOpen = false;
      beginMission(def);
      audio.click();
    } else if (input.wasPressed('pause')) {
      game.briefing = null;
      game.briefingOpen = false;
    }
    return;
  }

  const player = game.player;
  const now = game.time;
  let danger = null;

  // Aim: mouse position in world coordinates.
  const mouseWorldX = camera.x + (input.mouse.x - VIEW_WIDTH / 2) / game.zoom;
  const mouseWorldY = camera.y + (input.mouse.y - VIEW_HEIGHT / 2) / game.zoom;
  const aimAngle = Math.atan2(mouseWorldY - player.y, mouseWorldX - player.x);

  // ---- player: in a car ----
  if (player.inCar) {
    const car = player.inCar;
    const axis = input.moveAxis();
    let throttle = 0;
    let steer = 0;
    if (axis.y < 0) throttle = 1;
    else if (axis.y > 0) throttle = -1;
    if (axis.x < 0) steer = -1;
    else if (axis.x > 0) steer = 1;
    if (game.shotAutoDrive) {
      throttle = game.shotAutoDrive.throttle;
      steer = game.shotAutoDrive.steer;
    }
    const res = driveCar(car, { throttle, steer, handbrake: input.isHeld('handbrake') }, dt, city);
    if (res.dist > 0) progress.recordDistance(res.dist);
    if (res.crashed) {
      audio.crash(0.6);
      effects.sparks(car.x, car.y, '#ffd23f', 8);
      effects.addShake(0.25);
      danger = { x: car.x, y: car.y, radius: 260 };
    }
    if (res.skid) {
      effects.smoke(car.x - Math.cos(car.angle) * 18, car.y - Math.sin(car.angle) * 18, 2);
    }
    audio.setEngine(Math.abs(car.speed) / (CAR_MAX_SPEED[car.type] || 540), true);
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;

    // Car destroyed: Maya is thrown out, hurt.
    if (car.health <= 0) {
      effects.explosion(car.x, car.y);
      audio.crash(1);
      game.cars = game.cars.filter((c) => c !== car);
      player.inCar = null;
      game.playerCar = null;
      playerTakeDamage(player, 25, now);
      showBanner('CAR DESTROYED', '', '#f87171');
    } else if (input.wasPressed('enterCar')) {
      // Step out beside the car.
      const side = Math.PI / 2;
      player.x = car.x + Math.cos(car.angle + side) * 30;
      player.y = car.y + Math.sin(car.angle + side) * 30;
      car.driver = null;
      player.inCar = null;
      game.playerCar = null;
      audio.carDoor();
      // Walking away from a fare cancels it.
      if (game.fare && game.fare.state === 'riding') {
        game.fare = null;
        game.fareOfferT = 8;
        say('The fare walked off. Rook will hear about this.', 'ROOK');
      }
    }
  } else {
    // ---- player: on foot ----
    audio.setEngine(0, false);
    const axis = input.moveAxis();
    const events = updatePlayerOnFoot(player, {
      axis, aimAngle, sprint: input.isHeld('sprint'),
    }, dt, city, now);
    for (const e of events) {
      if (e.type === 'reloaded') audio.click();
    }
    // Shoot (hold mouse).
    if (input.mouse.down) {
      const shot = playerTryShoot(player, now);
      if (shot && shot.type === 'bullet') {
        spawnBullet(game.combat, shot);
        progress.recordShot();
        audio.shoot();
        effects.muzzle(shot.x, shot.y, shot.angle);
        danger = { x: player.x, y: player.y, radius: 320 };
        // A cop in earshot hears the shot.
        for (const c of game.wanted.cops) {
          if (Math.hypot(c.car.x - player.x, c.car.y - player.y) < 600) {
            addHeat(game.wanted, HEAT_SHOT_HEARD, 'shot');
            break;
          }
        }
      } else if (shot && shot.type === 'dryfire') {
        audio.click();
      }
    }
    // Melee.
    if (input.wasPressed('melee')) {
      const swing = playerTryMelee(player);
      if (swing) {
        const hits = resolveMelee(swing, meleeTargets());
        if (hits.length > 0) {
          audio.crash(0.3);
          for (const h of hits) effects.hitPuff(h.x, h.y);
        }
      }
    }
    // Reload.
    if (input.wasPressed('reload') && player.ammo < PISTOL_MAGAZINE && player.reloading <= 0) {
      player.reloading = PISTOL_RELOAD_TIME;
    }
    // Enter a parked car.
    if (input.wasPressed('enterCar')) {
      let best = null;
      let bd = 70;
      for (const car of game.cars) {
        if (car.driver) continue;
        const d = Math.hypot(car.x - player.x, car.y - player.y);
        if (d < bd) { bd = d; best = car; }
      }
      if (best) {
        best.driver = 'player';
        player.inCar = best;
        game.playerCar = best;
        audio.carDoor();
        if (!best.missionTarget) {
          addHeat(game.wanted, HEAT_STEAL_CAR, 'steal');
          progress.recordStolenCar();
          effects.floatText(player.x, player.y - 30, 'CAR STOLEN', '#ffd23f');
        }
      }
    }
    // Interact: Rook, fare pickup, pay-n-spray.
    if (input.wasPressed('interact')) {
      const garage = city.landmarks.garageNorth;
      const next = nextMissionDef();
      if (!game.missions.current && next && Math.hypot(player.x - garage.x, player.y - garage.y) < 140) {
        game.briefing = next;
        game.briefingOpen = true;
        audio.click();
      }
    }
  }

  // In a car: interact handles fare pickup and pay-n-spray.
  if (player.inCar && input.wasPressed('interact')) {
    const car = player.inCar;
    // Pay-n-spray: repair and cool the heat for $200.
    const pns = city.landmarks.garageSouth;
    if (Math.hypot(car.x - pns.x, car.y - pns.y) < 110) {
      if (progress.cash >= PAYNSPRAY_COST) {
        progress.addCash(-PAYNSPRAY_COST, 'pay-n-spray');
        car.health = 100;
        game.wanted.heat = Math.max(0, game.wanted.heat - 20);
        game.wanted.stars = wantedStars(game.wanted);
        effects.floatText(car.x, car.y - 30, 'REPAIRED  -$200', '#7ee787');
        audio.pickup();
      } else {
        effects.floatText(car.x, car.y - 30, 'NEED $200', '#f87171');
      }
    }
    // Taxi fare pickup.
    if (game.fare && game.fare.state === 'offered') {
      const ped = game.fare.ped;
      if (Math.hypot(car.x - ped.x, car.y - ped.y) < 80) {
        game.fare.state = 'riding';
        game.fare.data.state = 'riding';
        ped.state = 'riding';
        audio.pickup();
        say('FARE: Take me to the marker, quick as you can.', 'FARE');
      }
    }
  }

  // Hidden packages: walk or drive over one to collect it.
  for (const pkg of progress.packages) {
    if (pkg.collected) continue;
    const d = Math.hypot(player.x - pkg.x, player.y - pkg.y);
    if (d < 34) {
      const got = progress.collectPackage(pkg);
      effects.floatText(pkg.x, pkg.y - 20, '+$' + got + ' PACKAGE', '#ffd23f');
      audio.cash();
      persist();
    }
  }

  // ---- traffic ----
  // In a screenshot scene the staged population stays exactly as staged:
  // no random spawns, no extra police.
  const fx = player.inCar ? player.inCar.x : player.x;
  const fy = player.inCar ? player.inCar.y : player.y;
  if (!game.shotName) maintainPopulation(game.traffic, fx, fy);
  updateTraffic(game.traffic, dt, game.playerCar, player);
  updatePeds(game.traffic, dt, danger);

  // Running over a pedestrian: it counts, and the cops notice.
  if (game.playerCar) {
    for (const ped of game.traffic.peds) {
      if (ped.state === 'down' || ped.state === 'riding') continue;
      if (Math.hypot(ped.x - game.playerCar.x, ped.y - game.playerCar.y) < 26 && Math.abs(game.playerCar.speed) > 60) {
        ped.state = 'down';
        addHeat(game.wanted, HEAT_KILL_PED, 'ped');
        effects.hitPuff(ped.x, ped.y);
        audio.crash(0.5);
      }
    }
    // A traffic car hitting Maya on foot hurts.
  } else {
    for (const car of game.traffic.cars) {
      if (Math.hypot(car.x - player.x, car.y - player.y) < 26 && Math.abs(car.speed) > 80 && now - game.lastCarHitT > 0.6) {
        game.lastCarHitT = now;
        playerTakeDamage(player, 12, now);
        effects.hitPuff(player.x, player.y);
        audio.crash(0.4);
        player.vx += (player.x - car.x) * 2;
        player.vy += (player.y - car.y) * 2;
      }
    }
  }

  // ---- police ----
  if (!game.shotName) maintainPolice(game.wanted, city, player.x, player.y);
  const policeEvents = updatePolice(game.wanted, dt, city, player, game.playerCar, (shot) => {
    spawnBullet(game.combat, shot);
  });
  for (const ev of policeEvents) {
    if (ev.type === 'ram') {
      audio.crash(0.7);
      effects.sparks(ev.x, ev.y, '#ffd23f', 10);
      effects.addShake(0.35);
    } else if (ev.type === 'bust') {
      doBusted();
    }
  }
  // Ramming a cop car adds heat — but only Maya's own ram counts: she must
  // be driving AT the cruiser, not merely being rammed by it.
  if (game.playerCar) {
    for (const c of game.wanted.cops) {
      const dx = c.car.x - game.playerCar.x;
      const dy = c.car.y - game.playerCar.y;
      const d = Math.hypot(dx, dy);
      if (d < 44 && Math.abs(game.playerCar.speed) > 150 && now - game.lastRamHeatT > 1) {
        const pvx = game.playerCar.vx || 0;
        const pvy = game.playerCar.vy || 0;
        const pSpeed = Math.hypot(pvx, pvy);
        const toward = pSpeed > 0 ? (pvx * dx + pvy * dy) / (pSpeed * Math.max(d, 1)) : 0;
        if (toward > 0.5) {
          game.lastRamHeatT = now;
          const res = addHeat(game.wanted, HEAT_RAM_COP, 'ram');
          if (res.after > res.before) {
            audio.wantedUp();
            showBanner(res.after + ' STAR' + (res.after > 1 ? 'S' : ''), 'The PD is not happy.', '#ffd23f', 1.6);
          }
        }
      }
    }
  }
  decayWanted(game.wanted, dt, policeCanSee(game.wanted, city, player.x, player.y));
  progress.recordWanted(game.wanted.stars);
  // Siren when a cruiser is close.
  let nearestCop = Infinity;
  for (const c of game.wanted.cops) nearestCop = Math.min(nearestCop, Math.hypot(c.car.x - player.x, c.car.y - player.y));
  audio.setSiren(nearestCop < 600 ? 1 - nearestCop / 600 : 0);

  // ---- missions ----
  spawnTargetCarIfNeeded();
  const missionEvents = updateMission(game.missions, {
    player, playerCar: game.playerCar, cars: game.cars,
    wanted: game.wanted, dt,
  });
  for (const ev of missionEvents) {
    if (ev.type === 'stepDone') {
      audio.pickup();
    } else if (ev.type === 'missionDone') {
      const paid = progress.completeMission(ev.mission.id, ev.mission.payout);
      showBanner('MISSION COMPLETE', '+$' + paid.toLocaleString('en-US') + '  •  ' + ev.mission.title, '#7ee787', 3);
      audio.missionComplete();
      removeTargetCar();
      // Clear the finished mission: the briefing for the next job only
      // opens while no mission is current, so a stale object here would
      // soft-lock the whole story chain after the first payout.
      game.missions.current = null;
      game.missions.enemies = [];
      persist();
      const remaining = nextMissionDef();
      if (remaining) {
        say('ROOK: Good work. Next job is waiting at the garage when you are ready.', 'ROOK');
      } else {
        game.storyT = 2.5;
      }
    } else if (ev.type === 'missionFailed') {
      showBanner('MISSION FAILED', ev.reason || '', '#f87171');
      audio.missionFail();
      removeTargetCar();
      // Same as above: a failed mission must release the slot, or the
      // player can never retry or take the next job.
      game.missions.current = null;
      game.missions.enemies = [];
    }
  }
  updateMissionEnemies(game.missions, dt, player, game.playerCar, (shot) => {
    spawnBullet(game.combat, shot);
  });
  if (game.storyT > 0) {
    game.storyT -= dt;
    if (game.storyT <= 0) game.state = 'story';
  }

  // ---- combat: bullets ----
  const bulletEvents = updateBullets(game.combat, dt, city, bulletTargets());
  for (const ev of bulletEvents) {
    if (ev.type === 'hit') {
      effects.hitPuff(ev.x, ev.y);
    } else if (ev.type === 'wall') {
      effects.sparks(ev.x, ev.y, '#ffd23f', 4);
    }
  }

  // ---- taxi fares ----
  updateFare(dt);

  // ---- effects, camera, dialogue, banner ----
  effects.update(dt);
  const lookX = (player.inCar ? player.inCar.x : player.x) + (player.inCar ? Math.cos(player.angle) * CAMERA_LOOKAHEAD : 0);
  const lookY = (player.inCar ? player.inCar.y : player.y) + (player.inCar ? Math.sin(player.angle) * CAMERA_LOOKAHEAD : 0);
  updateCamera(camera, lookX, lookY, dt, effects.trauma());
  const targetZoom = player.inCar ? CAMERA_ZOOM_DRIVE : CAMERA_ZOOM_FOOT;
  game.zoom += (targetZoom - game.zoom) * Math.min(1, 3 * dt);

  if (game.dialogueT > 0) {
    game.dialogueT -= dt;
    if (game.dialogueT <= 0) game.dialogueCurrent = null;
  }
  if (!game.dialogueCurrent && game.dialogue.length > 0) {
    game.dialogueCurrent = game.dialogue.shift();
    game.dialogueT = 4.5;
  }
  if (game.banner) {
    game.banner.life -= dt;
    if (game.banner.life <= 0) game.banner = null;
  }

  // Autosave while playing.
  game.autosaveT -= dt;
  if (game.autosaveT <= 0) {
    game.autosaveT = 20;
    persist();
  }

  // Wasted check.
  if (player.health <= 0 && game.state === 'playing') doWasted();
}

function meleeTargets() {
  const targets = [];
  for (const e of game.missions.enemies) {
    if (e.dead) continue;
    targets.push({
      x: e.x, y: e.y, radius: 12, kind: 'gunman',
      onHit(dmg) {
        e.health -= dmg;
        if (e.health <= 0) { e.dead = true; effects.hitPuff(e.x, e.y); }
      },
    });
  }
  for (const f of game.wanted.footCops) {
    if (f.dead) continue;
    targets.push({
      x: f.x, y: f.y, radius: 12, kind: 'cop',
      onHit(dmg) {
        f.health -= dmg;
        if (f.health <= 0) {
          f.dead = true;
          addHeat(game.wanted, HEAT_KILL_COP, 'cop');
          effects.hitPuff(f.x, f.y);
        }
      },
    });
  }
  for (const ped of game.traffic.peds) {
    if (ped.state === 'down' || ped.state === 'riding') continue;
    targets.push({
      x: ped.x, y: ped.y, radius: 10, kind: 'ped',
      onHit() {
        ped.state = 'down';
        addHeat(game.wanted, HEAT_KILL_PED, 'ped');
      },
    });
  }
  return targets;
}

function bulletTargets() {
  const targets = [];
  const player = game.player;
  // Enemy and cop bullets can hit Maya (on foot) or her car — never her
  // own bullets, and never another hostile's bullets.
  const playerTarget = player.inCar
    ? {
        x: player.inCar.x, y: player.inCar.y, radius: 24, kind: 'playercar', hitBy: ['enemy', 'cop'],
        onHit(dmg) {
          player.inCar.health -= dmg;
          if (player.inCar.health <= 0) {
            effects.explosion(player.inCar.x, player.inCar.y);
            game.cars = game.cars.filter((c) => c !== player.inCar);
            player.inCar = null;
            game.playerCar = null;
            playerTakeDamage(player, 25, game.time);
          }
        },
      }
    : {
        x: player.x, y: player.y, radius: 13, kind: 'player', hitBy: ['enemy', 'cop'],
        onHit(dmg) {
          playerTakeDamage(player, dmg, game.time);
          effects.hitPuff(player.x, player.y);
        },
      };
  targets.push(playerTarget);
  for (const e of game.missions.enemies) {
    if (e.dead) continue;
    targets.push({
      x: e.x, y: e.y, radius: 12, kind: 'gunman', hitBy: ['player'],
      onHit(dmg) {
        e.health -= dmg;
        if (e.health <= 0) { e.dead = true; effects.hitPuff(e.x, e.y); }
      },
    });
  }
  for (const f of game.wanted.footCops) {
    if (f.dead) continue;
    targets.push({
      x: f.x, y: f.y, radius: 12, kind: 'cop', hitBy: ['player'],
      onHit(dmg) {
        f.health -= dmg;
        if (f.health <= 0) {
          f.dead = true;
          addHeat(game.wanted, HEAT_KILL_COP, 'cop');
          effects.hitPuff(f.x, f.y);
        }
      },
    });
  }
  for (const ped of game.traffic.peds) {
    if (ped.state === 'down' || ped.state === 'riding') continue;
    targets.push({
      x: ped.x, y: ped.y, radius: 10, kind: 'ped', hitBy: ['player'],
      onHit() {
        ped.state = 'down';
        addHeat(game.wanted, HEAT_KILL_PED, 'ped');
      },
    });
  }
  const carTarget = (car, kind) => ({
    x: car.x, y: car.y, radius: 24, kind, hitBy: ['player'],
    onHit(dmg) {
      car.health -= dmg;
      if (car.health <= 0) {
        effects.explosion(car.x, car.y);
        audio.crash(1);
        if (kind === 'copcar') addHeat(game.wanted, HEAT_KILL_COP, 'cop');
        game.cars = game.cars.filter((c) => c !== car);
        game.traffic.cars = game.traffic.cars.filter((c) => c !== car);
        game.wanted.cops = game.wanted.cops.filter((c) => c.car !== car);
      }
    },
  });
  for (const car of game.cars) {
    if (car === game.playerCar) continue;
    targets.push(carTarget(car, 'parkedcar'));
  }
  for (const car of game.traffic.cars) targets.push(carTarget(car, 'trafficcar'));
  for (const c of game.wanted.cops) targets.push(carTarget(c.car, 'copcar'));
  return targets;
}

function updateFare(dt) {
  const player = game.player;
  // Offer a fare when Maya is driving and none is active.
  if (!game.fare) {
    game.fareOfferT -= dt;
    if (game.fareOfferT <= 0 && player.inCar) {
      const ped = nearestPed(game.traffic, player.x, player.y, 420);
      if (ped) {
        const dest = randomRoadPoint(city, game.rng, player.x, player.y, 700);
        const fare = progress.makeFare(game.rng);
        game.fare = { ped, destX: dest.x, destY: dest.y, fare: fare.fare, state: 'offered', data: fare };
      } else {
        game.fareOfferT = 5;
      }
    }
    return;
  }
  const fare = game.fare;
  if (fare.state === 'offered') {
    // Offer expires if Maya drives away or gets out.
    if (!player.inCar) { game.fare = null; game.fareOfferT = 8; return; }
    const d = Math.hypot(player.inCar.x - fare.ped.x, player.inCar.y - fare.ped.y);
    if (d > 520) { game.fare = null; game.fareOfferT = 8; }
  } else if (fare.state === 'riding') {
    if (!player.inCar) { game.fare = null; game.fareOfferT = 8; return; }
    const d = Math.hypot(player.inCar.x - fare.destX, player.inCar.y - fare.destY);
    if (d < 90) {
      const paid = progress.finishFare(fare.data);
      showBanner('FARE COMPLETE', '+$' + paid.toLocaleString('en-US'), '#7ee787', 2);
      audio.cash();
      effects.floatText(fare.destX, fare.destY - 20, '+$' + paid, '#7ee787');
      game.fare = null;
      game.fareOfferT = 12;
      persist();
    }
  }
}

// ---------- render ----------
function render() {
  ctx.fillStyle = '#0a0e16';
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  const cam = game.camera;

  ctx.save();
  ctx.translate(VIEW_WIDTH / 2, VIEW_HEIGHT / 2);
  ctx.scale(game.zoom, game.zoom);
  ctx.translate(-cam.x + cam.shakeX, -cam.y + cam.shakeY);

  drawWorld(ctx, city, cam, game.night);

  // Mission objective marker.
  const objective = missionObjective(game.missions);
  if (objective && game.state !== 'menu') {
    drawMarker(ctx, objective.x, objective.y, game.time, '#ffd23f', objective.title);
  }
  // Rook's Garage marker when a mission is available.
  if (!game.missions.current && nextMissionDef() && game.state === 'playing') {
    const g = city.landmarks.garageNorth;
    drawMarker(ctx, g.x, g.y, game.time, '#14b8a6', 'ROOK');
  }
  // Taxi fare markers.
  if (game.fare) {
    if (game.fare.state === 'offered') {
      drawMarker(ctx, game.fare.ped.x, game.fare.ped.y, game.time, '#4ade80', 'FARE $' + game.fare.fare);
    } else if (game.fare.state === 'riding') {
      drawMarker(ctx, game.fare.destX, game.fare.destY, game.time, '#4ade80', 'DROP-OFF');
    }
  }
  // Hidden packages.
  for (const pkg of progress.packages) {
    if (pkg.collected) continue;
    drawMarker(ctx, pkg.x, pkg.y, game.time, '#ffd23f');
  }

  // Cars.
  for (const car of game.cars) drawCar(ctx, car, game.time);
  for (const car of game.traffic.cars) drawCar(ctx, car, game.time);
  for (const c of game.wanted.cops) drawCar(ctx, c.car, game.time);
  // People.
  for (const ped of game.traffic.peds) {
    if (ped.state === 'down' || ped.state === 'riding') continue;
    drawPed(ctx, ped, game.time);
  }
  for (const f of game.wanted.footCops) drawEnemy(ctx, { ...f, health: f.health, maxHealth: 50 }, game.time);
  for (const e of game.missions.enemies) drawEnemy(ctx, e, game.time);
  if (!game.player.inCar) drawPlayer(ctx, game.player, game.time);
  drawBullets(ctx, game.combat.bullets);
  effects.draw(ctx);
  ctx.restore();

  // Night tint.
  if (game.night && game.state !== 'menu') {
    ctx.fillStyle = 'rgba(8,12,40,0.22)';
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  }

  // HUD + overlays.
  if (game.state === 'menu') {
    drawStartScreen(ctx, game);
  } else {
    const hudState = {
      player: game.player,
      playerCar: game.playerCar,
      wanted: game.wanted,
      progress,
      objective,
      time: game.time,
      clock: clockString(),
      fare: game.fare,
    };
    drawHUD(ctx, hudState);
    drawMinimap(ctx, {
      city, player: game.player, playerCar: game.playerCar,
      objective, wanted: game.wanted, fare: game.fare, traffic: game.traffic,
    });
    if (game.dialogueCurrent) drawDialogue(ctx, game.dialogueCurrent);
    if (game.banner) drawBanner(ctx, game.banner);
    if (game.briefingOpen && game.briefing) drawMissionBriefing(ctx, game.briefing);
    if (game.state === 'paused') drawPauseScreen(ctx, game);
    if (game.state === 'busted') drawEndCard(ctx, 'busted', game.endDetail);
    if (game.state === 'wasted') drawEndCard(ctx, 'wasted', game.endDetail);
    if (game.state === 'story') drawStoryComplete(ctx, game);
  }
}

// ---------- boot the loop ----------
if (shotName) {
  applyShot(game, shotName);
} else {
  camera.x = game.player.x;
  camera.y = game.player.y;
}
window.__solmar = game;

let last = performance.now();
function frame(now) {
  // dt is clamped both ways: the first rAF timestamp can predate the boot
  // performance.now(), which would make dt negative and run the physics
  // backwards for a frame.
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  update(dt);
  render();
  input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
