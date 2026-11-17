import test from 'node:test';
import assert from 'node:assert/strict';
import { getCarSpec, createDefaultCustomization } from './carsCatalog';
import {
  calculateDriftStep,
  checkCheckpointProximity,
  computeEffectiveStats,
  computeGearAndRpm,
  createInitialVehicleState,
  stepVehicleDynamics,
} from './physics';

test('computeEffectiveStats scales engine, handling, braking, and nitro upgrades', () => {
  const car = getCarSpec('kuro_gtr');
  const base = computeEffectiveStats(car, { engine: 0, brakes: 0, handling: 0, nitro: 0 });
  const maxed = computeEffectiveStats(car, { engine: 3, brakes: 3, handling: 3, nitro: 3 });

  assert.ok(maxed.topSpeedKmh > base.topSpeedKmh);
  assert.ok(maxed.maxEngineForce > base.maxEngineForce);
  assert.ok(maxed.brakeForce > base.brakeForce);
  assert.ok(maxed.lateralGrip > base.lateralGrip);
  assert.ok(maxed.nitroPower > base.nitroPower);
});

test('computeGearAndRpm handles neutral, reverse, and sequential forward gears', () => {
  const neutral = computeGearAndRpm(0, 80, 0);
  assert.equal(neutral.gear, 'N');
  assert.equal(neutral.rpm, 950);

  const reverse = computeGearAndRpm(-10, 80, 0);
  assert.equal(reverse.gear, 'R');
  assert.ok(reverse.rpm > 1400);

  const first = computeGearAndRpm(8, 80, 1);
  assert.equal(first.gear, '1');

  const sixth = computeGearAndRpm(75, 80, 1);
  assert.equal(sixth.gear, '6');
  assert.ok(sixth.rpm > 5000);
});

test('stepVehicleDynamics accelerates forward with throttle and steers smoothly', () => {
  const car = getCarSpec('solaris_evo');
  const custom = createDefaultCustomization(car);
  let state = createInitialVehicleState(0, 0, 40, 0);

  for (let i = 0; i < 60; i++) {
    state = stepVehicleDynamics(
      state,
      { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false },
      car,
      custom,
      1 / 60,
      0,
      true
    );
  }

  assert.ok(state.speedMs > 15, `expected speed > 15 m/s, got ${state.speedMs}`);
  assert.ok(state.z < 35, `expected car to move toward -Z, z=${state.z}`);
  assert.ok(state.wheelSpin > 5);

  // Nitro consumes nitro and boosts speed
  const nitroBefore = state.nitro;
  state = stepVehicleDynamics(
    state,
    { throttle: 1, brake: 0, steer: 0.4, handbrake: false, nitro: true },
    car,
    custom,
    0.05,
    0,
    true
  );
  assert.equal(state.nitroActive, true);
  assert.ok(state.nitro < nitroBefore);
  assert.ok(state.steerAngle > 0);
});

test('calculateDriftStep awards points during slip and banks points on recovery', () => {
  const active = calculateDriftStep(false, 25, 0.45, 0.05, 0, 1);
  assert.equal(active.active, true);
  assert.ok(active.addedPoints > 0);

  const banked = calculateDriftStep(true, 22, 0.05, 0.05, 420, 2);
  assert.equal(banked.active, false);
  assert.equal(banked.bankPoints, 840);
});

test('checkCheckpointProximity detects radius crossing', () => {
  const cp = { x: 100, y: 0, z: -50, width: 18 };
  assert.equal(checkCheckpointProximity(105, -48, cp, 15), true);
  assert.equal(checkCheckpointProximity(130, -50, cp, 15), false);
});
