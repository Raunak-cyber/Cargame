import * as CANNON from 'cannon-es';
import {
  CarCustomization,
  CarSpec,
  CarUpgrades,
  EffectiveCarPerformance,
} from '../types/game';
import {
  getTrackSurfaceHeight,
  isPositionOnAnyRoad,
  TrackPoint,
} from './tracks';

export interface VehicleInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (right) to +1 (left)
  handbrake: boolean;
  nitro: boolean;
}

export interface VehicleState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number; // radians, 0 faces -Z
  angularVelY: number;
  speedMs: number;
  forwardSpeedMs: number;
  lateralSpeedMs: number;
  slipAngleRad: number;
  isDrifting: boolean;
  nitro: number; // 0..100
  nitroActive: boolean;
  damage: number; // 0..100
  steerAngle: number; // front wheel visual steer angle
  wheelSpin: number; // cumulative wheel rotation rad
  suspensionPitch: number; // dive/squat rad
  suspensionRoll: number; // body roll rad
  suspensionBounce: number; // vertical heave offset m
  gear: string;
  rpm: number;
  brakingLights: boolean;
  onRoad: boolean;
  lastImpactIntensity: number;
}

export interface ObstacleCollider {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  height: number;
}

export function computeEffectiveStats(
  spec: CarSpec,
  upgrades: CarUpgrades
): EffectiveCarPerformance {
  const engMult = 1 + upgrades.engine * 0.085;
  const brkMult = 1 + upgrades.brakes * 0.11;
  const hndMult = 1 + upgrades.handling * 0.08;
  const nitMult = 1 + upgrades.nitro * 0.12;

  const maxSpeedMs = spec.physics.maxSpeedMs * (1 + upgrades.engine * 0.055);
  const topSpeedKmh = Math.round(maxSpeedMs * 3.6);

  return {
    topSpeedKmh,
    maxSpeedMs,
    maxEngineForce: spec.physics.maxEngineForce * engMult,
    brakeForce: spec.physics.brakeForce * brkMult,
    steeringResponse: spec.physics.steeringResponse * hndMult,
    lateralGrip: spec.physics.lateralGrip * hndMult,
    driftGrip: spec.physics.driftGrip * (1 + upgrades.handling * 0.04),
    nitroPower: spec.physics.nitroPower * (1 + upgrades.nitro * 0.06),
    nitroCapacity: 100 * nitMult,
    accelRating: Math.min(99, Math.round(spec.stats.acceleration + upgrades.engine * 4)),
    handlingRating: Math.min(99, Math.round(spec.stats.handling + upgrades.handling * 4)),
    brakingRating: Math.min(99, Math.round(spec.stats.braking + upgrades.brakes * 4)),
    speedRating: Math.min(99, Math.round((topSpeedKmh / 380) * 100)),
  };
}

export function computeGearAndRpm(
  forwardSpeedMs: number,
  maxSpeedMs: number,
  throttle: number
): { gear: string; rpm: number } {
  if (forwardSpeedMs < -0.8) {
    const revRatio = Math.min(1, Math.abs(forwardSpeedMs) / 22);
    return { gear: 'R', rpm: Math.round(1400 + revRatio * 5600) };
  }
  const absSpeed = Math.abs(forwardSpeedMs);
  if (absSpeed < 0.6 && throttle < 0.05) {
    return { gear: 'N', rpm: 950 };
  }

  const speedRatio = Math.min(1.04, absSpeed / Math.max(10, maxSpeedMs));
  const gearThresholds = [0.16, 0.32, 0.5, 0.68, 0.85, 1.05];
  let gearIdx = 1;
  let prev = 0;
  for (let i = 0; i < gearThresholds.length; i++) {
    if (speedRatio <= gearThresholds[i] || i === gearThresholds.length - 1) {
      gearIdx = i + 1;
      const span = gearThresholds[i] - prev;
      const inGear = Math.max(0, Math.min(1, (speedRatio - prev) / span));
      const baseRpm = gearIdx === 1 ? 1500 : 2800;
      const targetRpm = baseRpm + inGear * (8000 - baseRpm) + throttle * 450;
      return {
        gear: String(gearIdx),
        rpm: Math.min(8400, Math.round(targetRpm)),
      };
    }
    prev = gearThresholds[i];
  }
  return { gear: '6', rpm: 7800 };
}

export function calculateDriftStep(
  isDrifting: boolean,
  speedMs: number,
  slipAngleRad: number,
  dt: number,
  currentStreakPoints: number,
  multiplier: number
): {
  active: boolean;
  addedPoints: number;
  newMultiplier: number;
  bankPoints: number;
} {
  const absSlip = Math.abs(slipAngleRad);
  if (speedMs > 9 && absSlip > 0.2 && absSlip < 1.48) {
    const rate = 140 * (speedMs / 25) * Math.min(1.6, absSlip * 2.1);
    const added = rate * dt;
    const nextStreak = currentStreakPoints + added;
    const nextMult = Math.min(5, 1 + Math.floor(nextStreak / 350));
    return {
      active: true,
      addedPoints: added,
      newMultiplier: nextMult,
      bankPoints: 0,
    };
  }
  if (isDrifting && currentStreakPoints > 25) {
    return {
      active: false,
      addedPoints: 0,
      newMultiplier: 1,
      bankPoints: Math.round(currentStreakPoints * multiplier),
    };
  }
  return {
    active: false,
    addedPoints: 0,
    newMultiplier: 1,
    bankPoints: 0,
  };
}

export function checkCheckpointProximity(
  carX: number,
  carZ: number,
  checkpoint: TrackPoint,
  radius = 15
): boolean {
  const dx = carX - checkpoint.x;
  const dz = carZ - checkpoint.z;
  return dx * dx + dz * dz <= radius * radius;
}

export function createInitialVehicleState(
  x = 0,
  y = 0,
  z = 40,
  yaw = 0
): VehicleState {
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw,
    angularVelY: 0,
    speedMs: 0,
    forwardSpeedMs: 0,
    lateralSpeedMs: 0,
    slipAngleRad: 0,
    isDrifting: false,
    nitro: 100,
    nitroActive: false,
    damage: 0,
    steerAngle: 0,
    wheelSpin: 0,
    suspensionPitch: 0,
    suspensionRoll: 0,
    suspensionBounce: 0,
    gear: 'N',
    rpm: 950,
    brakingLights: false,
    onRoad: true,
    lastImpactIntensity: 0,
  };
}

export function stepVehicleDynamics(
  state: VehicleState,
  input: VehicleInput,
  spec: CarSpec,
  customization: CarCustomization,
  dt: number,
  surfaceY?: number,
  onRoadOverride?: boolean
): VehicleState {
  const clampedDt = Math.min(Math.max(dt, 0.001), 0.05);
  const perf = computeEffectiveStats(spec, customization.upgrades);

  // Forward & Right vectors in XZ plane (yaw = 0 faces -Z)
  const fx = -Math.sin(state.yaw);
  const fz = -Math.cos(state.yaw);
  const rx = Math.cos(state.yaw);
  const rz = -Math.sin(state.yaw);

  let forwardSpeed = state.vx * fx + state.vz * fz;
  let lateralSpeed = state.vx * rx + state.vz * rz;

  // Nitro logic
  const canNitro = input.nitro && state.nitro > 1 && input.throttle > 0.1;
  const nitroActive = canNitro;
  let nitro = state.nitro;
  if (nitroActive) {
    nitro = Math.max(0, nitro - 24 * clampedDt);
  } else {
    nitro = Math.min(100, nitro + (state.isDrifting ? 14 : 6) * clampedDt);
  }

  // Damage slightly caps top speed if heavily wrecked (> 60%), without soft-locking
  const damageFactor = 1 - Math.min(0.25, (state.damage / 100) * 0.25);
  const effectiveMaxSpeed =
    perf.maxSpeedMs * (nitroActive ? 1.24 : 1.0) * damageFactor;

  const accelScale = perf.maxEngineForce / spec.physics.massKg;
  const brakeScale = perf.brakeForce / spec.physics.massKg;

  // Longitudinal forces
  let longAccel = 0;
  let brakingLights = false;

  if (input.throttle > 0.01) {
    const speedFrac = Math.max(0, forwardSpeed / effectiveMaxSpeed);
    const torqueCurve = Math.max(0.18, 1 - speedFrac * 0.82);
    longAccel +=
      input.throttle *
      accelScale *
      14.5 *
      torqueCurve *
      (nitroActive ? perf.nitroPower : 1.0);
  }

  if (input.brake > 0.01) {
    brakingLights = true;
    if (forwardSpeed > 1.2) {
      longAccel -= input.brake * brakeScale * 13.5;
    } else {
      // Reverse gear
      const revMax = -24;
      if (forwardSpeed > revMax) {
        longAccel -= input.brake * accelScale * 8.5;
      }
    }
  }

  if (input.handbrake) {
    brakingLights = true;
    longAccel -= Math.sign(forwardSpeed) * 14 * Math.min(1, Math.abs(forwardSpeed) / 5);
  }

  // Aerodynamic drag + rolling resistance + off-road penalty
  const onRoad = onRoadOverride ?? isPositionOnAnyRoad(state.x, state.z);
  const rollingDrag = onRoad ? 0.32 : 0.95;
  const aeroDrag = 0.0028 * forwardSpeed * Math.abs(forwardSpeed);
  longAccel -= forwardSpeed * rollingDrag + aeroDrag;

  forwardSpeed += longAccel * clampedDt;
  forwardSpeed = Math.max(-25, Math.min(effectiveMaxSpeed, forwardSpeed));

  // Speed-dependent steering & drift yaw dynamics
  const absFwd = Math.abs(forwardSpeed);
  const speedSteerDrop = 1 / (1 + absFwd * 0.018);
  const targetSteerAngle = input.steer * 0.48 * (0.45 + 0.55 * speedSteerDrop);
  const steerAngle =
    state.steerAngle +
    (targetSteerAngle - state.steerAngle) * (1 - Math.exp(-12 * clampedDt));

  const steerDirection = forwardSpeed >= -0.4 ? 1 : -1;
  const turnAuthority =
    Math.min(1, absFwd / 4.5) *
    perf.steeringResponse *
    (0.45 + 0.55 * speedSteerDrop) *
    (input.handbrake ? 1.38 : 1.0);

  const targetAngVel = steerAngle * turnAuthority * steerDirection * 2.6;
  const angularVelY =
    state.angularVelY +
    (targetAngVel - state.angularVelY) * (1 - Math.exp(-10 * clampedDt));

  const yaw = state.yaw + angularVelY * clampedDt;

  // Lateral grip vs Drift slip
  const isHandbrakeDrift = input.handbrake && absFwd > 7;
  const slipAngle =
    absFwd > 2.5 ? Math.atan2(lateralSpeed, Math.abs(forwardSpeed)) : 0;
  const isDrifting =
    (isHandbrakeDrift || Math.abs(slipAngle) > 0.22) && absFwd > 8.5;

  const activeGrip = isHandbrakeDrift
    ? perf.driftGrip * 0.65
    : isDrifting
      ? perf.driftGrip
      : perf.lateralGrip;

  // Centrifugal kick from angular velocity creates natural drift feel
  const centrifugal = -angularVelY * forwardSpeed * 0.34 * spec.stats.driftBias;
  lateralSpeed += centrifugal * clampedDt;
  lateralSpeed *= Math.exp(-activeGrip * (onRoad ? 1.0 : 0.72) * clampedDt);

  // Reconstruct world XZ velocity from new heading
  const nfx = -Math.sin(yaw);
  const nfz = -Math.cos(yaw);
  const nrx = Math.cos(yaw);
  const nrz = -Math.sin(yaw);

  const vx = nfx * forwardSpeed + nrx * lateralSpeed;
  const vz = nfz * forwardSpeed + nrz * lateralSpeed;

  const nextX = state.x + vx * clampedDt;
  const nextZ = state.z + vz * clampedDt;

  // Terrain / road elevation follow with spring suspension
  const groundY = surfaceY ?? getTrackSurfaceHeight(nextX, nextZ);
  let nextY = state.y;
  let nextVy = state.vy;
  if (nextY > groundY + 0.02) {
    nextVy -= 22 * clampedDt;
    nextY += nextVy * clampedDt;
    if (nextY <= groundY) {
      nextY = groundY;
      nextVy = 0;
    }
  } else {
    nextY += (groundY - nextY) * (1 - Math.exp(-18 * clampedDt));
    nextVy = 0;
  }

  // Suspension pitch (squat on throttle, dive on brake) and roll (lateral G)
  const targetPitch = Math.max(-0.06, Math.min(0.06, -longAccel * 0.0018));
  const targetRoll = Math.max(-0.08, Math.min(0.08, angularVelY * forwardSpeed * 0.0016));
  const suspensionPitch =
    state.suspensionPitch +
    (targetPitch - state.suspensionPitch) * (1 - Math.exp(-9 * clampedDt));
  const suspensionRoll =
    state.suspensionRoll +
    (targetRoll - state.suspensionRoll) * (1 - Math.exp(-9 * clampedDt));

  const speedMs = Math.hypot(vx, vz);
  const { gear, rpm } = computeGearAndRpm(forwardSpeed, perf.maxSpeedMs, input.throttle);

  // Map world bounds clamp (-520..520)
  const clampedX = Math.max(-520, Math.min(520, nextX));
  const clampedZ = Math.max(-520, Math.min(520, nextZ));

  return {
    ...state,
    x: clampedX,
    y: nextY,
    z: clampedZ,
    vx,
    vy: nextVy,
    vz,
    yaw,
    angularVelY,
    speedMs,
    forwardSpeedMs: forwardSpeed,
    lateralSpeedMs: lateralSpeed,
    slipAngleRad: slipAngle,
    isDrifting,
    nitro,
    nitroActive,
    steerAngle,
    wheelSpin: state.wheelSpin + (forwardSpeed * clampedDt) / 0.36,
    suspensionPitch,
    suspensionRoll,
    suspensionBounce: onRoad ? 0 : Math.sin(state.wheelSpin * 1.7) * 0.025,
    gear,
    rpm,
    brakingLights,
    onRoad,
    lastImpactIntensity: 0,
  };
}

// Cannon-es Physics World Wrapper for real 3D rigidbody collisions & obstacle detection
export class CannonPhysicsWorld {
  public world: CANNON.World;
  public playerBody: CANNON.Body;
  private obstacleBoxes: ObstacleCollider[] = [];
  private aiBodies: Map<string, CANNON.Body> = new Map();

  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -18, 0),
    });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);

    const groundMat = new CANNON.Material('ground');
    const chassisMat = new CANNON.Material('chassis');
    const contact = new CANNON.ContactMaterial(groundMat, chassisMat, {
      friction: 0.05,
      restitution: 0.25,
    });
    this.world.addContactMaterial(contact);

    const groundBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: groundMat,
    });
    groundBody.addShape(new CANNON.Plane());
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(groundBody);

    this.playerBody = new CANNON.Body({
      mass: 1450,
      material: chassisMat,
      shape: new CANNON.Box(new CANNON.Vec3(1.05, 0.55, 2.35)),
      position: new CANNON.Vec3(0, 0.7, 40),
      linearDamping: 0.1,
      angularDamping: 0.5,
    });
    this.world.addBody(this.playerBody);
  }

  public addStaticBoxCollider(x: number, y: number, z: number, halfW: number, halfH: number, halfD: number) {
    this.obstacleBoxes.push({ x, z, halfW, halfD, height: halfH * 2 });
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(halfW, halfH, halfD)),
      position: new CANNON.Vec3(x, y, z),
    });
    this.world.addBody(body);
  }

  public syncAiBody(id: string, x: number, y: number, z: number, yaw: number) {
    let body = this.aiBodies.get(id);
    if (!body) {
      body = new CANNON.Body({
        type: CANNON.Body.KINEMATIC,
        shape: new CANNON.Box(new CANNON.Vec3(1.05, 0.55, 2.35)),
      });
      this.aiBodies.set(id, body);
      this.world.addBody(body);
    }
    body.position.set(x, y + 0.65, z);
    body.quaternion.setFromEuler(0, yaw, 0);
  }

  public removeAiBody(id: string) {
    const body = this.aiBodies.get(id);
    if (body) {
      this.world.removeBody(body);
      this.aiBodies.delete(id);
    }
  }

  public clearDynamicRacers() {
    for (const [, body] of this.aiBodies) {
      this.world.removeBody(body);
    }
    this.aiBodies.clear();
  }

  // Syncs our vehicle state through Cannon-es world collision checks and returns bounce/damage
  public stepAndResolveCollisions(
    state: VehicleState,
    dt: number
  ): {
    x: number;
    z: number;
    vx: number;
    vz: number;
    impactIntensity: number;
  } {
    const clampedDt = Math.min(dt, 0.05);
    this.playerBody.position.set(state.x, state.y + 0.65, state.z);
    this.playerBody.velocity.set(state.vx, 0, state.vz);
    this.playerBody.quaternion.setFromEuler(0, state.yaw, 0);

    this.world.step(1 / 60, clampedDt, 2);

    let outX = state.x;
    let outZ = state.z;
    let outVx = state.vx;
    let outVz = state.vz;
    let maxImpact = 0;

    const carRadius = 1.65;

    // Static building/barrier AABB push-out
    for (let i = 0; i < this.obstacleBoxes.length; i++) {
      const box = this.obstacleBoxes[i];
      const closestX = Math.max(box.x - box.halfW, Math.min(outX, box.x + box.halfW));
      const closestZ = Math.max(box.z - box.halfD, Math.min(outZ, box.z + box.halfD));
      const dx = outX - closestX;
      const dz = outZ - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < carRadius * carRadius) {
        const dist = Math.sqrt(distSq) || 0.001;
        const nx = dx / dist;
        const nz = dz / dist;
        const pen = carRadius - dist;
        outX += nx * pen;
        outZ += nz * pen;

        const vn = outVx * nx + outVz * nz;
        if (vn < 0) {
          maxImpact = Math.max(maxImpact, Math.abs(vn));
          outVx -= 1.42 * vn * nx;
          outVz -= 1.42 * vn * nz;
          outVx *= 0.78;
          outVz *= 0.78;
        }
      }
    }

    // AI / multiplayer car sphere-capsule collision
    for (const [, aiBody] of this.aiBodies) {
      const dx = outX - aiBody.position.x;
      const dz = outZ - aiBody.position.z;
      const distSq = dx * dx + dz * dz;
      const minDist = 2.9;
      if (distSq < minDist * minDist && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const nz = dz / dist;
        const pen = minDist - dist;
        outX += nx * pen * 0.7;
        outZ += nz * pen * 0.7;

        const vn = outVx * nx + outVz * nz;
        if (vn < 0) {
          maxImpact = Math.max(maxImpact, Math.abs(vn) * 0.75);
          outVx -= 1.25 * vn * nx;
          outVz -= 1.25 * vn * nz;
        }
      }
    }

    // Perimeter boundary bounce
    if (Math.abs(outX) >= 518) {
      maxImpact = Math.max(maxImpact, Math.abs(outVx));
      outVx *= -0.5;
      outX = Math.sign(outX) * 517;
    }
    if (Math.abs(outZ) >= 518) {
      maxImpact = Math.max(maxImpact, Math.abs(outVz));
      outVz *= -0.5;
      outZ = Math.sign(outZ) * 517;
    }

    return {
      x: outX,
      z: outZ,
      vx: outVx,
      vz: outVz,
      impactIntensity: maxImpact,
    };
  }
}
