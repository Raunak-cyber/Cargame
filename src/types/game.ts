export type GameScreenState = 'title' | 'playing' | 'paused' | 'gameover';

export type ActiveMenuOverlay =
  | 'none'
  | 'garage'
  | 'modes'
  | 'multiplayer'
  | 'leaderboard'
  | 'settings';

export type GameMode =
  | 'free_roam'
  | 'quick_race'
  | 'time_trial'
  | 'checkpoint_race'
  | 'drift_challenge'
  | 'multiplayer';

export type TrackId = 'circuit' | 'city_highway' | 'mountain_pass';

export type TimeOfDay = 'day' | 'sunset' | 'night' | 'cycle';

export type WeatherType = 'clear' | 'fog' | 'rain';

export type CameraMode = 'chase' | 'cockpit' | 'bumper' | 'cinematic';

export type WheelDesign = 'turbine' | 'mesh_gt' | 'five_spoke' | 'deep_dish';

export type SpoilerDesign = 'none' | 'lip' | 'gt_wing' | 'swan_neck';

export type HeadlightStyle = 'xenon_white' | 'ice_blue' | 'amber_gt' | 'crimson_halo';

export interface CarUpgrades {
  engine: number; // 0..3
  brakes: number; // 0..3
  handling: number; // 0..3
  nitro: number; // 0..3
}

export interface CarCustomization {
  paintColor: string;
  secondaryColor: string;
  wheelDesign: WheelDesign;
  rimColor: string;
  spoiler: SpoilerDesign;
  headlightStyle: HeadlightStyle;
  upgrades: CarUpgrades;
}

export interface CarSpec {
  id: string;
  name: string;
  category: 'Hypercar' | 'Luxury GT' | 'Muscle' | 'JDM Tuner' | 'Supercar';
  tagline: string;
  price: number;
  defaultPaint: string;
  defaultSecondary: string;
  bodyStyle: 'hypercar' | 'luxury' | 'muscle' | 'jdm' | 'supercar';
  stats: {
    topSpeedKmh: number;
    acceleration: number; // 1..100
    handling: number; // 1..100
    braking: number; // 1..100
    driftBias: number; // 0.7..1.4
  };
  physics: {
    maxEngineForce: number;
    maxSpeedMs: number;
    brakeForce: number;
    steeringResponse: number;
    lateralGrip: number;
    driftGrip: number;
    nitroPower: number;
    massKg: number;
    suspensionStiffness: number;
  };
  audio: {
    baseFreq: number;
    maxFreq: number;
    harmonicMix: number;
    raspy: number;
    turboWhine: number;
  };
}

export interface EffectiveCarPerformance {
  topSpeedKmh: number;
  maxSpeedMs: number;
  maxEngineForce: number;
  brakeForce: number;
  steeringResponse: number;
  lateralGrip: number;
  driftGrip: number;
  nitroPower: number;
  nitroCapacity: number;
  accelRating: number;
  handlingRating: number;
  brakingRating: number;
  speedRating: number;
}

export interface GraphicsSettings {
  quality: 'low' | 'medium' | 'high';
  shadows: boolean;
  particles: boolean;
  weatherEffects: boolean;
}

export interface AudioSettings {
  master: number;
  engine: number;
  sfx: number;
  music: number;
  muted: boolean;
}

export interface RaceConfig {
  mode: GameMode;
  trackId: TrackId;
  laps: number;
  aiCount: number;
  timeOfDay: TimeOfDay;
  weather: WeatherType;
}

export interface MinimapEntity {
  id: string;
  x: number;
  z: number;
  yaw: number;
  kind: 'player' | 'ai' | 'remote';
  color: string;
}

export interface HudTelemetry {
  speedKmh: number;
  rpm: number;
  maxRpm: number;
  gear: string;
  nitro: number; // 0..100
  damage: number; // 0..100 (0 = pristine, 100 = wrecked)
  driftScore: number;
  currentDriftPoints: number;
  driftMultiplier: number;
  isDrifting: boolean;
  lap: number;
  totalLaps: number;
  checkpoint: number;
  totalCheckpoints: number;
  nextCheckpointPos: { x: number; z: number } | null;
  position: number;
  totalRacers: number;
  elapsedMs: number;
  timeLimitMs: number;
  bestLapMs: number | null;
  cameraMode: CameraMode;
  minimapEntities: MinimapEntity[];
  playerPos: { x: number; z: number; yaw: number };
  onRoad: boolean;
  wrongWay: boolean;
}

export interface RaceResultSummary {
  mode: GameMode;
  trackId: TrackId;
  carId: string;
  victory: boolean;
  position: number;
  totalRacers: number;
  elapsedMs: number;
  bestLapMs: number | null;
  driftScore: number;
  checkpointsPassed: number;
  rewardCredits: number;
  xpEarned: number;
  reason: string;
}

export interface PlayerProfile {
  playerId: string;
  playerName: string;
  credits: number;
  xp: number;
  level: number;
  selectedCarId: string;
  ownedCars: string[];
  customizations: Record<string, CarCustomization>;
  stats: {
    racesCompleted: number;
    wins: number;
    bestDriftScore: number;
    totalDistanceKm: number;
  };
}

export interface LeaderboardEntry {
  id: string;
  playerName: string;
  carId: string;
  carName: string;
  trackId: TrackId;
  mode: GameMode;
  bestTimeMs: number | null;
  driftScore: number;
  createdAt: string;
}

export interface MultiplayerPlayerInfo {
  socketId: string;
  playerName: string;
  carId: string;
  paintColor: string;
  ready: boolean;
  position?: { x: number; y: number; z: number };
  yaw?: number;
  speedKmh?: number;
  lap?: number;
  checkpoint?: number;
  finished?: boolean;
  finishTimeMs?: number;
}

export interface MultiplayerRoom {
  roomId: string;
  roomName: string;
  hostId: string;
  trackId: TrackId;
  laps: number;
  status: 'waiting' | 'countdown' | 'racing' | 'finished';
  players: MultiplayerPlayerInfo[];
  maxPlayers: number;
}
