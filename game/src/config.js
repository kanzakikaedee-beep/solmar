// Solmar — configuration: tuning constants, palette, key bindings.
// One place for every number the rest of the game reads, so balance lives here.

export const GAME_TITLE = 'SOLMAR';
export const GAME_SUBTITLE = 'Sun, Sea & Stolen Cars';

// World geometry (world units are pixels, top-down).
export const WORLD_SIZE = 3600; // square city, 0..3600 on both axes
export const BLOCK_PITCH = 300; // road centre to road centre
export const ROAD_WIDTH = 64;
export const SIDEWALK_WIDTH = 14;

// Canvas the game renders into (screenshots are taken at this size).
export const VIEW_W = 1280;
export const VIEW_H = 720;
// Aliases used by the render and HUD modules.
export const VIEW_WIDTH = VIEW_W;
export const VIEW_HEIGHT = VIEW_H;
export const MINIMAP_SIZE = 190;

// Player on foot.
export const PLAYER_RADIUS = 13;
export const PLAYER_WALK_SPEED = 250;
export const PLAYER_SPRINT_SPEED = 345;
export const PLAYER_ACCEL = 2400;
export const PLAYER_FRICTION = 6.5;
export const PLAYER_MAX_HEALTH = 100;
export const PLAYER_HEALTH_REGEN_DELAY = 5; // seconds without damage before regen
export const PLAYER_HEALTH_REGEN_RATE = 6; // hp per second

// Driving.
export const CAR_ENGINE_FORCE = 620; // px/s^2
export const CAR_BRAKE_FORCE = 900;
export const CAR_REVERSE_MAX = 220;
export const CAR_MAX_SPEED = { sedan: 560, taxi: 540, sport: 720, truck: 470, police: 660, van: 500 };
export const CAR_STEER_RATE = 2.6; // rad/s at full lock, scaled down with speed
export const CAR_GRIP = 3.2; // lateral velocity damping (higher = less slide)
export const CAR_HANDBRAKE_GRIP = 0.7;
export const CAR_MAX_HEALTH = 100;

// Combat.
export const PISTOL_DAMAGE = 12;
export const PISTOL_FIRE_INTERVAL = 0.24; // seconds between shots
export const PISTOL_MAGAZINE = 12;
export const PISTOL_RELOAD_TIME = 1.1;
export const BULLET_SPEED = 950;
export const BULLET_RANGE = 620;
export const MELEE_DAMAGE = 20;
export const MELEE_RANGE = 46;
export const MELEE_INTERVAL = 0.45;
export const ENEMY_HEALTH = 40;
export const COP_FOOT_HEALTH = 50;

// Wanted system.
export const WANTED_HEAT_PER_STAR = 20;
export const WANTED_MAX_STARS = 5;
export const WANTED_DECAY_PER_SEC = 1.0; // heat lost while unseen (a star takes ~20s to shake)
export const WANTED_DECAY_HIDDEN_MULT = 1.2;
export const HEAT_STEAL_CAR = 25;
export const HEAT_SHOT_HEARD = 8;
export const HEAT_KILL_PED = 30;
export const HEAT_KILL_COP = 40;
export const HEAT_RAM_COP = 15;
export const POLICE_SPAWN_DISTANCE = 480; // inside the cops' sight range (520), so they arrive seeing the player
export const POLICE_MAX_ACTIVE = { 0: 0, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6 };
export const BUST_CASH_LOSS = 0.1; // fraction of cash lost when busted/wasted

// Traffic and pedestrians.
export const TRAFFIC_TARGET_COUNT = 14;
export const PED_TARGET_COUNT = 26;
export const TRAFFIC_DESPAWN_DISTANCE = 1400;
export const TRAFFIC_SPAWN_DISTANCE = 900;

// Missions and economy.
export const TAXI_FARE_MIN = 100;
export const TAXI_FARE_MAX = 260;
export const PACKAGE_REWARD = 200;
export const PACKAGE_COUNT = 10;
export const PAYNSPRAY_COST = 200;
export const SAVE_KEY = 'solmar-save-v1';
export const SAVE_VERSION = 1;

// Camera.
export const CAMERA_SMOOTH_RATE = 6.0;
export const CAMERA_LOOKAHEAD = 46;
export const CAMERA_ZOOM_FOOT = 1.0;
export const CAMERA_ZOOM_DRIVE = 0.82;

// Sun-soaked palette for the city.
export const PALETTE = {
  grass: '#7fae62',
  grassDark: '#74a158',
  sand: '#e8d39a',
  sea: '#2e8fa8',
  seaDeep: '#227a92',
  road: '#3d3a38',
  roadEdge: '#2c2a28',
  lane: '#d8c95a',
  sidewalk: '#b9b2a4',
  sidewalkEdge: '#9d968a',
  roofDowntown: '#5d6b7a',
  roofDowntown2: '#7a6a8a',
  roofOldTown: '#b06a4a',
  roofSuburb: '#a8544a',
  roofHarbor: '#6a7a72',
  wall: '#e8ddc8',
  park: '#5d9b52',
  tree: '#3f7a3a',
  treeLight: '#57a04e',
  waterEdge: '#cfe8e2',
  player: '#ffcf3f',
  playerDark: '#c98f1b',
  police: '#2b6fd6',
  policeDark: '#174a94',
  taxi: '#f2b705',
  sport: '#d7263d',
  sedan: '#4a90d9',
  truck: '#8a8f98',
  van: '#c98a2e',
  pedShirt: ['#e2574c', '#4c9be2', '#7bc96f', '#e2a63d', '#9b59b6', '#e2e2e2'],
  hudBg: 'rgba(12, 16, 22, 0.72)',
  hudText: '#f5f1e6',
  hudAccent: '#ffcf3f',
  star: '#ffcf3f',
  starEmpty: 'rgba(245, 241, 230, 0.35)',
  mission: '#ffd23f',
  danger: '#ff4d4d',
};

// Keyboard bindings (KeyboardEvent.code values).
export const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyE'],
  enterCar: ['KeyF'],
  melee: ['KeyV'],
  reload: ['KeyR'],
  handbrake: ['Space'],
  pause: ['Escape', 'KeyP'],
  mute: ['KeyM'],
  minimapZoom: ['KeyN'],
};
