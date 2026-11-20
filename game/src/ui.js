// Menus and overlays: start screen, pause, mission briefings and results,
// busted/wasted, and the dialogue queue. All drawn in screen coordinates
// on top of the game; clicks and keys are handled by the main loop.

import { VIEW_WIDTH, VIEW_HEIGHT } from './config.js';

function panel(ctx, x, y, w, h, alpha) {
  ctx.fillStyle = 'rgba(10,14,22,' + (alpha === undefined ? 0.82 : alpha) + ')';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,210,63,0.7)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

function centerText(ctx, text, y, font, color) {
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.strokeText(text, VIEW_WIDTH / 2, y);
  ctx.fillStyle = color || '#ffffff';
  ctx.fillText(text, VIEW_WIDTH / 2, y);
}

export function drawStartScreen(ctx, state) {
  // Dim the city behind the title.
  ctx.fillStyle = 'rgba(6,10,18,0.72)';
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  centerText(ctx, 'SOLMAR', 170, 'bold 92px Arial, sans-serif', '#ffd23f');
  centerText(ctx, 'SUN, SEA & STOLEN CARS', 210, 'bold 22px Arial, sans-serif', '#14b8a6');
  centerText(ctx, 'An open-world crime story in the city of Solmar.', 258, '18px Arial, sans-serif', '#e5e7eb');
  centerText(ctx, 'Maya Cortez owes Rook. Six jobs will clear the debt —', 288, '16px Arial, sans-serif', '#d1d5db');
  centerText(ctx, 'if the Solmar PD does not catch her first.', 312, '16px Arial, sans-serif', '#d1d5db');

  const w = 560;
  const h = 210;
  panel(ctx, VIEW_WIDTH / 2 - w / 2, 350, w, h);
  ctx.textAlign = 'left';
  ctx.font = '15px Arial, sans-serif';
  ctx.fillStyle = '#e5e7eb';
  const lines = [
    'WASD / Arrows — move or drive      SHIFT — sprint',
    'Mouse — aim      Click — shoot      F — enter / exit car',
    'E — interact (start mission, pick up a fare)      SPACE — handbrake',
    'M — mute      P / ESC — pause      R — restart mission',
  ];
  lines.forEach((line, i) => {
    ctx.fillText(line, VIEW_WIDTH / 2 - w / 2 + 24, 382 + i * 26);
  });
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.fillStyle = '#ffd23f';
  ctx.fillText('Free roam after the story: taxi fares pay cash,', VIEW_WIDTH / 2 - w / 2 + 24, 382 + 4 * 26 + 8);
  ctx.fillText('hidden packages are worth $200 each.', VIEW_WIDTH / 2 - w / 2 + 24, 382 + 5 * 26 + 8);

  const pulse = 0.65 + Math.sin(state.time * 4) * 0.35;
  ctx.globalAlpha = pulse;
  centerText(ctx, state.hasSave ? 'CLICK OR PRESS ENTER — CONTINUE' : 'CLICK OR PRESS ENTER — START', 620, 'bold 24px Arial, sans-serif', '#ffffff');
  ctx.globalAlpha = 1;
  centerText(ctx, 'Progress saves automatically after every mission.', 656, '13px Arial, sans-serif', '#9ca3af');
}

export function drawPauseScreen(ctx, state) {
  ctx.fillStyle = 'rgba(6,10,18,0.7)';
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  centerText(ctx, 'PAUSED', 240, 'bold 64px Arial, sans-serif', '#ffd23f');
  const lines = [
    'P / ESC — resume',
    'M — ' + (state.muted ? 'unmute' : 'mute') + ' sound',
    'Cash $' + state.progress.cash.toLocaleString('en-US') + '  •  Missions done ' + state.progress.state.stats.missionsDone + ' / 6',
    'Cars stolen ' + state.progress.state.stats.carsStolen + '  •  Fares ' + state.progress.state.stats.faresDone,
    'Hidden packages ' + state.progress.state.packagesCollected.length + ' / 10',
  ];
  lines.forEach((line, i) => {
    centerText(ctx, line, 320 + i * 30, i === 0 ? 'bold 18px Arial, sans-serif' : '16px Arial, sans-serif', i === 0 ? '#ffffff' : '#d1d5db');
  });
}

export function drawMissionBriefing(ctx, mission) {
  const w = 640;
  const h = 150 + mission.briefing.length * 24;
  const x = VIEW_WIDTH / 2 - w / 2;
  const y = 120;
  panel(ctx, x, y, w, h);
  ctx.textAlign = 'left';
  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.fillStyle = '#ffd23f';
  ctx.fillText(mission.title.toUpperCase() + '  •  $' + mission.payout.toLocaleString('en-US'), x + 24, y + 36);
  ctx.font = '16px Arial, sans-serif';
  ctx.fillStyle = '#e5e7eb';
  mission.briefing.forEach((line, i) => {
    ctx.fillText(line, x + 24, y + 70 + i * 24);
  });
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.fillStyle = '#9ca3af';
  ctx.fillText('Press E to accept, or walk away.', x + 24, y + h - 18);
}

// A big transient banner ("MISSION COMPLETE", "BUSTED", ...).
export function drawBanner(ctx, banner) {
  if (!banner) return;
  const a = Math.max(0, Math.min(1, banner.life / 0.4));
  ctx.globalAlpha = a;
  const y = 180;
  ctx.font = 'bold 54px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(banner.text, VIEW_WIDTH / 2, y);
  ctx.fillStyle = banner.color || '#ffffff';
  ctx.fillText(banner.text, VIEW_WIDTH / 2, y);
  if (banner.sub) {
    ctx.font = '20px Arial, sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeText(banner.sub, VIEW_WIDTH / 2, y + 36);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(banner.sub, VIEW_WIDTH / 2, y + 36);
  }
  ctx.globalAlpha = 1;
}

// Dialogue line at the bottom of the screen (Rook's briefings).
export function drawDialogue(ctx, line) {
  if (!line) return;
  const w = 760;
  const h = 64;
  const x = VIEW_WIDTH / 2 - w / 2;
  const y = VIEW_HEIGHT - h - 24;
  ctx.fillStyle = 'rgba(10,14,22,0.85)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(20,184,166,0.8)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.textAlign = 'left';
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.fillStyle = '#14b8a6';
  ctx.fillText(line.who || 'ROOK', x + 16, y + 22);
  ctx.font = '15px Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(line.text, x + 16, y + 46);
}

// Busted / wasted full-screen card.
export function drawEndCard(ctx, kind, detail) {
  ctx.fillStyle = kind === 'busted' ? 'rgba(20,40,120,0.82)' : 'rgba(120,20,20,0.82)';
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  centerText(ctx, kind === 'busted' ? 'BUSTED' : 'WASTED', 300, 'bold 84px Arial, sans-serif', '#ffffff');
  centerText(ctx, detail, 360, '20px Arial, sans-serif', '#e5e7eb');
  centerText(ctx, 'Press ENTER to keep playing', 420, 'bold 18px Arial, sans-serif', '#ffd23f');
}

// Story complete card.
export function drawStoryComplete(ctx, state) {
  ctx.fillStyle = 'rgba(6,20,12,0.85)';
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  centerText(ctx, 'KING OF SOLMAR', 260, 'bold 64px Arial, sans-serif', '#ffd23f');
  centerText(ctx, 'Maya cleared her debt. The city is hers now.', 320, '20px Arial, sans-serif', '#e5e7eb');
  const s = state.progress.state.stats;
  centerText(ctx, 'Missions 6/6  •  Cash $' + state.progress.cash.toLocaleString('en-US'), 370, '18px Arial, sans-serif', '#ffffff');
  centerText(ctx, 'Cars stolen ' + s.carsStolen + '  •  Fares ' + s.faresDone + '  •  Packages ' + state.progress.state.packagesCollected.length + '/10', 400, '16px Arial, sans-serif', '#d1d5db');
  centerText(ctx, 'Press ENTER to keep playing in free roam', 460, 'bold 18px Arial, sans-serif', '#14b8a6');
}
