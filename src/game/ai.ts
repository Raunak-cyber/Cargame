import { CAR_CATALOG } from './carsCatalog';
import { TrackDefinition, TrackPoint } from './tracks';
import { CarSpec } from '../types/game';

export interface AiRacer {
  id: string;
  name: string;
  spec: CarSpec;
  paintColor: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speedMs: number;
  waypointIndex: number;
  lap: number;
  checkpointIndex: number;
  laneOffset: number;
  targetLaneOffset: number;
  wheelSpin: number;
  steerAngle: number;
  nitroActive: boolean;
  finished: boolean;
  finishTimeMs: number | null;
  totalProgress: number;
}

const AI_NAMES = ['Vortex_K', 'Sora_GT', 'Rex_V8', 'Elena_R', 'Kaito_Z'];
const AI_COLORS = ['#ef4444', '#22c55e', '#eab308', '#a855f7', '#ec4899'];

export function createAiRacers(
  count: number,
  track: TrackDefinition,
  startOffset = 1
): AiRacer[] {
  const racers: AiRacer[] = [];
  const pts = track.waypoints;
  const n = pts.length;

  for (let i = 0; i < count; i++) {
    const spec = CAR_CATALOG[(i + 1) % CAR_CATALOG.length];
    // Place AI cars staggered behind/alongside grid ahead of player start
    const gridSlot = i + startOffset;
    const wpIdx = (n - 2 - Math.floor(gridSlot / 2) * 2 + n) % n;
    const p = pts[wpIdx];
    const next = pts[(wpIdx + 1) % n];
    const fx = next.x - p.x;
    const fz = next.z - p.z;
    const len = Math.hypot(fx, fz) || 1;
    const nx = fx / len;
    const nz = fz / len;
    const rx = -nz;
    const rz = nx;
    const lane = (gridSlot % 2 === 0 ? -1 : 1) * 3.4;

    racers.push({
      id: `ai_${i}`,
      name: AI_NAMES[i % AI_NAMES.length],
      spec,
      paintColor: AI_COLORS[i % AI_COLORS.length],
      x: p.x + rx * lane,
      y: p.y,
      z: p.z + rz * lane,
      yaw: Math.atan2(-nx, -nz),
      speedMs: 0,
      waypointIndex: (wpIdx + 1) % n,
      lap: 1,
      checkpointIndex: 0,
      laneOffset: lane,
      targetLaneOffset: lane,
      wheelSpin: 0,
      steerAngle: 0,
      nitroActive: false,
      finished: false,
      finishTimeMs: null,
      totalProgress: -gridSlot * 0.002,
    });
  }

  return racers;
}

export function stepAiRacer(
  ai: AiRacer,
  track: TrackDefinition,
  playerX: number,
  playerZ: number,
  otherRacers: AiRacer[],
  totalLaps: number,
  elapsedMs: number,
  dt: number
): void {
  const pts: TrackPoint[] = track.waypoints;
  const n = pts.length;
  const targetWp = pts[ai.waypointIndex];
  const lookAheadWp = pts[(ai.waypointIndex + 3) % n];
  const farWp = pts[(ai.waypointIndex + 6) % n];

  // Overtaking check: if player or another AI is directly ahead within 16m, shift lane
  let blockedAhead = false;
  const fdx = -Math.sin(ai.yaw);
  const fdz = -Math.cos(ai.yaw);

  const checkObstacle = (ox: number, oz: number) => {
    const dx = ox - ai.x;
    const dz = oz - ai.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 16 && dist > 0.5) {
      const forwardDot = (dx * fdx + dz * fdz) / dist;
      if (forwardDot > 0.82) {
        blockedAhead = true;
        const sideCross = fdx * dz - fdz * dx;
        ai.targetLaneOffset = sideCross > 0 ? -4.2 : 4.2;
      }
    }
  };

  checkObstacle(playerX, playerZ);
  for (let i = 0; i < otherRacers.length; i++) {
    if (otherRacers[i].id !== ai.id) {
      checkObstacle(otherRacers[i].x, otherRacers[i].z);
    }
  }
  if (!blockedAhead) {
    // Gently drift toward racing line
    ai.targetLaneOffset += (0 - ai.targetLaneOffset) * Math.min(1, dt * 0.6);
  }
  ai.laneOffset += (ai.targetLaneOffset - ai.laneOffset) * Math.min(1, dt * 2.5);

  // Tangent at target waypoint to apply lateral lane offset
  const prevWp = pts[(ai.waypointIndex - 1 + n) % n];
  const tx = targetWp.x - prevWp.x;
  const tz = targetWp.z - prevWp.z;
  const tLen = Math.hypot(tx, tz) || 1;
  const rx = -tz / tLen;
  const rz = tx / tLen;

  const aimX = targetWp.x + rx * ai.laneOffset;
  const aimZ = targetWp.z + rz * ai.laneOffset;

  const toTargetX = aimX - ai.x;
  const toTargetZ = aimZ - ai.z;
  const distToTarget = Math.hypot(toTargetX, toTargetZ);

  if (distToTarget < 12) {
    const prevIdx = ai.waypointIndex;
    ai.waypointIndex = (ai.waypointIndex + 1) % n;
    if (ai.waypointIndex < prevIdx) {
      ai.lap += 1;
      if (!ai.finished && ai.lap > totalLaps) {
        ai.finished = true;
        ai.finishTimeMs = elapsedMs;
      }
    }
  }

  // Compute curvature ahead to modulate cornering speed
  const v1x = lookAheadWp.x - targetWp.x;
  const v1z = lookAheadWp.z - targetWp.z;
  const v2x = farWp.x - lookAheadWp.x;
  const v2z = farWp.z - lookAheadWp.z;
  const l1 = Math.hypot(v1x, v1z) || 1;
  const l2 = Math.hypot(v2x, v2z) || 1;
  const dot = Math.max(-1, Math.min(1, (v1x * v2x + v1z * v2z) / (l1 * l2)));
  const cornerSeverity = 1 - dot; // 0 = straight, 0.5+ = tight turn

  const maxCruising = ai.spec.physics.maxSpeedMs * 0.84;
  const cornerTargetSpeed = maxCruising * Math.max(0.45, 1 - cornerSeverity * 1.4);

  // Rubber-band slightly so races stay exciting without feeling unfair
  const straightBoost = cornerSeverity < 0.04 && !blockedAhead;
  ai.nitroActive = straightBoost && ai.speedMs > 28 && Math.sin(elapsedMs * 0.002 + ai.laneOffset) > 0.65;
  const desiredSpeed = ai.finished
    ? 22
    : cornerTargetSpeed * (ai.nitroActive ? 1.12 : 1.0);

  const accelRate = ai.spec.stats.acceleration * 0.24;
  if (ai.speedMs < desiredSpeed) {
    ai.speedMs = Math.min(desiredSpeed, ai.speedMs + accelRate * dt);
  } else {
    ai.speedMs = Math.max(desiredSpeed, ai.speedMs - 24 * dt);
  }

  // Smooth steering toward aim point
  const desiredYaw = Math.atan2(-toTargetX, -toTargetZ);
  let yawDiff = desiredYaw - ai.yaw;
  while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
  while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

  const maxTurn = 2.9 * dt;
  const clampedTurn = Math.max(-maxTurn, Math.min(maxTurn, yawDiff * 4.2 * dt));
  ai.yaw += clampedTurn;
  ai.steerAngle = Math.max(-0.42, Math.min(0.42, yawDiff * 0.65));

  ai.x += -Math.sin(ai.yaw) * ai.speedMs * dt;
  ai.z += -Math.cos(ai.yaw) * ai.speedMs * dt;
  ai.y += (targetWp.y - ai.y) * Math.min(1, dt * 10);
  ai.wheelSpin += (ai.speedMs * dt) / 0.36;
  ai.totalProgress = (ai.lap - 1) + ai.waypointIndex / n;
}
