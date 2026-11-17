import { TrackId } from '../types/game';

export interface TrackPoint {
  x: number;
  y: number;
  z: number;
  width: number;
}

export interface TrackDefinition {
  id: TrackId;
  name: string;
  subtitle: string;
  lengthLabel: string;
  difficulty: 'Balanced' | 'High Speed' | 'Technical';
  roadWidth: number;
  timeTrialLimitMs: number;
  defaultLaps: number;
  waypoints: TrackPoint[];
}

// World terrain height function: flat city & circuit basin with scenic outer mountain ridge
export function groundHeightAt(x: number, z: number): number {
  const dist = Math.hypot(x, z);
  // Inner city + circuit + highway basin stays cleanly flat (y = 0) within r < 240
  if (dist < 235) return 0;

  // Mountain canyon zone in the North-West / North quadrant (z < -180 or x < -200)
  const rimT = Math.min(1, (dist - 235) / 140);
  const smoothRim = rimT * rimT * (3 - 2 * rimT);
  const ridgeWave =
    Math.sin(x * 0.014) * Math.cos(z * 0.014) * 18 +
    Math.sin(x * 0.032 + z * 0.025) * 6;
  return Math.max(0, smoothRim * (24 + ridgeWave));
}

function buildClosedCatmullPoints(
  control: { x: number; z: number; y?: number }[],
  subdivisions: number,
  width: number
): TrackPoint[] {
  const n = control.length;
  const out: TrackPoint[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = control[(i - 1 + n) % n];
    const p1 = control[i];
    const p2 = control[(i + 1) % n];
    const p3 = control[(i + 2) % n];

    for (let s = 0; s < subdivisions; s++) {
      const t = s / subdivisions;
      const t2 = t * t;
      const t3 = t2 * t;

      const x =
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const z =
        0.5 *
        (2 * p1.z +
          (-p0.z + p2.z) * t +
          (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
          (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
      const y1 = p1.y ?? 0;
      const y2 = p2.y ?? 0;
      const y0 = p0.y ?? 0;
      const y3 = p3.y ?? 0;
      const y =
        0.5 *
        (2 * y1 +
          (-y0 + y2) * t +
          (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 +
          (-y0 + 3 * y1 - 3 * y2 + y3) * t3);

      out.push({ x, y: Math.max(0, y), z, width });
    }
  }
  return out;
}

const CIRCUIT_CONTROL = [
  { x: 0, z: 40, y: 0 },
  { x: 0, z: -65, y: 0 },
  { x: 35, z: -145, y: 0 },
  { x: 120, z: -155, y: 0 },
  { x: 185, z: -95, y: 0 },
  { x: 165, z: -15, y: 0 },
  { x: 95, z: 10, y: 0 },
  { x: 125, z: 90, y: 0 },
  { x: 185, z: 145, y: 0 },
  { x: 120, z: 195, y: 0 },
  { x: 25, z: 165, y: 0 },
  { x: -5, z: 115, y: 0 },
];

const CITY_HIGHWAY_CONTROL = [
  { x: -120, z: 60, y: 0 },
  { x: -120, z: -85, y: 0 },
  { x: -105, z: -185, y: 0 },
  { x: 20, z: -205, y: 0 },
  { x: 145, z: -190, y: 0 },
  { x: 205, z: -85, y: 0 },
  { x: 205, z: 75, y: 0 },
  { x: 145, z: 195, y: 0 },
  { x: 0, z: 210, y: 0 },
  { x: -115, z: 170, y: 0 },
];

const MOUNTAIN_PASS_CONTROL = [
  { x: -175, z: 110, y: 0 },
  { x: -195, z: -10, y: 0 },
  { x: -245, z: -120, y: 4 },
  { x: -310, z: -215, y: 12 },
  { x: -215, z: -295, y: 15 },
  { x: -95, z: -270, y: 10 },
  { x: -25, z: -215, y: 3 },
  { x: -85, z: -135, y: 0 },
  { x: -90, z: -25, y: 0 },
  { x: -75, z: 95, y: 0 },
  { x: -125, z: 175, y: 0 },
];

export const TRACKS: Record<TrackId, TrackDefinition> = {
  circuit: {
    id: 'circuit',
    name: 'Apex Grand Circuit',
    subtitle: 'Sweeping tarmac corners, chicane complex, and pit-lane straight',
    lengthLabel: '1.15 km Loop',
    difficulty: 'Balanced',
    roadWidth: 18,
    timeTrialLimitMs: 75_000,
    defaultLaps: 3,
    waypoints: buildClosedCatmullPoints(CIRCUIT_CONTROL, 10, 18),
  },
  city_highway: {
    id: 'city_highway',
    name: 'Metro Expressway Ring',
    subtitle: 'High-speed downtown avenues, intersections, and perimeter highway',
    lengthLabel: '1.48 km Ring',
    difficulty: 'High Speed',
    roadWidth: 20,
    timeTrialLimitMs: 85_000,
    defaultLaps: 3,
    waypoints: buildClosedCatmullPoints(CITY_HIGHWAY_CONTROL, 10, 20),
  },
  mountain_pass: {
    id: 'mountain_pass',
    name: 'Obsidian Ridge Touge',
    subtitle: 'Elevated canyon switchbacks and technical alpine hairpins',
    lengthLabel: '1.36 km Touge',
    difficulty: 'Technical',
    roadWidth: 16,
    timeTrialLimitMs: 90_000,
    defaultLaps: 2,
    waypoints: buildClosedCatmullPoints(MOUNTAIN_PASS_CONTROL, 10, 16),
  },
};

export function getTrack(trackId: TrackId): TrackDefinition {
  return TRACKS[trackId] ?? TRACKS.circuit;
}

export function getTrackCheckpoints(track: TrackDefinition, count = 10): TrackPoint[] {
  const step = Math.max(1, Math.floor(track.waypoints.length / count));
  const cps: TrackPoint[] = [];
  for (let i = 0; i < count; i++) {
    cps.push(track.waypoints[(i * step) % track.waypoints.length]);
  }
  return cps;
}

export interface NearestTrackResult {
  index: number;
  point: TrackPoint;
  nextPoint: TrackPoint;
  distance: number;
  forwardX: number;
  forwardZ: number;
  yaw: number;
}

export function getNearestTrackInfo(
  track: TrackDefinition,
  x: number,
  z: number
): NearestTrackResult {
  const pts = track.waypoints;
  let bestIdx = 0;
  let bestDistSq = Infinity;

  for (let i = 0; i < pts.length; i++) {
    const dx = x - pts[i].x;
    const dz = z - pts[i].z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestDistSq) {
      bestDistSq = d2;
      bestIdx = i;
    }
  }

  const point = pts[bestIdx];
  const nextPoint = pts[(bestIdx + 1) % pts.length];
  const fx = nextPoint.x - point.x;
  const fz = nextPoint.z - point.z;
  const len = Math.hypot(fx, fz) || 1;
  const forwardX = fx / len;
  const forwardZ = fz / len;
  // Yaw convention: yaw = 0 faces -Z, turning left (+yaw) moves toward -X
  const yaw = Math.atan2(-forwardX, -forwardZ);

  return {
    index: bestIdx,
    point,
    nextPoint,
    distance: Math.sqrt(bestDistSq),
    forwardX,
    forwardZ,
    yaw,
  };
}

export function getTrackSurfaceHeight(x: number, z: number): number {
  let maxTrackY = 0;
  let onElevatedTrack = false;

  const trackList = Object.values(TRACKS);
  for (let t = 0; t < trackList.length; t++) {
    const track = trackList[t];
    const pts = track.waypoints;
    const halfW = track.roadWidth * 0.72;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.y <= 0.01) continue;
      const dx = x - p.x;
      const dz = z - p.z;
      if (dx * dx + dz * dz < halfW * halfW) {
        if (p.y > maxTrackY) {
          maxTrackY = p.y;
          onElevatedTrack = true;
        }
      }
    }
  }

  const ground = groundHeightAt(x, z);
  return onElevatedTrack ? maxTrackY : ground;
}

export function isPositionOnAnyRoad(x: number, z: number): boolean {
  // City grid avenues at x = -120..0 and z = -140..140
  if (Math.abs(x + 60) < 11 && Math.abs(z) < 190) return true;
  if (Math.abs(z) < 10 && x > -190 && x < 190) return true;

  const trackList = Object.values(TRACKS);
  for (let t = 0; t < trackList.length; t++) {
    const track = trackList[t];
    const halfW = track.roadWidth * 0.62;
    const halfWSq = halfW * halfW;
    const pts = track.waypoints;
    for (let i = 0; i < pts.length; i++) {
      const dx = x - pts[i].x;
      const dz = z - pts[i].z;
      if (dx * dx + dz * dz <= halfWSq) {
        return true;
      }
    }
  }
  return false;
}
