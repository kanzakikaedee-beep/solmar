// Rendering: everything the camera sees, drawn in layers.
// World (sea, sand, roads, blocks, buildings, pier) → markers → cars →
// people → effects → night lighting. The camera transform is applied once
// by the caller; this file draws in world coordinates.

import { WORLD_SIZE, VIEW_WIDTH, VIEW_HEIGHT, ROAD_WIDTH, PALETTE } from './config.js';
import { isInWater } from './city.js';

export function createCamera() {
  return { x: 0, y: 0, zoom: 1, shakeX: 0, shakeY: 0 };
}

// Camera: exponential smoothing toward the target, clamped to the world.
export function updateCamera(camera, tx, ty, dt, trauma) {
  const rate = 5;
  const k = 1 - Math.exp(-rate * dt);
  camera.x += (tx - camera.x) * k;
  camera.y += (ty - camera.y) * k;
  const hw = VIEW_WIDTH / 2;
  const hh = VIEW_HEIGHT / 2;
  camera.x = Math.max(hw, Math.min(WORLD_SIZE - hw, camera.x));
  camera.y = Math.max(hh, Math.min(WORLD_SIZE - hh, camera.y));
  const t = trauma || 0;
  const s = t * t * 12;
  camera.shakeX = (Math.random() - 0.5) * s;
  camera.shakeY = (Math.random() - 0.5) * s;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawWorld(ctx, city, camera, night) {
  const x0 = camera.x - VIEW_WIDTH / 2 - 60;
  const y0 = camera.y - VIEW_HEIGHT / 2 - 60;
  const x1 = camera.x + VIEW_WIDTH / 2 + 60;
  const y1 = camera.y + VIEW_HEIGHT / 2 + 60;

  // Ground: grass, then the beach strip and the sea along the south edge.
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  const beachTop = Math.max(y0, city.beachY);
  const beachBottom = Math.min(y1, WORLD_SIZE);
  if (beachBottom > beachTop) {
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(Math.max(x0, 0), beachTop, Math.min(x1, WORLD_SIZE) - Math.max(x0, 0), beachBottom - beachTop);
  }
  const seaTop = Math.max(y0, city.seaY);
  const seaBottom = Math.min(y1, WORLD_SIZE);
  if (seaBottom > seaTop) {
    ctx.fillStyle = PALETTE.sea;
    ctx.fillRect(Math.max(x0, 0), seaTop, Math.min(x1, WORLD_SIZE) - Math.max(x0, 0), seaBottom - seaTop);
  }

  // Roads: asphalt with centre dashes.
  ctx.fillStyle = PALETTE.road;
  for (const c of city.centers) {
    ctx.fillRect(0, c - ROAD_WIDTH / 2, WORLD_SIZE, ROAD_WIDTH);
    ctx.fillRect(c - ROAD_WIDTH / 2, 0, ROAD_WIDTH, WORLD_SIZE);
  }
  ctx.strokeStyle = 'rgba(240,220,120,0.75)';
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 22]);
  ctx.beginPath();
  for (const c of city.centers) {
    ctx.moveTo(0, c);
    ctx.lineTo(WORLD_SIZE, c);
    ctx.moveTo(c, 0);
    ctx.lineTo(c, WORLD_SIZE);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Sidewalks: light border around every road.
  ctx.strokeStyle = PALETTE.sidewalk;
  ctx.lineWidth = 8;
  for (const c of city.centers) {
    ctx.strokeRect(-ROAD_WIDTH / 2, c - ROAD_WIDTH / 2 - 4, WORLD_SIZE + ROAD_WIDTH, ROAD_WIDTH + 8);
    ctx.strokeRect(c - ROAD_WIDTH / 2 - 4, -ROAD_WIDTH / 2, ROAD_WIDTH + 8, WORLD_SIZE + ROAD_WIDTH);
  }

  // Parks and plazas.
  for (const p of city.parks) {
    if (p.x > x1 || p.x + p.w < x0 || p.y > y1 || p.y + p.h < y0) continue;
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(p.x, p.y, p.w, p.h);
  }
  for (const p of city.plazas) {
    if (p.x > x1 || p.x + p.w < x0 || p.y > y1 || p.y + p.h < y0) continue;
    ctx.fillStyle = '#b8b2a4';
    ctx.fillRect(p.x, p.y, p.w, p.h);
  }

  // Parking lots.
  for (const lot of city.parkingLots) {
    if (lot.x > x1 || lot.x + lot.w < x0 || lot.y > y1 || lot.y + lot.h < y0) continue;
    ctx.fillStyle = '#6a6a72';
    ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const sx = lot.x + 14 + i * 30;
      ctx.strokeRect(sx, lot.y + 8, 24, 40);
    }
  }

  // Trees.
  for (const t of city.trees) {
    if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
    ctx.fillStyle = '#2f6b3a';
    ctx.beginPath();
    ctx.arc(t.x, t.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1f4d2a';
    ctx.beginPath();
    ctx.arc(t.x - 3, t.y - 3, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Buildings: body, roof edge, windows, and a name for landmarks.
  for (const b of city.buildings) {
    if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(b.x + 5, b.y + 6, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, 6);
    // Windows: a sparse lit grid, brighter at night.
    const cols = Math.max(2, Math.floor(b.w / 26));
    const rows = Math.max(2, Math.floor(b.h / 26));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const lit = ((i * 7 + j * 13 + b.x) % 5) < 2;
        ctx.fillStyle = lit ? (night ? '#ffd97a' : '#ffe9b0') : 'rgba(20,30,44,0.55)';
        ctx.fillRect(b.x + 8 + i * ((b.w - 16) / cols), b.y + 8 + j * ((b.h - 16) / rows), 9, 12);
      }
    }
    if (b.landmark) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.font = 'bold 12px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.landmark, b.x + b.w / 2, b.y - 6);
    }
  }

  // The pier: wooden deck into the sea.
  const pier = city.pier;
  ctx.fillStyle = '#8a6a4a';
  ctx.fillRect(pier.x - pier.w / 2, pier.y, pier.w, pier.h);
  ctx.fillStyle = '#6a4a2a';
  for (let y = pier.y + 12; y < pier.y + pier.h; y += 22) {
    ctx.fillRect(pier.x - pier.w / 2, y, pier.w, 3);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.font = 'bold 12px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Marina Pier', pier.x, pier.y - 6);
}

// A pulsing diamond marker at a mission objective.
export function drawMarker(ctx, x, y, time, color, label) {
  const pulse = 1 + Math.sin(time * 5) * 0.12;
  const s = 16 * pulse;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = color || '#ffd23f';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 2;
  ctx.fillRect(-s / 2, -s / 2, s, s);
  ctx.strokeRect(-s / 2, -s / 2, s, s);
  ctx.restore();
  if (label) {
    ctx.font = 'bold 13px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(label, x, y - 26);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x, y - 26);
  }
}

export function drawCar(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(ctx, -car.length / 2 + 3, -car.width / 2 + 4, car.length, car.width, 8);
  ctx.fill();
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -car.length / 2, -car.width / 2, car.length, car.width, 8);
  ctx.fill();
  // Cabin + windows.
  ctx.fillStyle = 'rgba(20,30,44,0.85)';
  roundRect(ctx, -car.length * 0.22, -car.width / 2 + 3, car.length * 0.42, car.width - 6, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,210,240,0.7)';
  roundRect(ctx, -car.length * 0.18, -car.width / 2 + 5, car.length * 0.34, car.width - 10, 4);
  ctx.fill();
  // Headlights and brake lights.
  ctx.fillStyle = '#fff8c0';
  ctx.fillRect(car.length / 2 - 2, -car.width / 2 + 3, 3, 5);
  ctx.fillRect(car.length / 2 - 2, car.width / 2 - 8, 3, 5);
  ctx.fillStyle = car.brakeLight ? '#ff2a2a' : '#8a2a2a';
  ctx.fillRect(-car.length / 2 - 1, -car.width / 2 + 3, 3, 5);
  ctx.fillRect(-car.length / 2 - 1, car.width / 2 - 8, 3, 5);
  // Police livery: light bar that flashes with the siren.
  if (car.type === 'police') {
    const on = Math.floor(time * 4) % 2 === 0;
    ctx.fillStyle = on ? '#ff2a2a' : '#2a6aff';
    ctx.fillRect(-4, -car.width / 2 + 2, 8, 6);
    ctx.fillStyle = on ? '#2a6aff' : '#ff2a2a';
    ctx.fillRect(-4, car.width / 2 - 8, 8, 6);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 8px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('POLICE', 0, 3);
  }
  // Taxi sign.
  if (car.type === 'taxi') {
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(-8, -car.width / 2 - 2, 16, 5);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 5px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, -car.width / 2 + 2);
  }
  // Smoke from a damaged car.
  if (car.health < 40) {
    ctx.fillStyle = 'rgba(90,90,90,0.5)';
    ctx.beginPath();
    ctx.arc(-car.length / 4, 0, 6 + Math.sin(time * 9) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawPed(ctx, p, time) {
  ctx.save();
  ctx.translate(p.x, p.y);
  const bob = p.state === 'walk' ? Math.sin(time * 8 + p.x) * 1.5 : 0;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 5, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Body: shirt circle + head.
  ctx.fillStyle = p.shirt;
  ctx.beginPath();
  ctx.arc(0, bob, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8b98a';
  ctx.beginPath();
  ctx.arc(Math.cos(p.angle) * 3, Math.sin(p.angle) * 3 + bob - 2, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawPlayer(ctx, player, time) {
  if (player.health <= 0) return;
  ctx.save();
  ctx.translate(player.x, player.y);
  const bob = player.moving ? Math.sin(time * 12) * 1.5 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 6, 9, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Maya: teal jacket, dark hair, facing her aim.
  ctx.rotate(player.angle);
  ctx.fillStyle = '#14b8a6';
  ctx.beginPath();
  ctx.arc(0, bob, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a2a2a';
  ctx.beginPath();
  ctx.arc(2, bob - 2, 6, 0, Math.PI * 2);
  ctx.fill();
  // Pistol in hand when aiming.
  ctx.fillStyle = '#222';
  ctx.fillRect(8, -2 + bob, 10, 4);
  ctx.restore();
  // Direction tick so the facing reads at a glance.
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(player.x + Math.cos(player.angle) * 12, player.y + Math.sin(player.angle) * 12);
  ctx.lineTo(player.x + Math.cos(player.angle) * 20, player.y + Math.sin(player.angle) * 20);
  ctx.stroke();
}

export function drawEnemy(ctx, e, time) {
  if (e.dead) return;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 6, 9, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(e.angle);
  ctx.fillStyle = '#8a2a2a';
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8b98a';
  ctx.beginPath();
  ctx.arc(3, -2, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.fillRect(8, -2, 10, 4);
  ctx.restore();
  // Health bar.
  const w = 26;
  const frac = Math.max(0, e.health / (e.maxHealth || 40));
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(e.x - w / 2, e.y - 20, w, 4);
  ctx.fillStyle = '#e2574c';
  ctx.fillRect(e.x - w / 2, e.y - 20, w * frac, 4);
}

// Bullets are short bright streaks.
export function drawBullets(ctx, bullets) {
  ctx.strokeStyle = '#ffe9a8';
  ctx.lineWidth = 2;
  for (const b of bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}
