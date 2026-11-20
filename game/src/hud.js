// HUD: cash, wanted stars, health, ammo, speed, mission objective, and
// the minimap. Drawn in screen coordinates after the world, so it never
// scrolls with the camera.

import { VIEW_WIDTH, VIEW_HEIGHT, MINIMAP_SIZE, WORLD_SIZE } from './config.js';

function drawStars(ctx, stars, x, y) {
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 5; i++) {
    const filled = i < stars;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText('★', x + i * 30, y);
    ctx.fillStyle = filled ? '#ffd23f' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', x + i * 30, y);
  }
}

function drawBar(ctx, x, y, w, h, frac, color, bg) {
  ctx.fillStyle = bg || 'rgba(0,0,0,0.55)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, (w - 2) * Math.max(0, Math.min(1, frac)), h - 2);
}

export function drawHUD(ctx, state) {
  const { player, playerCar, wanted, progress, objective, time, clock, fare } = state;
  ctx.textBaseline = 'alphabetic';

  // Top-right: cash.
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  const cashText = '$' + progress.cash.toLocaleString('en-US');
  ctx.strokeText(cashText, VIEW_WIDTH - 16, 36);
  ctx.fillStyle = '#7ee787';
  ctx.fillText(cashText, VIEW_WIDTH - 16, 36);

  // Top-right, under the cash: wanted stars.
  drawStars(ctx, wanted.stars, VIEW_WIDTH - 166, 66);

  // Top-left: health and ammo (on foot), speed (in a car).
  ctx.textAlign = 'left';
  ctx.font = 'bold 15px Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText('HEALTH', 16, 24);
  ctx.fillText('HEALTH', 16, 24);
  const hpFrac = Math.max(0, player.health / 100);
  drawBar(ctx, 16, 30, 170, 12, hpFrac, hpFrac > 0.35 ? '#4ade80' : '#ef4444');
  if (player.armor > 0) {
    drawBar(ctx, 16, 46, 170, 6, player.armor / 100, '#60a5fa');
  }
  if (playerCar) {
    const kmh = Math.round(Math.abs(playerCar.speed) * 0.36);
    ctx.font = 'bold 30px Arial, sans-serif';
    ctx.strokeText(kmh + ' km/h', 16, 92);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(kmh + ' km/h', 16, 92);
    ctx.font = 'bold 13px Arial, sans-serif';
    ctx.fillStyle = '#e5e7eb';
    ctx.strokeText(playerCar.name + (playerCar.missionTarget ? '  •  MISSION CAR' : ''), 16, 112);
    ctx.fillText(playerCar.name + (playerCar.missionTarget ? '  •  MISSION CAR' : ''), 16, 112);
  } else {
    ctx.font = 'bold 15px Arial, sans-serif';
    ctx.strokeText('AMMO', 16, 66);
    ctx.fillText('AMMO', 16, 66);
    ctx.font = 'bold 22px Arial, sans-serif';
    const ammoText = player.reloading > 0 ? 'RELOADING…' : player.ammo + ' / ∞';
    ctx.strokeText(ammoText, 16, 90);
    ctx.fillStyle = player.ammo === 0 ? '#f87171' : '#ffffff';
    ctx.fillText(ammoText, 16, 90);
  }

  // Mission objective, top centre.
  if (objective) {
    const cx = VIEW_WIDTH / 2;
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px Arial, sans-serif';
    ctx.fillStyle = '#ffd23f';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(objective.title.toUpperCase(), cx, 24);
    ctx.fillText(objective.title.toUpperCase(), cx, 24);
    ctx.font = '15px Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.strokeText(objective.label, cx, 46);
    ctx.fillText(objective.label, cx, 46);
    if (objective.timer !== null && objective.timer !== undefined) {
      const t = Math.max(0, Math.ceil(objective.timer));
      ctx.font = 'bold 22px Arial, sans-serif';
      ctx.fillStyle = t <= 10 ? '#f87171' : '#ffffff';
      ctx.strokeText(t + 's', cx, 72);
      ctx.fillText(t + 's', cx, 72);
    }
    ctx.font = '12px Arial, sans-serif';
    ctx.fillStyle = '#d1d5db';
    ctx.strokeText('Mission ' + objective.stepIndex + ' of ' + objective.stepCount, cx, 90);
    ctx.fillText('Mission ' + objective.stepIndex + ' of ' + objective.stepCount, cx, 90);
  }

  // Taxi fare banner, under the objective.
  if (fare && fare.state === 'riding') {
    const cx = VIEW_WIDTH / 2;
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px Arial, sans-serif';
    ctx.fillStyle = '#ffd23f';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText('TAXI FARE  •  $' + fare.fare + '  •  follow the green marker', cx, 112);
    ctx.fillText('TAXI FARE  •  $' + fare.fare + '  •  follow the green marker', cx, 112);
  }

  // Bottom-left: controls reminder (fades after the first minute).
  if (time < 60) {
    ctx.textAlign = 'left';
    ctx.font = '12px Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    const lines = playerCar
      ? ['WASD drive  •  SPACE handbrake  •  F exit car  •  E interact  •  M mute']
      : ['WASD move  •  SHIFT sprint  •  Mouse aim  •  Click shoot  •  F enter car  •  E interact'];
    ctx.strokeText(lines[0], 16, VIEW_HEIGHT - 16);
    ctx.fillText(lines[0], 16, VIEW_HEIGHT - 16);
  }

  // Clock, bottom-right above the minimap.
  ctx.textAlign = 'right';
  ctx.font = 'bold 16px Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  const clockText = clock;
  ctx.strokeText(clockText, VIEW_WIDTH - 16, VIEW_HEIGHT - MINIMAP_SIZE - 30);
  ctx.fillText(clockText, VIEW_WIDTH - 16, VIEW_HEIGHT - MINIMAP_SIZE - 30);
}

// The minimap: the whole city shrunk into a circle, with the player,
// mission marker, cars and police on it.
export function drawMinimap(ctx, state) {
  const { city, player, playerCar, objective, wanted, fare, traffic } = state;
  const size = MINIMAP_SIZE;
  const x = VIEW_WIDTH - size - 12;
  const y = VIEW_HEIGHT - size - 12;
  const scale = size / WORLD_SIZE;
  const px = playerCar ? playerCar.x : player.x;
  const py = playerCar ? playerCar.y : player.y;

  ctx.save();
  // Round frame.
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  // Sea and land.
  ctx.fillStyle = '#1f6f8b';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#3a5a3f';
  ctx.fillRect(x, y, size, city.beachY * scale);
  ctx.fillStyle = '#c2a878';
  ctx.fillRect(x, y + city.beachY * scale, size, (city.seaY - city.beachY) * scale);
  // Roads.
  ctx.strokeStyle = '#5a5a62';
  ctx.lineWidth = 2;
  for (const c of city.centers) {
    ctx.beginPath();
    ctx.moveTo(x, y + c * scale);
    ctx.lineTo(x + size, y + c * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + c * scale, y);
    ctx.lineTo(x + c * scale, y + size);
    ctx.stroke();
  }
  // Buildings.
  ctx.fillStyle = 'rgba(20,20,28,0.7)';
  for (const b of city.buildings) {
    ctx.fillRect(x + b.x * scale, y + b.y * scale, Math.max(1, b.w * scale), Math.max(1, b.h * scale));
  }
  // Taxi fare destination.
  if (fare && fare.state === 'riding') {
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.arc(x + fare.destX * scale, y + fare.destY * scale, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Mission objective.
  if (objective) {
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(x + objective.x * scale, y + objective.y * scale, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // Police.
  ctx.fillStyle = '#3b82f6';
  for (const c of wanted.cops) {
    ctx.beginPath();
    ctx.arc(x + c.car.x * scale, y + c.car.y * scale, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Nearby traffic (only the closest few, so the map stays readable).
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (const c of traffic.cars) {
    const d = Math.hypot(c.x - px, c.y - py);
    if (d > 700) continue;
    ctx.fillRect(x + c.x * scale - 1, y + c.y * scale - 1, 2, 2);
  }
  // Player: white arrow pointing where they face.
  ctx.save();
  ctx.translate(x + px * scale, y + py * scale);
  ctx.rotate(player.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -4.5);
  ctx.lineTo(-5, 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  // Frame ring.
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.stroke();
  // North tick.
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', x + size / 2, y + 12);
}
