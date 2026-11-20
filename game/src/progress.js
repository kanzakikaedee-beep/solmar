// Progression: cash, stats, taxi fares and hidden packages.
// One serializable state object; the save system writes it whole, and the
// HUD reads it. Rewards are idempotent: a mission pays once, a package
// pays once, a fare pays once.

import { TAXI_FARE_MIN, TAXI_FARE_MAX, PACKAGE_REWARD, PACKAGE_COUNT } from './config.js';
import { makeRng } from './rng.js';

export function createProgress(saved) {
  const state = saved || {
    cash: 250,
    missionIndex: 0,
    completedMissions: [],
    packagesCollected: [],
    stats: {
      carsStolen: 0,
      faresDone: 0,
      distanceDriven: 0,
      maxWanted: 0,
      missionsDone: 0,
      shotsFired: 0,
    },
  };
  // Hidden packages: fixed spots, seeded so they never move between runs.
  const rng = makeRng(4242);
  const packages = [];
  for (let i = 0; i < PACKAGE_COUNT; i++) {
    packages.push({
      id: 'pkg-' + i,
      x: 220 + rng.range(0, 3160),
      y: 220 + rng.range(0, 2900),
      collected: state.packagesCollected.includes('pkg-' + i),
    });
  }
  return {
    state,
    packages,
    get cash() {
      return state.cash;
    },
    addCash(amount, reason) {
      state.cash = Math.max(0, state.cash + amount);
      return { amount, reason: reason || '' };
    },
    completeMission(missionId, payout) {
      if (state.completedMissions.includes(missionId)) return 0;
      state.completedMissions.push(missionId);
      state.missionIndex = Math.max(state.missionIndex, state.completedMissions.length);
      state.stats.missionsDone += 1;
      state.cash += payout;
      return payout;
    },
    collectPackage(pkg) {
      if (pkg.collected) return 0;
      pkg.collected = true;
      state.packagesCollected.push(pkg.id);
      state.cash += PACKAGE_REWARD;
      return PACKAGE_REWARD;
    },
    // Taxi fares: a fare is offered, picked up, then paid once on delivery.
    makeFare(rng2) {
      return {
        fare: rng2.int(TAXI_FARE_MIN, TAXI_FARE_MAX),
        state: 'offered',
      };
    },
    finishFare(fare) {
      if (fare.state !== 'riding') return 0;
      fare.state = 'paid';
      state.stats.faresDone += 1;
      state.cash += fare.fare;
      return fare.fare;
    },
    recordStolenCar() {
      state.stats.carsStolen += 1;
    },
    recordDistance(px) {
      state.stats.distanceDriven += px;
    },
    recordWanted(stars) {
      if (stars > state.stats.maxWanted) state.stats.maxWanted = stars;
    },
    recordShot() {
      state.stats.shotsFired += 1;
    },
  };
}
