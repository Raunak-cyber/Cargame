import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import {
  GraphicsSettings,
  TimeOfDay,
  TrackId,
  WeatherType,
} from '../types/game';
import { CannonPhysicsWorld } from '../game/physics';
import {
  getTrack,
  getTrackCheckpoints,
  groundHeightAt,
  TRACKS,
  TrackPoint,
} from '../game/tracks';

const _sunDir = new THREE.Vector3();
const _skyColor = new THREE.Color();
const _fogColor = new THREE.Color();

export interface WorldHandles {
  worldGroup: THREE.Group;
  garageGroup: THREE.Group;
  garageTurntable: THREE.Group;
  checkpointRings: THREE.Group;
  sunLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  sky: Sky;
  clouds: THREE.Group;
  rainPoints: THREE.Points;
  streetLightGlowMat: THREE.MeshBasicMaterial;
  updateEnvironment: (
    timeOfDay: TimeOfDay,
    weather: WeatherType,
    elapsed: number,
    playerX: number,
    playerZ: number,
    dt: number,
    graphics: GraphicsSettings
  ) => void;
  setActiveTrackCheckpoints: (trackId: TrackId, nextCheckpointIdx: number) => void;
  setGarageMode: (enabled: boolean) => void;
  dispose: () => void;
}

function createAsphaltTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#252830';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle asphalt aggregate grain
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = 30 + Math.floor(Math.random() * 24);
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Outer white shoulder lines
  ctx.fillStyle = '#d4d8df';
  ctx.fillRect(20, 0, 10, 512);
  ctx.fillRect(482, 0, 10, 512);

  // Center dashed yellow/white dividing line
  ctx.fillStyle = '#f59e0b';
  for (let y = 0; y < 512; y += 64) {
    ctx.fillRect(252, y + 8, 8, 34);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createTerrainTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1f2e22';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 7500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const g = 36 + Math.floor(Math.random() * 28);
    ctx.fillStyle = `rgb(${Math.floor(g * 0.68)},${g},${Math.floor(g * 0.72)})`;
    ctx.fillRect(x, y, 3, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(36, 36);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createBuildingTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#141821';
  ctx.fillRect(0, 0, 256, 512);

  const cols = 8;
  const rows = 20;
  const padX = 8;
  const padY = 8;
  const cellW = (256 - padX * 2) / cols;
  const cellH = (512 - padY * 2) / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = Math.random();
      if (lit > 0.62) {
        ctx.fillStyle = lit > 0.9 ? '#67e8f9' : lit > 0.78 ? '#fde68a' : '#38bdf8';
      } else {
        ctx.fillStyle = '#1e2533';
      }
      ctx.fillRect(
        padX + c * cellW + 3,
        padY + r * cellH + 3,
        cellW - 6,
        cellH - 7
      );
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function buildTrackRibbonGeometry(
  points: TrackPoint[],
  width: number,
  yOffset: number
): THREE.BufferGeometry {
  const n = points.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  let accumDist = 0;
  const halfW = width * 0.5;

  for (let i = 0; i <= n; i++) {
    const p = points[i % n];
    const next = points[(i + 1) % n];
    if (i > 0) {
      const prev = points[(i - 1) % n];
      accumDist += Math.hypot(p.x - prev.x, p.z - prev.z);
    }

    const fx = next.x - p.x;
    const fz = next.z - p.z;
    const len = Math.hypot(fx, fz) || 1;
    const rx = -fz / len;
    const rz = fx / len;

    positions.push(p.x - rx * halfW, p.y + yOffset, p.z - rz * halfW);
    positions.push(p.x + rx * halfW, p.y + yOffset, p.z + rz * halfW);

    const vCoord = accumDist / 14;
    uvs.push(0, vCoord);
    uvs.push(1, vCoord);
  }

  for (let i = 0; i < n; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c);
    indices.push(b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function buildOpenWorld(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  physicsWorld: CannonPhysicsWorld,
  isSoftwareGl: boolean
): WorldHandles {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const worldGroup = new THREE.Group();
  scene.add(worldGroup);

  // Lighting rig (<= 3 lights: Directional Sun + Hemisphere + Garage spot)
  const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.85);
  worldGroup.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfff4e0, 2.2);
  sunLight.position.set(120, 160, 90);
  sunLight.castShadow = !isSoftwareGl;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 360;
  const d = 110;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.02;
  worldGroup.add(sunLight);
  worldGroup.add(sunLight.target);

  // Sky & Fog
  const sky = new Sky();
  sky.scale.setScalar(4500);
  worldGroup.add(sky);

  const skyUniforms = sky.material.uniforms;
  skyUniforms['turbidity'].value = 6;
  skyUniforms['rayleigh'].value = 2.0;
  skyUniforms['mieCoefficient'].value = 0.005;
  skyUniforms['mieDirectionalG'].value = 0.82;

  scene.fog = new THREE.FogExp2(0x8bb4d9, 0.0016);

  // Clouds (high-altitude instanced soft discs)
  const clouds = new THREE.Group();
  const cloudGeo = new THREE.SphereGeometry(1, 8, 6);
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.95,
    metalness: 0.0,
    transparent: true,
    opacity: 0.72,
  });
  for (let i = 0; i < 24; i++) {
    const cluster = new THREE.Group();
    const angle = (i / 24) * Math.PI * 2;
    const dist = 260 + (i % 4) * 95;
    cluster.position.set(
      Math.cos(angle) * dist,
      115 + (i % 3) * 18,
      Math.sin(angle) * dist
    );
    for (let p = 0; p < 3; p++) {
      const puff = new THREE.Mesh(cloudGeo, cloudMat);
      puff.position.set((p - 1) * 14, (p % 2) * 3, (p - 1) * 5);
      puff.scale.set(18 + p * 3, 6.5, 13);
      cluster.add(puff);
    }
    clouds.add(cluster);
  }
  worldGroup.add(clouds);

  // Sculpted Terrain Mesh (1100m x 1100m)
  const terrainTex = createTerrainTexture(maxAniso);
  const terrainGeo = new THREE.PlaneGeometry(1200, 1200, 96, 96);
  terrainGeo.rotateX(-Math.PI / 2);
  const posAttr = terrainGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    posAttr.setY(i, groundHeightAt(vx, vz));
  }
  terrainGeo.computeVertexNormals();
  const terrainMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: terrainTex,
    roughness: 0.92,
    metalness: 0.02,
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  worldGroup.add(terrainMesh);

  // Roads: Asphalt Ribbons for all 3 tracks + connecting city boulevards
  const asphaltTex = createAsphaltTexture(maxAniso);
  const roadMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: asphaltTex,
    roughness: 0.76,
    metalness: 0.08,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const trackOffsets: Record<TrackId, number> = {
    city_highway: 0.03,
    mountain_pass: 0.05,
    circuit: 0.07,
  };

  (Object.keys(TRACKS) as TrackId[]).forEach((tid) => {
    const tr = TRACKS[tid];
    const ribbonGeo = buildTrackRibbonGeometry(
      tr.waypoints,
      tr.roadWidth,
      trackOffsets[tid]
    );
    const ribbon = new THREE.Mesh(ribbonGeo, roadMat);
    ribbon.receiveShadow = true;
    worldGroup.add(ribbon);
  });

  // Cross-city boulevards & highway intersection deck
  const avenue1Geo = new THREE.PlaneGeometry(18, 380);
  avenue1Geo.rotateX(-Math.PI / 2);
  const avenue1 = new THREE.Mesh(avenue1Geo, roadMat);
  avenue1.position.set(-60, 0.04, 0);
  avenue1.receiveShadow = true;
  worldGroup.add(avenue1);

  const avenue2Geo = new THREE.PlaneGeometry(380, 18);
  avenue2Geo.rotateX(-Math.PI / 2);
  const avenue2 = new THREE.Mesh(avenue2Geo, roadMat);
  avenue2.position.set(0, 0.045, 0);
  avenue2.receiveShadow = true;
  worldGroup.add(avenue2);

  // Start / Finish Overhead Gantry Arch ahead of spawn grid
  const gantryGroup = new THREE.Group();
  gantryGroup.position.set(0, 0, 20);
  const pillarGeo = new THREE.BoxGeometry(0.9, 8.2, 0.9);
  const gantryMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.7,
    roughness: 0.35,
  });
  const bannerMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0x991b1b,
    emissiveIntensity: 0.7,
    roughness: 0.3,
  });
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(pillarGeo, gantryMat);
    pillar.position.set(side * 10.2, 4.1, 0);
    pillar.castShadow = true;
    gantryGroup.add(pillar);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(21.4, 1.4, 1.1), bannerMat);
  beam.position.set(0, 7.6, 0);
  gantryGroup.add(beam);
  worldGroup.add(gantryGroup);

  // City Skyline Buildings (outside road corridors, with Cannon-es colliders)
  const bldgTex = createBuildingTexture(maxAniso);
  const bldgMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: bldgTex,
    roughness: 0.45,
    metalness: 0.35,
    emissive: 0x0f172a,
    emissiveMap: bldgTex,
    emissiveIntensity: 0.45,
  });

  const buildingSpots: [number, number, number, number, number][] = [
    [-32, -45, 16, 48, 16],
    [-32, -95, 18, 64, 18],
    [-32, 45, 16, 38, 16],
    [-32, 95, 18, 55, 18],
    [-92, -45, 18, 72, 18],
    [-92, -105, 18, 52, 18],
    [-92, 45, 18, 60, 18],
    [-92, 105, 16, 42, 16],
    [-152, -45, 20, 66, 20],
    [-152, 45, 18, 50, 18],
    [-152, 135, 18, 44, 18],
    [65, -75, 22, 54, 22],
    [65, 55, 20, 42, 20],
    [245, -145, 24, 78, 24],
    [245, -25, 24, 62, 24],
    [245, 95, 24, 58, 24],
    [165, -235, 22, 68, 22],
    [35, -245, 26, 84, 26],
    [-160, -225, 22, 50, 22],
    [45, 245, 24, 56, 24],
    [-85, 235, 22, 64, 22],
  ];

  buildingSpots.forEach(([bx, bz, bw, bh, bd]) => {
    const geo = new THREE.BoxGeometry(bw, bh, bd);
    const mesh = new THREE.Mesh(geo, bldgMat);
    const baseY = groundHeightAt(bx, bz);
    mesh.position.set(bx, baseY + bh * 0.5, bz);
    mesh.castShadow = !isSoftwareGl;
    mesh.receiveShadow = true;
    worldGroup.add(mesh);

    // Rooftop trim cap
    const capGeo = new THREE.BoxGeometry(bw + 0.6, 1.2, bd + 0.6);
    const cap = new THREE.Mesh(capGeo, gantryMat);
    cap.position.set(bx, baseY + bh + 0.6, bz);
    worldGroup.add(cap);

    physicsWorld.addStaticBoxCollider(bx, baseY + bh * 0.5, bz, bw * 0.5, bh * 0.5, bd * 0.5);
  });

  // Instanced Streetlights along City & Circuit roads
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6.2, 8);
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.75,
    roughness: 0.35,
  });
  const lampGeo = new THREE.BoxGeometry(1.1, 0.18, 0.42);
  const streetLightGlowMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

  const lampSpots: { x: number; y: number; z: number; yaw: number }[] = [];
  const mainPts = TRACKS.city_highway.waypoints;
  for (let i = 0; i < mainPts.length; i += 4) {
    const p = mainPts[i];
    const next = mainPts[(i + 1) % mainPts.length];
    const fx = next.x - p.x;
    const fz = next.z - p.z;
    const len = Math.hypot(fx, fz) || 1;
    const rx = -fz / len;
    const rz = fx / len;
    lampSpots.push({
      x: p.x + rx * 12.2,
      y: p.y,
      z: p.z + rz * 12.2,
      yaw: Math.atan2(-fx, -fz),
    });
  }

  const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
  const lampInst = new THREE.InstancedMesh(lampGeo, streetLightGlowMat, lampSpots.length);
  const dummy = new THREE.Object3D();

  lampSpots.forEach((spot, idx) => {
    dummy.position.set(spot.x, spot.y + 3.1, spot.z);
    dummy.rotation.set(0, spot.yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poleInst.setMatrixAt(idx, dummy.matrix);

    dummy.position.set(spot.x, spot.y + 6.2, spot.z);
    dummy.updateMatrix();
    lampInst.setMatrixAt(idx, dummy.matrix);
  });
  poleInst.computeBoundingSphere();
  lampInst.computeBoundingSphere();
  worldGroup.add(poleInst, lampInst);

  // Instanced Pine Trees around outer hills & parks (composite 2-layer instanced)
  const treeCount = 180;
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 3.2, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3525, roughness: 0.92 });
  const crownGeo = new THREE.ConeGeometry(2.6, 7.5, 7);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 });

  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const crownInst = new THREE.InstancedMesh(crownGeo, crownMat, treeCount);
  const treeColor = new THREE.Color();

  for (let i = 0; i < treeCount; i++) {
    const angle = (i / treeCount) * Math.PI * 2 + (i % 7) * 0.13;
    const radius = 235 + (i % 11) * 24;
    const tx = Math.cos(angle) * radius;
    const tz = Math.sin(angle) * radius;
    const ty = groundHeightAt(tx, tz);
    const scale = 0.85 + (i % 5) * 0.14;

    dummy.position.set(tx, ty + 1.6 * scale, tz);
    dummy.rotation.set(0, angle, 0);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(tx, ty + 5.6 * scale, tz);
    dummy.updateMatrix();
    crownInst.setMatrixAt(i, dummy.matrix);

    treeColor.setHSL(0.32 + (i % 4) * 0.02, 0.42, 0.24 + (i % 3) * 0.05);
    crownInst.setColorAt(i, treeColor);
  }
  trunkInst.computeBoundingSphere();
  crownInst.computeBoundingSphere();
  if (crownInst.instanceColor) crownInst.instanceColor.needsUpdate = true;
  worldGroup.add(trunkInst, crownInst);

  // Instanced Trackside Barriers on Circuit turns
  const circPts = TRACKS.circuit.waypoints;
  const barrierCount = Math.floor(circPts.length / 3);
  const barrierGeo = new THREE.BoxGeometry(0.6, 0.95, 4.2);
  const barrierMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.65,
    metalness: 0.15,
  });
  const barrierInst = new THREE.InstancedMesh(barrierGeo, barrierMat, barrierCount);
  const barrierColor = new THREE.Color();

  for (let i = 0; i < barrierCount; i++) {
    const idx = i * 3;
    const p = circPts[idx];
    const next = circPts[(idx + 1) % circPts.length];
    const fx = next.x - p.x;
    const fz = next.z - p.z;
    const len = Math.hypot(fx, fz) || 1;
    const rx = -fz / len;
    const rz = fx / len;

    const bx = p.x + rx * 11.4;
    const bz = p.z + rz * 11.4;
    dummy.position.set(bx, p.y + 0.48, bz);
    dummy.rotation.set(0, Math.atan2(-fx, -fz), 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    barrierInst.setMatrixAt(i, dummy.matrix);
    barrierColor.setHex(i % 2 === 0 ? 0xdc2626 : 0xf1f5f9);
    barrierInst.setColorAt(i, barrierColor);
  }
  barrierInst.computeBoundingSphere();
  if (barrierInst.instanceColor) barrierInst.instanceColor.needsUpdate = true;
  worldGroup.add(barrierInst);

  // Checkpoint Arches Group (dynamically updated for active track/checkpoint)
  const checkpointRings = new THREE.Group();
  worldGroup.add(checkpointRings);

  // Dynamic Rain Particle System
  const rainCount = 900;
  const rainPositions = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i++) {
    rainPositions[i * 3] = (Math.random() - 0.5) * 90;
    rainPositions[i * 3 + 1] = Math.random() * 32;
    rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 90;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rainMat = new THREE.PointsMaterial({
    color: 0xa5f3fc,
    size: 0.24,
    transparent: true,
    opacity: 0.55,
  });
  const rainPoints = new THREE.Points(rainGeo, rainMat);
  rainPoints.visible = false;
  worldGroup.add(rainPoints);

  // Dedicated 3D Garage Showroom Stage (at Y = 220 so completely isolated from outdoor terrain)
  const garageGroup = new THREE.Group();
  garageGroup.position.set(0, 220, 0);
  garageGroup.visible = false;
  scene.add(garageGroup);

  const garageFloorGeo = new THREE.CircleGeometry(28, 48);
  garageFloorGeo.rotateX(-Math.PI / 2);
  const garageFloorMat = new THREE.MeshStandardMaterial({
    color: 0x0f131b,
    roughness: 0.28,
    metalness: 0.6,
  });
  const garageFloor = new THREE.Mesh(garageFloorGeo, garageFloorMat);
  garageGroup.add(garageFloor);

  const garageTurntable = new THREE.Group();
  garageGroup.add(garageTurntable);

  const plinthGeo = new THREE.CylinderGeometry(3.8, 4.1, 0.24, 48);
  const plinthMat = new THREE.MeshStandardMaterial({
    color: 0x1e2430,
    roughness: 0.22,
    metalness: 0.78,
  });
  const plinth = new THREE.Mesh(plinthGeo, plinthMat);
  plinth.position.y = 0.12;
  plinth.receiveShadow = true;
  garageTurntable.add(plinth);

  const ringGlowGeo = new THREE.RingGeometry(4.12, 4.3, 64);
  ringGlowGeo.rotateX(-Math.PI / 2);
  const ringGlowMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
  const ringGlow = new THREE.Mesh(ringGlowGeo, ringGlowMat);
  ringGlow.position.y = 0.03;
  garageTurntable.add(ringGlow);

  // Overhead Showroom LED Bars
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
  for (let i = -1; i <= 1; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 7.5), ledMat);
    strip.position.set(i * 2.2, 4.4, 0);
    garageGroup.add(strip);
  }
  const garageKeyLight = new THREE.DirectionalLight(0xf8fafc, 2.4);
  garageKeyLight.position.set(6, 9, 7);
  garageKeyLight.target.position.set(0, 220, 0);
  garageGroup.add(garageKeyLight, garageKeyLight.target);

  const cpGeo = new THREE.TorusGeometry(6.8, 0.22, 8, 28, Math.PI);
  const cpFutureMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.25,
  });
  const cpActiveMat = new THREE.MeshBasicMaterial({
    color: 0xef4444,
    transparent: true,
    opacity: 0.92,
  });

  const setActiveTrackCheckpoints = (trackId: TrackId, nextCheckpointIdx: number) => {
    while (checkpointRings.children.length > 0) {
      checkpointRings.remove(checkpointRings.children[0]);
    }
    const tr = getTrack(trackId);
    const cps = getTrackCheckpoints(tr, 10);
    cps.forEach((cp, idx) => {
      const next = cps[(idx + 1) % cps.length];
      const yaw = Math.atan2(-(next.x - cp.x), -(next.z - cp.z));
      const isNext = idx === nextCheckpointIdx;
      const ring = new THREE.Mesh(cpGeo, isNext ? cpActiveMat : cpFutureMat);
      ring.position.set(cp.x, cp.y + 0.1, cp.z);
      ring.rotation.y = yaw;
      ring.scale.setScalar(isNext ? 1.12 : 0.95);
      checkpointRings.add(ring);
    });
  };

  const setGarageMode = (enabled: boolean) => {
    worldGroup.visible = !enabled;
    garageGroup.visible = enabled;
    if (enabled) {
      scene.background = new THREE.Color(0x090b10);
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.setHex(0x090b10);
        scene.fog.density = 0.008;
      }
    } else {
      scene.background = null;
    }
  };

  const updateEnvironment = (
    timeOfDay: TimeOfDay,
    weather: WeatherType,
    elapsed: number,
    playerX: number,
    playerZ: number,
    dt: number,
    graphics: GraphicsSettings
  ) => {
    if (garageGroup.visible) return;

    // Determine normalized sun elevation (-0.15 night .. 0.48 midday)
    let elevationDeg = 32;
    let azimuthDeg = 135;
    if (timeOfDay === 'sunset') {
      elevationDeg = 4;
      azimuthDeg = 215;
    } else if (timeOfDay === 'night') {
      elevationDeg = -8;
      azimuthDeg = 160;
    } else if (timeOfDay === 'cycle') {
      const phase = (elapsed * 0.03) % (Math.PI * 2);
      elevationDeg = Math.sin(phase) * 34 + 10;
      azimuthDeg = (elapsed * 4) % 360;
    }

    const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
    const theta = THREE.MathUtils.degToRad(azimuthDeg);
    _sunDir.setFromSphericalCoords(1, phi, theta);
    skyUniforms['sunPosition'].value.copy(_sunDir);

    const isNight = elevationDeg < 2;
    const isSunset = elevationDeg >= 2 && elevationDeg < 12;

    sunLight.position.set(
      playerX + _sunDir.x * 140,
      Math.max(18, _sunDir.y * 140),
      playerZ + _sunDir.z * 140
    );
    sunLight.target.position.set(playerX, 0, playerZ);
    sunLight.castShadow = graphics.shadows && !isSoftwareGl && !isNight;

    if (isNight) {
      sunLight.intensity = 0.55;
      sunLight.color.setHex(0x60a5fa);
      hemiLight.intensity = 0.45;
      hemiLight.color.setHex(0x1e3a8a);
      hemiLight.groundColor.setHex(0x090b10);
      _fogColor.setHex(0x0b1020);
      streetLightGlowMat.color.setHex(0xfde047);
      sky.visible = false;
      scene.background = _skyColor.setHex(0x070a14);
    } else if (isSunset) {
      sunLight.intensity = 1.9;
      sunLight.color.setHex(0xfb923c);
      hemiLight.intensity = 0.72;
      hemiLight.color.setHex(0xfdba74);
      hemiLight.groundColor.setHex(0x1e293b);
      _fogColor.setHex(0x7c4940);
      streetLightGlowMat.color.setHex(0xfef08a);
      sky.visible = true;
      scene.background = null;
    } else {
      sunLight.intensity = 2.2;
      sunLight.color.setHex(0xfff5e4);
      hemiLight.intensity = 0.88;
      hemiLight.color.setHex(0x93c5fd);
      hemiLight.groundColor.setHex(0x1f2937);
      _fogColor.setHex(0x8db3d6);
      streetLightGlowMat.color.setHex(0x94a3b8);
      sky.visible = true;
      scene.background = null;
    }

    // Dynamic weather (Fog / Rain)
    const showRain = weather === 'rain' && graphics.weatherEffects;
    rainPoints.visible = showRain;
    if (showRain) {
      rainPoints.position.set(playerX, 0, playerZ);
      const arr = rainGeo.attributes.position.array as Float32Array;
      for (let i = 1; i < arr.length; i += 3) {
        arr[i] -= 36 * dt;
        if (arr[i] < 0) arr[i] = 32;
      }
      rainGeo.attributes.position.needsUpdate = true;
    }

    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.copy(_fogColor);
      scene.fog.density =
        weather === 'fog' ? 0.0085 : weather === 'rain' ? 0.0042 : 0.0014;
    }
  };

  const dispose = () => {
    asphaltTex.dispose();
    terrainTex.dispose();
    bldgTex.dispose();
    cpGeo.dispose();
    cpFutureMat.dispose();
    cpActiveMat.dispose();
    rainGeo.dispose();
    rainMat.dispose();
    worldGroup.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
      }
    });
  };

  return {
    worldGroup,
    garageGroup,
    garageTurntable,
    checkpointRings,
    sunLight,
    hemiLight,
    sky,
    clouds,
    rainPoints,
    streetLightGlowMat,
    updateEnvironment,
    setActiveTrackCheckpoints,
    setGarageMode,
    dispose,
  };
}
