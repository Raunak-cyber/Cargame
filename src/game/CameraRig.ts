import * as THREE from 'three';
import { CameraMode } from '../types/game';
import { VehicleState } from './physics';

const _desiredPos = new THREE.Vector3();
const _desiredLook = new THREE.Vector3();
const _smoothPos = new THREE.Vector3(0, 5, 50);
const _smoothLook = new THREE.Vector3(0, 1, 35);
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();

export class CameraRig {
  public mode: CameraMode = 'chase';
  private trauma = 0;
  private cinematicAngle = 0;
  private initialized = false;

  public cycleMode(): CameraMode {
    const order: CameraMode[] = ['chase', 'cockpit', 'bumper', 'cinematic'];
    const idx = order.indexOf(this.mode);
    this.mode = order[(idx + 1) % order.length];
    return this.mode;
  }

  public addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  public snapToVehicle(camera: THREE.PerspectiveCamera, state: VehicleState): void {
    const fx = -Math.sin(state.yaw);
    const fz = -Math.cos(state.yaw);
    _smoothPos.set(state.x - fx * 7.8, state.y + 3.0, state.z - fz * 7.8);
    _smoothLook.set(state.x + fx * 6, state.y + 1.1, state.z + fz * 6);
    camera.position.copy(_smoothPos);
    camera.lookAt(_smoothLook);
    this.initialized = true;
  }

  public updateTitleFlyover(
    camera: THREE.PerspectiveCamera,
    elapsed: number,
    targetX = 0,
    targetY = 0,
    targetZ = 40
  ): void {
    // Hero front-3/4 orbit framing the car headlights, alloy wheels, and city skyline
    const angle = 2.38 + elapsed * 0.16;
    const radius = 8.4;
    camera.position.set(
      targetX + Math.sin(angle) * radius,
      targetY + 2.35 + Math.sin(elapsed * 0.45) * 0.35,
      targetZ + Math.cos(angle) * radius
    );
    camera.lookAt(targetX - 0.8, targetY + 0.85, targetZ);
    if (Math.abs(camera.fov - 52) > 0.2) {
      camera.fov = 52;
      camera.updateProjectionMatrix();
    }
  }

  public updateGarageCamera(
    camera: THREE.PerspectiveCamera,
    orbitYaw: number,
    orbitPitch: number,
    distance: number,
    center: THREE.Vector3
  ): void {
    const cosP = Math.cos(orbitPitch);
    const x = center.x + Math.sin(orbitYaw) * cosP * distance;
    const y = center.y + Math.sin(orbitPitch) * distance + 0.65;
    const z = center.z + Math.cos(orbitYaw) * cosP * distance;
    camera.position.set(x, y, z);
    // Offset look target right slightly so car sits centered in the open left 70% viewport next to the right dock
    const rightX = Math.cos(orbitYaw) * 0.85;
    const rightZ = -Math.sin(orbitYaw) * 0.85;
    camera.lookAt(center.x + rightX, center.y + 0.58, center.z + rightZ);
    if (Math.abs(camera.fov - 44) > 0.2) {
      camera.fov = 44;
      camera.updateProjectionMatrix();
    }
  }

  public updateGameplay(
    camera: THREE.PerspectiveCamera,
    state: VehicleState,
    dt: number
  ): void {
    if (!this.initialized) {
      this.snapToVehicle(camera, state);
    }

    const clampedDt = Math.min(dt, 0.05);
    this.trauma = Math.max(0, this.trauma - 1.8 * clampedDt);
    const shake = this.trauma * this.trauma;

    _forward.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
    _right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));

    const speedRatio = Math.min(1, state.speedMs / 90);
    let targetFov = 64 + speedRatio * 14 + (state.nitroActive ? 7 : 0);

    if (this.mode === 'chase') {
      const dist = 7.4 + speedRatio * 1.4 + (state.nitroActive ? 0.6 : 0);
      const height = 2.75 + speedRatio * 0.35;
      _desiredPos
        .set(state.x, state.y + height, state.z)
        .addScaledVector(_forward, -dist)
        .addScaledVector(_right, state.angularVelY * 0.28);

      _desiredLook
        .set(state.x, state.y + 1.05, state.z)
        .addScaledVector(_forward, 7.5);

      const posLambda = 1 - Math.exp(-9.5 * clampedDt);
      const lookLambda = 1 - Math.exp(-14 * clampedDt);
      _smoothPos.lerp(_desiredPos, posLambda);
      _smoothLook.lerp(_desiredLook, lookLambda);
    } else if (this.mode === 'cockpit') {
      targetFov = 74 + speedRatio * 8;
      // Driver eye position forward inside windshield looking over hood & steering wheel
      _desiredPos
        .set(state.x, state.y + 1.0 + state.suspensionBounce, state.z)
        .addScaledVector(_right, -0.34)
        .addScaledVector(_forward, 0.02);

      _desiredLook
        .set(state.x, state.y + 0.88, state.z)
        .addScaledVector(_forward, 18)
        .addScaledVector(_right, -0.34 + state.steerAngle * 1.4);

      _smoothPos.copy(_desiredPos);
      _smoothLook.lerp(_desiredLook, 1 - Math.exp(-22 * clampedDt));
    } else if (this.mode === 'bumper') {
      targetFov = 78 + speedRatio * 10;
      _desiredPos
        .set(state.x, state.y + 0.62, state.z)
        .addScaledVector(_forward, 2.38);

      _desiredLook
        .set(state.x, state.y + 0.58, state.z)
        .addScaledVector(_forward, 22);

      _smoothPos.copy(_desiredPos);
      _smoothLook.copy(_desiredLook);
    } else {
      // Cinematic sweeping angle
      targetFov = 58 + speedRatio * 10;
      this.cinematicAngle += clampedDt * 0.38;
      const offsetAngle = state.yaw + Math.sin(this.cinematicAngle) * 0.95;
      const cx = -Math.sin(offsetAngle);
      const cz = -Math.cos(offsetAngle);
      _desiredPos.set(
        state.x - cx * 9.8,
        state.y + 2.4 + Math.cos(this.cinematicAngle * 1.4) * 1.1,
        state.z - cz * 9.8
      );
      _desiredLook.set(state.x, state.y + 0.95, state.z);

      _smoothPos.lerp(_desiredPos, 1 - Math.exp(-5.5 * clampedDt));
      _smoothLook.lerp(_desiredLook, 1 - Math.exp(-9 * clampedDt));
    }

    camera.position.copy(_smoothPos);
    if (shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shake * 0.65;
      camera.position.y += (Math.random() - 0.5) * shake * 0.45;
    }
    camera.lookAt(_smoothLook);

    const newFov = camera.fov + (targetFov - camera.fov) * (1 - Math.exp(-8 * clampedDt));
    if (Math.abs(newFov - camera.fov) > 0.05) {
      camera.fov = newFov;
      camera.updateProjectionMatrix();
    }
  }
}
