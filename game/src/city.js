// Solmar — the city: deterministic generation, districts, roads, buildings,
// collision, and the road graph traffic drives on. Seeded, so every run
// builds the same city; gameplay only reads this data, never mutates it.

import { WORLD_SIZE, BLOCK_PITCH, ROAD_WIDTH, SIDEWALK_WIDTH } from './config.js';
import { makeRng, clamp } from './rng.js';

const CITY_SEED = 1337;
const ROAD_HALF = ROAD_WIDTH / 2;
const BLOCK_INSET = ROAD_HALF + SIDEWALK_WIDTH; // road edge -> block interior

// District of a block, by its centre.
export function districtAt(x, y) {
  if (y >= 3150) return 'beach';
  if (x >= 3150) return 'harbor';
  if (x >= 1200 && x <= 2400 && y >= 1200 && y <= 2400) return 'downtown';
  if (x < 1200 && y >= 1200) return 'oldtown';
  if (y < 1200) return 'suburbs';
  return 'mixed';
}

function roadCenters() {
  const centers = [];
  for (let i = 0; i < 12; i++) centers.push(150 + i * BLOCK_PITCH);
  return centers;
}

export function generateCity() {
  const rng = makeRng(CITY_SEED);
  const centers = roadCenters();
  const buildings = [];
  const parks = [];
  const trees = [];
  const parkingLots = [];
  const plazas = [];

  // Landmark anchors (fixed, named places missions and dialogue use).
  const landmarks = {
    tower: { name: 'Solmar Tower', x: 1800, y: 1800 },
    cityHall: { name: 'City Hall', x: 1500, y: 1500 },
    pier: { name: 'Marina Pier', x: 1950, y: 3480 },
    stadium: { name: 'Solmar Stadium', x: 2850, y: 1500 },
    hospital: { name: 'General Hospital', x: 750, y: 1950 },
    docks: { name: 'Harbor Docks', x: 3370, y: 1950 },
    safehouse: { name: 'Safehouse', x: 750, y: 750 },
    garageNorth: { name: "Rook's Garage", x: 1350, y: 1050 },
    garageSouth: { name: 'Pay N Spray', x: 2550, y: 2850 },
  };

  // Blocks sit between neighbouring road centres.
  for (let i = 0; i < centers.length - 1; i++) {
    for (let j = 0; j < centers.length - 1; j++) {
      const x0 = centers[i] + BLOCK_INSET;
      const y0 = centers[j] + BLOCK_INSET;
      const x1 = centers[i + 1] - BLOCK_INSET;
      const y1 = centers[j + 1] - BLOCK_INSET;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const district = districtAt(cx, cy);
      const w = x1 - x0;
      const h = y1 - y0;
      if (district === 'beach' || district === 'harbor') continue;

      const roll = rng.next();
      if (roll < 0.1) {
        // Park: trees, no buildings.
        parks.push({ x: x0, y: y0, w, h, district });
        const count = rng.int(4, 8);
        for (let t = 0; t < count; t++) {
          trees.push({ x: rng.range(x0 + 14, x1 - 14), y: rng.range(y0 + 14, y1 - 14), r: rng.range(7, 11) });
        }
        continue;
      }
      if (roll < 0.18) {
        // Parking lot: open asphalt with marked car spots.
        const spots = [];
        for (let s = 0; s < 6; s++) {
          spots.push({ x: x0 + 30 + s * 30, y: y0 + h / 2, angle: Math.PI / 2 });
        }
        parkingLots.push({ x: x0, y: y0, w, h, spots });
        continue;
      }
      if (district === 'downtown') {
        // One big tower, or two slabs.
        if (rng.chance(0.5)) {
          buildings.push(makeBuilding(x0 + 24, y0 + 24, w - 48, h - 48, district, rng, 14 + rng.int(0, 10)));
        } else {
          buildings.push(makeBuilding(x0 + 12, y0 + 14, w / 2 - 18, h - 28, district, rng, 10 + rng.int(0, 6)));
          buildings.push(makeBuilding(x0 + w / 2 + 6, y0 + 14, w / 2 - 18, h - 28, district, rng, 8 + rng.int(0, 6)));
        }
      } else if (district === 'oldtown' || district === 'mixed') {
        const n = rng.int(2, 4);
        for (let b = 0; b < n; b++) {
          const bw = w / 2 - 16;
          const bh = h / 2 - 16;
          const bx = x0 + 8 + (b % 2) * (w / 2);
          const by = y0 + 8 + Math.floor(b / 2) * (h / 2);
          buildings.push(makeBuilding(bx, by, bw, bh, district, rng, 2 + rng.int(0, 3)));
        }
      } else {
        // Suburbs: two houses with yards and a tree each.
        buildings.push(makeBuilding(x0 + 16, y0 + 16, 62, 52, district, rng, 1));
        buildings.push(makeBuilding(x1 - 78, y1 - 68, 62, 52, district, rng, 1));
        trees.push({ x: x0 + 30, y: y1 - 30, r: 9 });
        trees.push({ x: x1 - 30, y: y0 + 30, r: 9 });
      }
    }
  }

  // Landmark buildings sit on top of the grid (their blocks stay clear of
  // generated buildings because landmarks occupy whole blocks).
  const tower = { x: 1710, y: 1710, w: 180, h: 180, floors: 26, district: 'downtown', landmark: 'Solmar Tower', roof: '#3d4a5c' };
  const hall = { x: 1420, y: 1420, w: 160, h: 120, floors: 4, district: 'downtown', landmark: 'City Hall', roof: '#8a7a5c' };
  const stadium = { x: 2760, y: 1410, w: 200, h: 180, floors: 3, district: 'mixed', landmark: 'Solmar Stadium', roof: '#4a6a8a' };
  const hospital = { x: 660, y: 1880, w: 180, h: 140, floors: 5, district: 'oldtown', landmark: 'General Hospital', roof: '#c8ccd0' };
  buildings.push(tower, hall, stadium, hospital);
  plazas.push({ x: 1500, y: 1650, w: 200, h: 60, name: 'City Hall Plaza' });

  // The pier juts into the sea from the beach.
  const pier = { x: 1920, y: 3300, w: 60, h: 240, name: 'Marina Pier' };

  return {
    centers,
    buildings,
    parks,
    trees,
    parkingLots,
    plazas,
    landmarks,
    pier,
    beachY: 3150,
    seaY: 3520, // Sea along the south edge, below the beach road (y=3450).
    harborX: 3150,
  };
}

function makeBuilding(x, y, w, h, district, rng, floors) {
  const roofs = {
    downtown: ['#5d6b7a', '#7a6a8a', '#4a5a6a'],
    oldtown: ['#b06a4a', '#a8544a', '#8a6a4a'],
    mixed: ['#6a7a72', '#7a6a5a', '#5d6b7a'],
    suburbs: ['#a8544a', '#b06a4a', '#7a5a6a'],
    harbor: ['#6a7a72', '#5d6b6a'],
  };
  const list = roofs[district] || roofs.mixed;
  return {
    x, y, w, h, floors,
    district,
    roof: rng.pick(list),
    windows: rng.int(2, 5),
  };
}

// --- Queries the rest of the game uses -------------------------------------

// True when the point is on a road surface (not sidewalk, not block).
export function isOnRoad(city, x, y) {
  if (y >= city.beachY || x >= city.harborX) return false;
  for (const c of city.centers) {
    if (Math.abs(x - c) <= ROAD_HALF) return true;
    if (Math.abs(y - c) <= ROAD_HALF) return true;
  }
  return false;
}

// True when the point is on a sidewalk ring around a road.
export function isOnSidewalk(city, x, y) {
  if (y >= city.beachY || x >= city.harborX) return false;
  for (const c of city.centers) {
    const dx = Math.abs(x - c);
    const dy = Math.abs(y - c);
    if ((dx > ROAD_HALF && dx <= ROAD_HALF + SIDEWALK_WIDTH) || (dy > ROAD_HALF && dy <= ROAD_HALF + SIDEWALK_WIDTH)) return true;
  }
  return false;
}

// True when the point is in the sea (not on the pier).
export function isInWater(city, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (y < city.seaY) return false;
  const p = city.pier;
  return !(x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
}

// Nearest road centreline to a point: { axis: 'h'|'v', line, dist }.
export function nearestRoad(city, x, y) {
  let best = { axis: 'h', line: city.centers[0], dist: Infinity };
  for (const c of city.centers) {
    const dh = Math.abs(y - c);
    const dv = Math.abs(x - c);
    if (dh < best.dist) best = { axis: 'h', line: c, dist: dh };
    if (dv < best.dist) best = { axis: 'v', line: c, dist: dv };
  }
  return best;
}

// Nearest intersection to a point.
export function nearestIntersection(city, x, y) {
  let bx = city.centers[0];
  let by = city.centers[0];
  let bd = Infinity;
  for (const cx of city.centers) {
    for (const cy of city.centers) {
      const d = Math.abs(x - cx) + Math.abs(y - cy);
      if (d < bd) { bd = d; bx = cx; by = cy; }
    }
  }
  return { x: bx, y: by };
}

// A random point on a road, at least minDist from (fx, fy) when given.
export function randomRoadPoint(city, rng, fx, fy, minDist) {
  for (let tries = 0; tries < 40; tries++) {
    const vertical = rng.chance(0.5);
    const line = rng.pick(city.centers);
    const along = rng.range(200, WORLD_SIZE - 200);
    const x = vertical ? line : along;
    const y = vertical ? along : line;
    if (fx !== undefined && Math.hypot(x - fx, y - fy) < (minDist || 0)) continue;
    if (y >= city.beachY || x >= city.harborX) continue;
    return { x, y };
  }
  return { x: 150, y: 150 };
}

// Circle (x, y, r) against building rects and water: returns the first hit.
export function circleHitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    const nx = clamp(x, b.x, b.x + b.w);
    const ny = clamp(y, b.y, b.y + b.h);
    if ((x - nx) * (x - nx) + (y - ny) * (y - ny) < r * r) return b;
  }
  return null;
}

// Push a circle out of every building it overlaps; returns true if moved.
export function resolveCircleVsBuildings(city, e, r) {
  let moved = false;
  for (const b of city.buildings) {
    const nx = clamp(e.x, b.x, b.x + b.w);
    const ny = clamp(e.y, b.y, b.y + b.h);
    const dx = e.x - nx;
    const dy = e.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      e.x = nx + (dx / d) * r;
      e.y = ny + (dy / d) * r;
    } else {
      // Centre inside the rect: push out along the smallest penetration.
      const left = e.x - b.x;
      const right = b.x + b.w - e.x;
      const top = e.y - b.y;
      const bottom = b.y + b.h - e.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) e.x = b.x - r;
      else if (m === right) e.x = b.x + b.w + r;
      else if (m === top) e.y = b.y - r;
      else e.y = b.y + b.h + r;
    }
    moved = true;
  }
  return moved;
}

// Keep an entity inside the world and out of the sea (unless on the pier).
export function clampToWorld(city, e, r) {
  e.x = clamp(e.x, r, WORLD_SIZE - r);
  e.y = clamp(e.y, r, WORLD_SIZE - r);
  if (isInWater(city, e.x, e.y)) e.y = city.seaY - r - 1;
}
