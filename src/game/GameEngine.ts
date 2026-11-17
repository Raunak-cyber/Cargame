import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SoundEngine } from '../audio/SoundEngine';
import {
  AudioSettings,
  CameraMode,
  CarCustomization,
  CarSpec,
  GameMode,
  GameScreenState,
  GraphicsSettings,
  MinimapEntity,
  MultiplayerPlayerInfo,
  RaceConfig,
  RaceResultSummary,
  HudTelemetry,
} from '../types/game';
import { createCarMesh, CarMeshHandle } from '../vehicles/CarMesh';
import { buildOpenWorld, WorldHandles } from '../world/WorldBuilder';
import { AiRacer, createAiRacers, stepAiRacer } from './ai';
import { CameraRig } from './CameraRig';
import { createDefaultCustomization, getCarSpec } from './carsCatalog';
import {
  calculateDriftStep,
  CannonPhysicsWorld,
  checkCheckpointProximity,
  createInitialVehicleState,
  stepVehicleDynamics,
  VehicleInput,
  VehicleState,
} from './physics';
import { getNearestTrackInfo, getTrack, getTrackCheckpoints } from './tracks';

export interface GameEngineCallbacks {
  onTelemetry: (telemetry: HudTelemetry) => void;
  onRaceFinish: (summary: RaceResultSummary) => void;
  onPauseToggle: () => void;
  onCameraChange: (mode: CameraMode) => void;
  onCountdownTick?: (count: number | null) => void;
  onMultiplayerSync?: (payload: {
    position: { x: number; y: number; z: number };
    yaw: number;
    speedKmh: number;
    lap: number;
    checkpoint: number;
    finished: boolean;
    finishTimeMs?: number;
  }) => void;
}

interface ParticleItem {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  kind: 'smoke' | 'spark';
}

const _dummy = new THREE.Object3D();
const _pColor = new THREE.Color();
const _garageCenter = new THREE.Vector3(0, 220.24, 0);

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export class GameEngine {
  private container: HTMLElement;
  private callbacks: GameEngineCallbacks;
  public sound: SoundEngine;

  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private world: WorldHandles;
  private physics: CannonPhysicsWorld;
  private cameraRig: CameraRig;

  private playerCarSpec: CarSpec;
  private playerCustomization: CarCustomization;
  private playerMesh: CarMeshHandle;
  private playerState: VehicleState;

  private garageCarMesh: CarMeshHandle | null = null;
  private garageOrbitYaw = 0.72;
  private garageOrbitPitch = 0.22;
  private garageOrbitDist = 7.4;
  private garageAutoSpin = true;

  private aiRacers: AiRacer[] = [];
  private aiMeshes: Map<string, CarMeshHandle> = new Map();
  private remoteMeshes: Map<
    string,
    { handle: CarMeshHandle; targetX: number; targetY: number; targetZ: number; targetYaw: number; speedKmh: number }
  > = new Map();

  // Zero-GC Particle Ring Buffer
  private particlePool: ParticleItem[] = [];
  private particleCursor = 0;
  private particleMesh: THREE.InstancedMesh;

  private keysHeld: Set<string> = new Set();
  private screenState: GameScreenState = 'title';
  private inGarage = false;

  private raceConfig: RaceConfig = {
    mode: 'free_roam',
    trackId: 'circuit',
    laps: 3,
    aiCount: 3,
    timeOfDay: 'day',
    weather: 'clear',
  };

  private graphicsSettings: GraphicsSettings = {
    quality: 'high',
    shadows: true,
    particles: true,
    weatherEffects: true,
  };

  // Race progression state
  private raceElapsedMs = 0;
  private countdownRemaining = 0;
  private lastCountdownInt: number | null = null;
  private currentLap = 1;
  private lapStartMs = 0;
  private bestLapMs: number | null = null;
  private nextCheckpointIdx = 1;
  private checkpointsPassed = 0;
  private driftScore = 0;
  private currentDriftPoints = 0;
  private driftMultiplier = 1;
  private raceEnded = false;

  // Loop & timing
  private frameId = 0;
  private lastTime = performance.now();
  private totalElapsed = 0;
  private lastHudEmit = 0;
  private lastMpEmit = 0;
  private disposed = false;

  constructor(
    container: HTMLElement,
    initialCarId: string,
    initialCustomization: CarCustomization | undefined,
    callbacks: GameEngineCallbacks
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.sound = new SoundEngine();
    this.isSoftwareGl = detectSoftwareGl();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';

    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(
      62,
      (container.clientWidth || window.innerWidth) /
        Math.max(1, container.clientHeight || window.innerHeight),
      0.15,
      1800
    );

    this.physics = new CannonPhysicsWorld();
    this.world = buildOpenWorld(
      this.scene,
      this.renderer,
      this.physics,
      this.isSoftwareGl
    );
    this.cameraRig = new CameraRig();

    // Initialize player car
    this.playerCarSpec = getCarSpec(initialCarId);
    this.playerCustomization =
      initialCustomization ?? createDefaultCustomization(this.playerCarSpec);
    this.playerState = createInitialVehicleState(0, 0, 40, 0);
    this.playerMesh = createCarMesh(this.playerCarSpec, this.playerCustomization, {
      isPlayer: true,
      castShadow: !this.isSoftwareGl,
    });
    this.playerMesh.root.position.set(0, 0, 40);
    this.scene.add(this.playerMesh.root);

    // Pooled InstancedMesh particle ring buffer (180 particles)
    const poolCount = 180;
    const pGeo = new THREE.SphereGeometry(0.32, 6, 5);
    const pMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
    });
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, poolCount);
    this.particleMesh.frustumCulled = false;
    for (let i = 0; i < poolCount; i++) {
      this.particlePool.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        scale: 0,
        kind: 'smoke',
      });
      _dummy.position.set(0, -50, 0);
      _dummy.scale.set(0, 0, 0);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.scene.add(this.particleMesh);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.startLoop();
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  private handleResize = (): void => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private handleBlur = (): void => {
    this.keysHeld.clear();
  };

  private handleVisibility = (): void => {
    if (document.hidden) {
      this.keysHeld.clear();
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }
    this.sound.init();
    if (this.screenState === 'playing') {
      this.sound.startMusic();
    }
    const code = e.code;
    this.keysHeld.add(code);

    if (this.screenState === 'playing' && !this.inGarage) {
      if (code === 'KeyC') {
        const mode = this.cameraRig.cycleMode();
        this.sound.playUiClick(640);
        this.callbacks.onCameraChange(mode);
      } else if (code === 'Escape' || code === 'KeyP') {
        this.callbacks.onPauseToggle();
      }
    } else if (this.screenState === 'paused') {
      if (code === 'Escape' || code === 'KeyP') {
        this.callbacks.onPauseToggle();
      }
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keysHeld.delete(e.code);
  };

  public clearHeldKeys(): void {
    this.keysHeld.clear();
  }

  public setScreenState(state: GameScreenState): void {
    this.screenState = state;
    if (state !== 'playing') {
      this.keysHeld.clear();
      this.sound.updateDriving(false, this.playerCarSpec, 950, 0, 0, 0, false, false);
    }
  }

  public setGraphicsSettings(settings: GraphicsSettings): void {
    this.graphicsSettings = { ...settings };
    if (!this.isSoftwareGl) {
      const ratio =
        settings.quality === 'low'
          ? 1
          : settings.quality === 'medium'
            ? Math.min(window.devicePixelRatio, 1.5)
            : Math.min(window.devicePixelRatio, 2);
      this.renderer.setPixelRatio(ratio);
      this.renderer.shadowMap.enabled = settings.shadows;
    }
  }

  public setAudioSettings(settings: AudioSettings): void {
    this.sound.applySettings(settings);
  }

  public cycleCamera(): CameraMode {
    const mode = this.cameraRig.cycleMode();
    this.callbacks.onCameraChange(mode);
    return mode;
  }

  public updatePlayerCar(carId: string, customization: CarCustomization): void {
    this.playerCarSpec = getCarSpec(carId);
    this.playerCustomization = { ...customization, upgrades: { ...customization.upgrades } };

    // Rebuild gameplay car mesh
    this.scene.remove(this.playerMesh.root);
    this.playerMesh.dispose();
    this.playerMesh = createCarMesh(this.playerCarSpec, this.playerCustomization, {
      isPlayer: true,
      castShadow: !this.isSoftwareGl,
    });
    this.playerMesh.root.position.set(this.playerState.x, this.playerState.y, this.playerState.z);
    this.playerMesh.root.rotation.y = this.playerState.yaw;
    this.scene.add(this.playerMesh.root);

    // If garage is active, rebuild turntable showcase car too
    if (this.inGarage) {
      this.rebuildGarageCar();
    }
  }

  private rebuildGarageCar(): void {
    if (this.garageCarMesh) {
      this.world.garageTurntable.remove(this.garageCarMesh.root);
      this.garageCarMesh.dispose();
      this.garageCarMesh = null;
    }
    this.garageCarMesh = createCarMesh(this.playerCarSpec, this.playerCustomization, {
      isPlayer: false,
      castShadow: false,
    });
    this.garageCarMesh.root.position.set(0, 0.24, 0);
    this.world.garageTurntable.add(this.garageCarMesh.root);
  }

  public enterGarage(carId: string, customization: CarCustomization): void {
    this.inGarage = true;
    this.playerCarSpec = getCarSpec(carId);
    this.playerCustomization = { ...customization, upgrades: { ...customization.upgrades } };
    this.world.setGarageMode(true);
    this.playerMesh.root.visible = false;
    this.rebuildGarageCar();
    this.sound.updateDriving(false, this.playerCarSpec, 950, 0, 0, 0, false, false);
  }

  public exitGarage(): void {
    this.inGarage = false;
    this.world.setGarageMode(false);
    this.playerMesh.root.visible = true;
    if (this.garageCarMesh) {
      this.world.garageTurntable.remove(this.garageCarMesh.root);
      this.garageCarMesh.dispose();
      this.garageCarMesh = null;
    }
  }

  public rotateGarageOrbit(deltaX: number, deltaY: number): void {
    this.garageAutoSpin = false;
    this.garageOrbitYaw -= deltaX * 0.008;
    this.garageOrbitPitch = Math.max(
      0.06,
      Math.min(0.65, this.garageOrbitPitch + deltaY * 0.006)
    );
  }

  public zoomGarageOrbit(delta: number): void {
    this.garageOrbitDist = Math.max(4.6, Math.min(11.5, this.garageOrbitDist + delta * 0.005));
  }

  public setGarageAutoSpin(enabled: boolean): void {
    this.garageAutoSpin = enabled;
  }

  public updateEnvironmentSettings(
    timeOfDay: RaceConfig['timeOfDay'],
    weather: RaceConfig['weather']
  ): void {
    this.raceConfig = { ...this.raceConfig, timeOfDay, weather };
  }

  public startSession(
    config: RaceConfig,
    carId: string,
    customization: CarCustomization,
    multiplayerPlayers: MultiplayerPlayerInfo[] = [],
    localSocketId = ''
  ): void {
    this.exitGarage();
    this.raceConfig = { ...config };
    this.updatePlayerCar(carId, customization);

    const track = getTrack(config.trackId);
    const startWp = track.waypoints[0];
    const nextWp = track.waypoints[1];
    const startYaw = Math.atan2(-(nextWp.x - startWp.x), -(nextWp.z - startWp.z));

    this.playerState = createInitialVehicleState(
      startWp.x,
      startWp.y,
      startWp.z,
      startYaw
    );
    this.playerMesh.root.position.set(startWp.x, startWp.y, startWp.z);
    this.playerMesh.root.rotation.y = startYaw;
    this.cameraRig.snapToVehicle(this.camera, this.playerState);

    // Clear old AI & remote cars
    this.clearAiCars();
    this.clearRemoteCars();

    if (config.mode === 'quick_race') {
      this.aiRacers = createAiRacers(config.aiCount, track, 1);
      this.aiRacers.forEach((ai) => {
        const aiMesh = createCarMesh(ai.spec, {
          ...createDefaultCustomization(ai.spec),
          paintColor: ai.paintColor,
        });
        aiMesh.root.position.set(ai.x, ai.y, ai.z);
        aiMesh.root.rotation.y = ai.yaw;
        this.scene.add(aiMesh.root);
        this.aiMeshes.set(ai.id, aiMesh);
      });
    } else if (config.mode === 'multiplayer') {
      this.syncMultiplayerRoster(multiplayerPlayers, localSocketId);
    }

    // Reset race counters
    this.raceElapsedMs = 0;
    this.lapStartMs = 0;
    this.bestLapMs = null;
    this.currentLap = 1;
    this.nextCheckpointIdx = 1;
    this.checkpointsPassed = 0;
    this.driftScore = 0;
    this.currentDriftPoints = 0;
    this.driftMultiplier = 1;
    this.raceEnded = false;

    const showCheckpoints = config.mode !== 'free_roam';
    this.world.checkpointRings.visible = showCheckpoints;
    if (showCheckpoints) {
      this.world.setActiveTrackCheckpoints(config.trackId, this.nextCheckpointIdx);
    }

    const needsCountdown =
      config.mode === 'quick_race' || config.mode === 'multiplayer';
    this.countdownRemaining = needsCountdown ? 3.2 : 0;
    this.lastCountdownInt = needsCountdown ? 3 : null;
    this.callbacks.onCountdownTick?.(this.lastCountdownInt);

    this.setScreenState('playing');
    this.emitTelemetry();
  }

  public syncMultiplayerRoster(
    players: MultiplayerPlayerInfo[],
    localSocketId: string
  ): void {
    const activeIds = new Set<string>();
    players.forEach((p) => {
      if (p.socketId === localSocketId) return;
      activeIds.add(p.socketId);
      const existing = this.remoteMeshes.get(p.socketId);
      if (!existing) {
        const spec = getCarSpec(p.carId);
        const handle = createCarMesh(spec, {
          ...createDefaultCustomization(spec),
          paintColor: p.paintColor || spec.defaultPaint,
        });
        const px = p.position?.x ?? 0;
        const py = p.position?.y ?? 0;
        const pz = p.position?.z ?? 44;
        handle.root.position.set(px, py, pz);
        handle.root.rotation.y = p.yaw ?? 0;
        this.scene.add(handle.root);
        this.remoteMeshes.set(p.socketId, {
          handle,
          targetX: px,
          targetY: py,
          targetZ: pz,
          targetYaw: p.yaw ?? 0,
          speedKmh: p.speedKmh ?? 0,
        });
      }
    });

    for (const [id, entry] of this.remoteMeshes) {
      if (!activeIds.has(id)) {
        this.scene.remove(entry.handle.root);
        entry.handle.dispose();
        this.remoteMeshes.delete(id);
        this.physics.removeAiBody(id);
      }
    }
  }

  public applyRemotePlayerState(
    socketId: string,
    pos: { x: number; y: number; z: number },
    yaw: number,
    speedKmh: number
  ): void {
    const entry = this.remoteMeshes.get(socketId);
    if (!entry) return;
    entry.targetX = pos.x;
    entry.targetY = pos.y;
    entry.targetZ = pos.z;
    entry.targetYaw = yaw;
    entry.speedKmh = speedKmh;
  }

  private clearAiCars(): void {
    for (const [, mesh] of this.aiMeshes) {
      this.scene.remove(mesh.root);
      mesh.dispose();
    }
    this.aiMeshes.clear();
    this.aiRacers = [];
    this.physics.clearDynamicRacers();
  }

  private clearRemoteCars(): void {
    for (const [, entry] of this.remoteMeshes) {
      this.scene.remove(entry.handle.root);
      entry.handle.dispose();
    }
    this.remoteMeshes.clear();
  }

  private readPlayerInput(): VehicleInput {
    let throttle =
      this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp') ? 1 : 0;
    let brake =
      this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown') ? 1 : 0;
    let steer = 0;
    if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) steer += 1;
    if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) steer -= 1;
    let handbrake = this.keysHeld.has('Space');
    let nitro =
      this.keysHeld.has('ShiftLeft') || this.keysHeld.has('ShiftRight');

    // Gamepad polling
    if (navigator.getGamepads) {
      const pads = navigator.getGamepads();
      const pad = pads?.[0];
      if (pad) {
        const axisX = Math.abs(pad.axes[0] ?? 0) > 0.14 ? -(pad.axes[0] ?? 0) : 0;
        if (Math.abs(axisX) > Math.abs(steer)) steer = axisX;
        const rt = pad.buttons[7]?.value ?? 0;
        const lt = pad.buttons[6]?.value ?? 0;
        if (rt > 0.1) throttle = Math.max(throttle, rt);
        if (lt > 0.1) brake = Math.max(brake, lt);
        if (pad.buttons[0]?.pressed || pad.buttons[2]?.pressed) handbrake = true;
        if (pad.buttons[1]?.pressed || pad.buttons[5]?.pressed) nitro = true;
      }
    }

    return { throttle, brake, steer, handbrake, nitro };
  }

  private spawnParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    kind: 'smoke' | 'spark'
  ): void {
    if (!this.graphicsSettings.particles) return;
    const p = this.particlePool[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % this.particlePool.length;
    p.active = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.life = 0;
    p.maxLife = kind === 'smoke' ? 0.65 : 0.35;
    p.scale = kind === 'smoke' ? 0.65 : 0.35;
    p.kind = kind;
  }

  private updateParticles(dt: number): void {
    let anyChanged = false;
    for (let i = 0; i < this.particlePool.length; i++) {
      const p = this.particlePool[i];
      if (!p.active) continue;
      anyChanged = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        _dummy.position.set(0, -50, 0);
        _dummy.scale.set(0, 0, 0);
        _dummy.updateMatrix();
        this.particleMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.kind === 'spark') {
        p.vy -= 14 * dt;
      } else {
        p.vy += 1.4 * dt;
      }

      const t = p.life / p.maxLife;
      const s =
        p.kind === 'smoke' ? p.scale * (0.6 + t * 1.9) : p.scale * (1 - t);
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.scale.set(s, s, s);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);

      _pColor.setHex(p.kind === 'smoke' ? 0xd4d8e0 : 0xfbbf24);
      this.particleMesh.setColorAt(i, _pColor);
    }
    if (anyChanged) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) {
        this.particleMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  private applyCarMeshTransform(
    mesh: CarMeshHandle,
    x: number,
    y: number,
    z: number,
    yaw: number,
    steerAngle: number,
    wheelSpin: number,
    pitch: number,
    roll: number,
    bounce: number,
    braking: boolean,
    nitroActive: boolean,
    isNightOrRain: boolean
  ): void {
    mesh.root.position.set(x, y, z);
    mesh.root.rotation.y = yaw;
    mesh.bodyGroup.rotation.x = pitch;
    mesh.bodyGroup.rotation.z = roll;
    mesh.bodyGroup.position.y = bounce;

    mesh.wheels.flSteer.rotation.y = steerAngle;
    mesh.wheels.frSteer.rotation.y = steerAngle;
    mesh.wheels.flSpin.rotation.x = -wheelSpin;
    mesh.wheels.frSpin.rotation.x = -wheelSpin;
    mesh.wheels.rlSpin.rotation.x = -wheelSpin;
    mesh.wheels.rrSpin.rotation.x = -wheelSpin;

    mesh.steeringWheel.rotation.z = steerAngle * 2.2;

    const brakeIntensity = braking ? 3.8 : 1.1;
    for (let i = 0; i < mesh.brakeLightMats.length; i++) {
      mesh.brakeLightMats[i].emissiveIntensity = brakeIntensity;
    }

    if (mesh.headlightBeam) {
      mesh.headlightBeam.intensity = isNightOrRain ? 18 : 2.5;
    }

    for (let i = 0; i < mesh.nitroFlames.length; i++) {
      const f = mesh.nitroFlames[i];
      f.visible = nitroActive;
      if (nitroActive) {
        const flicker = 0.85 + Math.random() * 0.45;
        f.scale.set(1, flicker, 1);
      }
    }
  }

  private stepGameplay(dt: number): void {
    const input = this.readPlayerInput();

    // Countdown handling
    if (this.countdownRemaining > 0) {
      this.countdownRemaining = Math.max(0, this.countdownRemaining - dt);
      const cInt = Math.ceil(this.countdownRemaining);
      if (cInt !== this.lastCountdownInt) {
        this.lastCountdownInt = cInt > 0 ? cInt : 0;
        this.sound.playCountdownBeep(cInt === 0);
        this.callbacks.onCountdownTick?.(cInt > 0 ? cInt : null);
      }
      if (this.countdownRemaining > 0) {
        // Revving on the line without launching
        this.sound.updateDriving(
          true,
          this.playerCarSpec,
          950 + input.throttle * 4800,
          input.throttle,
          0,
          0,
          false,
          false
        );
        return;
      }
    }

    this.raceElapsedMs += dt * 1000;

    // Physics step
    this.playerState = stepVehicleDynamics(
      this.playerState,
      input,
      this.playerCarSpec,
      this.playerCustomization,
      dt
    );

    // Sync AI bodies to Cannon-es world before collision check
    for (let i = 0; i < this.aiRacers.length; i++) {
      const ai = this.aiRacers[i];
      this.physics.syncAiBody(ai.id, ai.x, ai.y, ai.z, ai.yaw);
    }
    for (const [id, remote] of this.remoteMeshes) {
      this.physics.syncAiBody(id, remote.targetX, remote.targetY, remote.targetZ, remote.targetYaw);
    }

    const col = this.physics.stepAndResolveCollisions(this.playerState, dt);
    this.playerState.x = col.x;
    this.playerState.z = col.z;
    this.playerState.vx = col.vx;
    this.playerState.vz = col.vz;

    if (col.impactIntensity > 3.5) {
      this.playerState.damage = Math.min(
        100,
        this.playerState.damage + col.impactIntensity * 0.48
      );
      this.cameraRig.addTrauma(Math.min(0.7, col.impactIntensity * 0.03));
      this.sound.playCollision(col.impactIntensity);
      for (let s = 0; s < 6; s++) {
        this.spawnParticle(
          this.playerState.x,
          this.playerState.y + 0.6,
          this.playerState.z,
          (Math.random() - 0.5) * 14,
          3 + Math.random() * 6,
          (Math.random() - 0.5) * 14,
          'spark'
        );
      }
    }

    // Drift smoke particles & drift score calculation
    const driftStep = calculateDriftStep(
      this.playerState.isDrifting,
      this.playerState.speedMs,
      this.playerState.slipAngleRad,
      dt,
      this.currentDriftPoints,
      this.driftMultiplier
    );
    if (driftStep.active) {
      this.currentDriftPoints += driftStep.addedPoints;
      this.driftMultiplier = driftStep.newMultiplier;
      if (Math.random() < 0.55) {
        const rearX = this.playerState.x + Math.sin(this.playerState.yaw) * 1.5;
        const rearZ = this.playerState.z + Math.cos(this.playerState.yaw) * 1.5;
        this.spawnParticle(
          rearX + (Math.random() - 0.5) * 1.1,
          this.playerState.y + 0.2,
          rearZ + (Math.random() - 0.5) * 1.1,
          (Math.random() - 0.5) * 2,
          0.9,
          (Math.random() - 0.5) * 2,
          'smoke'
        );
      }
    } else if (driftStep.bankPoints > 0) {
      this.driftScore += driftStep.bankPoints;
      this.currentDriftPoints = 0;
      this.driftMultiplier = 1;
    }

    // Update AI Racers
    const track = getTrack(this.raceConfig.trackId);
    for (let i = 0; i < this.aiRacers.length; i++) {
      const ai = this.aiRacers[i];
      stepAiRacer(
        ai,
        track,
        this.playerState.x,
        this.playerState.z,
        this.aiRacers,
        this.raceConfig.laps,
        this.raceElapsedMs,
        dt
      );
      const aiMesh = this.aiMeshes.get(ai.id);
      if (aiMesh) {
        this.applyCarMeshTransform(
          aiMesh,
          ai.x,
          ai.y,
          ai.z,
          ai.yaw,
          ai.steerAngle,
          ai.wheelSpin,
          0,
          0,
          0,
          false,
          ai.nitroActive,
          this.raceConfig.timeOfDay === 'night'
        );
      }
    }

    // Interpolate Remote Multiplayer Cars
    for (const [, remote] of this.remoteMeshes) {
      const lerp = 1 - Math.exp(-12 * dt);
      const curPos = remote.handle.root.position;
      curPos.x += (remote.targetX - curPos.x) * lerp;
      curPos.y += (remote.targetY - curPos.y) * lerp;
      curPos.z += (remote.targetZ - curPos.z) * lerp;
      let diff = remote.targetYaw - remote.handle.root.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      remote.handle.root.rotation.y += diff * lerp;
      const wheelDelta = (remote.speedKmh / 3.6) * dt / 0.36;
      remote.handle.wheels.flSpin.rotation.x -= wheelDelta;
      remote.handle.wheels.frSpin.rotation.x -= wheelDelta;
      remote.handle.wheels.rlSpin.rotation.x -= wheelDelta;
      remote.handle.wheels.rrSpin.rotation.x -= wheelDelta;
    }

    // Checkpoints & Mode Victory/Loss Conditions
    if (!this.raceEnded && this.raceConfig.mode !== 'free_roam') {
      const cps = getTrackCheckpoints(track, 10);
      const targetCp = cps[this.nextCheckpointIdx];
      if (
        targetCp &&
        checkCheckpointProximity(this.playerState.x, this.playerState.z, targetCp, 16)
      ) {
        this.sound.playUiClick(780);
        this.checkpointsPassed++;
        this.nextCheckpointIdx = (this.nextCheckpointIdx + 1) % cps.length;
        this.world.setActiveTrackCheckpoints(
          this.raceConfig.trackId,
          this.nextCheckpointIdx
        );

        // Completed a lap when crossing start checkpoint (index 0) after passing others
        if (this.nextCheckpointIdx === 1 && this.checkpointsPassed >= cps.length) {
          const lapTime = this.raceElapsedMs - this.lapStartMs;
          if (this.bestLapMs === null || lapTime < this.bestLapMs) {
            this.bestLapMs = lapTime;
          }
          this.lapStartMs = this.raceElapsedMs;

          if (this.raceConfig.mode === 'time_trial') {
            this.finishRace(true, 'Time Trial Lap Completed');
            return;
          }
          if (
            this.raceConfig.mode === 'quick_race' ||
            this.raceConfig.mode === 'checkpoint_race' ||
            this.raceConfig.mode === 'multiplayer'
          ) {
            if (this.currentLap >= this.raceConfig.laps) {
              const pos = this.computeCurrentPosition();
              this.finishRace(
                pos <= 2 || this.raceConfig.mode === 'checkpoint_race',
                this.raceConfig.mode === 'quick_race'
                  ? `Finished P${pos} of ${this.aiRacers.length + 1}`
                  : 'Finish Line Crossed'
              );
              return;
            }
            this.currentLap += 1;
          }
        }
      }

      // Time Trial / Drift Challenge time limits
      if (this.raceConfig.mode === 'time_trial' && this.raceElapsedMs >= track.timeTrialLimitMs) {
        this.finishRace(false, 'Time Limit Expired');
        return;
      }
      if (this.raceConfig.mode === 'drift_challenge' && this.raceElapsedMs >= 90_000) {
        const finalDrift =
          this.driftScore + Math.round(this.currentDriftPoints * this.driftMultiplier);
        this.driftScore = finalDrift;
        this.finishRace(finalDrift >= 2500, finalDrift >= 2500 ? 'Drift Target Reached (2,500+)' : 'Target 2,500 Drift Points Missed');
        return;
      }
    }

    // Sync player car mesh & sound
    this.playerMesh.cabinExterior.visible = this.cameraRig.mode !== 'cockpit';
    const isNightOrRain =
      this.raceConfig.timeOfDay === 'night' || this.raceConfig.weather === 'rain';
    this.applyCarMeshTransform(
      this.playerMesh,
      this.playerState.x,
      this.playerState.y,
      this.playerState.z,
      this.playerState.yaw,
      this.playerState.steerAngle,
      this.playerState.wheelSpin,
      this.playerState.suspensionPitch,
      this.playerState.suspensionRoll,
      this.playerState.suspensionBounce,
      this.playerState.brakingLights,
      this.playerState.nitroActive,
      isNightOrRain
    );

    this.sound.updateDriving(
      true,
      this.playerCarSpec,
      this.playerState.rpm,
      input.throttle,
      this.playerState.slipAngleRad,
      this.playerState.speedMs,
      this.playerState.nitroActive,
      input.brake > 0.2
    );

    // Emit Multiplayer telemetry at ~15Hz
    const now = performance.now();
    if (
      this.raceConfig.mode === 'multiplayer' &&
      now - this.lastMpEmit > 66
    ) {
      this.lastMpEmit = now;
      this.callbacks.onMultiplayerSync?.({
        position: {
          x: this.playerState.x,
          y: this.playerState.y,
          z: this.playerState.z,
        },
        yaw: this.playerState.yaw,
        speedKmh: Math.round(this.playerState.speedMs * 3.6),
        lap: this.currentLap,
        checkpoint: this.checkpointsPassed,
        finished: this.raceEnded,
      });
    }
  }

  private computeCurrentPosition(): number {
    const track = getTrack(this.raceConfig.trackId);
    const nearest = getNearestTrackInfo(track, this.playerState.x, this.playerState.z);
    const playerProg =
      (this.currentLap - 1) +
      Math.max(0, this.checkpointsPassed % 10) / 10 +
      nearest.index / track.waypoints.length * 0.05;

    let pos = 1;
    for (let i = 0; i < this.aiRacers.length; i++) {
      if (this.aiRacers[i].totalProgress > playerProg) pos++;
    }
    return pos;
  }

  private finishRace(victory: boolean, reason: string): void {
    if (this.raceEnded) return;
    this.raceEnded = true;
    const pos = this.computeCurrentPosition();
    const totalRacers =
      this.raceConfig.mode === 'quick_race' ? this.aiRacers.length + 1 : 1;

    const baseReward =
      this.raceConfig.mode === 'quick_race'
        ? Math.max(400, (totalRacers - pos + 1) * 650)
        : victory
          ? 1200
          : 350;
    const driftBonus = Math.round(this.driftScore * 0.15);
    const rewardCredits = baseReward + driftBonus;

    this.sound.updateDriving(false, this.playerCarSpec, 950, 0, 0, 0, false, false);
    this.sound.playCountdownBeep(victory);

    if (this.raceConfig.mode === 'multiplayer') {
      this.callbacks.onMultiplayerSync?.({
        position: {
          x: this.playerState.x,
          y: this.playerState.y,
          z: this.playerState.z,
        },
        yaw: this.playerState.yaw,
        speedKmh: 0,
        lap: this.currentLap,
        checkpoint: this.checkpointsPassed,
        finished: true,
        finishTimeMs: Math.round(this.raceElapsedMs),
      });
    }

    this.callbacks.onRaceFinish({
      mode: this.raceConfig.mode,
      trackId: this.raceConfig.trackId,
      carId: this.playerCarSpec.id,
      victory,
      position: pos,
      totalRacers,
      elapsedMs: Math.round(this.raceElapsedMs),
      bestLapMs: this.bestLapMs ? Math.round(this.bestLapMs) : null,
      driftScore: Math.round(this.driftScore),
      checkpointsPassed: this.checkpointsPassed,
      rewardCredits,
      xpEarned: Math.round(rewardCredits * 0.4),
      reason,
    });
  }

  private emitTelemetry(): void {
    const track = getTrack(this.raceConfig.trackId);
    const cps = getTrackCheckpoints(track, 10);
    const nextCp = this.raceConfig.mode === 'free_roam' ? null : cps[this.nextCheckpointIdx] ?? null;

    const minimapEntities: MinimapEntity[] = [
      {
        id: 'player',
        x: this.playerState.x,
        z: this.playerState.z,
        yaw: this.playerState.yaw,
        kind: 'player',
        color: '#38bdf8',
      },
    ];
    for (let i = 0; i < this.aiRacers.length; i++) {
      const ai = this.aiRacers[i];
      minimapEntities.push({
        id: ai.id,
        x: ai.x,
        z: ai.z,
        yaw: ai.yaw,
        kind: 'ai',
        color: ai.paintColor,
      });
    }
    for (const [id, remote] of this.remoteMeshes) {
      minimapEntities.push({
        id,
        x: remote.handle.root.position.x,
        z: remote.handle.root.position.z,
        yaw: remote.handle.root.rotation.y,
        kind: 'remote',
        color: '#f59e0b',
      });
    }

    // Wrong way check
    let wrongWay = false;
    if (this.raceConfig.mode !== 'free_roam' && this.playerState.speedMs > 5) {
      const near = getNearestTrackInfo(track, this.playerState.x, this.playerState.z);
      const pfx = -Math.sin(this.playerState.yaw);
      const pfz = -Math.cos(this.playerState.yaw);
      const dot = pfx * near.forwardX + pfz * near.forwardZ;
      wrongWay = dot < -0.55;
    }

    const timeLimitMs =
      this.raceConfig.mode === 'time_trial'
        ? track.timeTrialLimitMs
        : this.raceConfig.mode === 'drift_challenge'
          ? 90_000
          : 0;

    this.callbacks.onTelemetry({
      speedKmh: Math.round(this.playerState.speedMs * 3.6),
      rpm: this.playerState.rpm,
      maxRpm: 8400,
      gear: this.playerState.gear,
      nitro: Math.round(this.playerState.nitro),
      damage: Math.round(this.playerState.damage),
      driftScore: Math.round(this.driftScore),
      currentDriftPoints: Math.round(this.currentDriftPoints),
      driftMultiplier: this.driftMultiplier,
      isDrifting: this.playerState.isDrifting,
      lap: this.currentLap,
      totalLaps: this.raceConfig.laps,
      checkpoint: this.checkpointsPassed % 10,
      totalCheckpoints: 10,
      nextCheckpointPos: nextCp ? { x: nextCp.x, z: nextCp.z } : null,
      position: this.computeCurrentPosition(),
      totalRacers:
        this.raceConfig.mode === 'quick_race'
          ? this.aiRacers.length + 1
          : this.raceConfig.mode === 'multiplayer'
            ? this.remoteMeshes.size + 1
            : 1,
      elapsedMs: Math.round(this.raceElapsedMs),
      timeLimitMs,
      bestLapMs: this.bestLapMs ? Math.round(this.bestLapMs) : null,
      cameraMode: this.cameraRig.mode,
      minimapEntities,
      playerPos: {
        x: this.playerState.x,
        z: this.playerState.z,
        yaw: this.playerState.yaw,
      },
      onRoad: this.playerState.onRoad,
      wrongWay,
    });
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      const rawDt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
      this.totalElapsed += dt;

      if (this.inGarage) {
        if (this.garageAutoSpin) {
          this.garageOrbitYaw += dt * 0.35;
        }
        this.world.garageTurntable.rotation.y += dt * 0.14;
        this.cameraRig.updateGarageCamera(
          this.camera,
          this.garageOrbitYaw,
          this.garageOrbitPitch,
          this.garageOrbitDist,
          _garageCenter
        );
      } else if (this.screenState === 'title') {
        this.world.updateEnvironment(
          this.raceConfig.timeOfDay,
          this.raceConfig.weather,
          this.totalElapsed,
          this.playerState.x,
          this.playerState.z,
          dt,
          this.graphicsSettings
        );
        this.cameraRig.updateTitleFlyover(
          this.camera,
          this.totalElapsed,
          this.playerState.x,
          this.playerState.y,
          this.playerState.z
        );
      } else if (this.screenState === 'playing') {
        this.stepGameplay(dt);
        this.updateParticles(dt);
        this.world.updateEnvironment(
          this.raceConfig.timeOfDay,
          this.raceConfig.weather,
          this.totalElapsed,
          this.playerState.x,
          this.playerState.z,
          dt,
          this.graphicsSettings
        );
        this.cameraRig.updateGameplay(this.camera, this.playerState, dt);

        if (now - this.lastHudEmit >= 100) {
          this.lastHudEmit = now;
          this.emitTelemetry();
        }
      }

      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.frameId = window.setTimeout(tick, 16);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('visibilitychange', this.handleVisibility);

    this.sound.dispose();
    this.clearAiCars();
    this.clearRemoteCars();
    this.playerMesh.dispose();
    if (this.garageCarMesh) this.garageCarMesh.dispose();
    this.world.dispose();
    this.particleMesh.geometry.dispose();
    (this.particleMesh.material as THREE.Material).dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
