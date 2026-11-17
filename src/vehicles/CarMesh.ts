import * as THREE from 'three';
import {
  CarCustomization,
  CarSpec,
  HeadlightStyle,
  SpoilerDesign,
  WheelDesign,
} from '../types/game';

export interface CarMeshHandle {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  wheels: {
    flSteer: THREE.Group;
    frSteer: THREE.Group;
    flSpin: THREE.Group;
    frSpin: THREE.Group;
    rlSpin: THREE.Group;
    rrSpin: THREE.Group;
  };
  steeringWheel: THREE.Group;
  cabinExterior: THREE.Group;
  brakeLightMats: THREE.MeshStandardMaterial[];
  headlightMats: THREE.MeshStandardMaterial[];
  headlightBeam: THREE.SpotLight | null;
  nitroFlames: THREE.Mesh[];
  spoilerGroup: THREE.Group;
  paintMaterial: THREE.MeshPhysicalMaterial;
  secondaryMaterial: THREE.MeshStandardMaterial;
  rimMaterial: THREE.MeshStandardMaterial;
  dispose: () => void;
}

let cachedContactShadowTex: THREE.CanvasTexture | null = null;
function getContactShadowTexture(): THREE.CanvasTexture {
  if (cachedContactShadowTex) return cachedContactShadowTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 12, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.35)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  cachedContactShadowTex = new THREE.CanvasTexture(canvas);
  return cachedContactShadowTex;
}

function getHeadlightColor(style: HeadlightStyle): number {
  switch (style) {
    case 'ice_blue':
      return 0x67e8f9;
    case 'amber_gt':
      return 0xfbbf24;
    case 'crimson_halo':
      return 0xf87171;
    case 'xenon_white':
    default:
      return 0xf8fafc;
  }
}

function createBodyProfileGeometry(style: CarSpec['bodyStyle']): THREE.ExtrudeGeometry {
  // Lower sculpted body silhouette (hood, beltline, rear haunches) so tinted cabin glass sits visibly above
  const shape = new THREE.Shape();
  if (style === 'hypercar') {
    shape.moveTo(-2.35, 0.22);
    shape.lineTo(2.35, 0.22);
    shape.lineTo(2.38, 0.44);
    shape.lineTo(1.85, 0.58);
    shape.lineTo(0.88, 0.72);
    shape.lineTo(-1.45, 0.74);
    shape.lineTo(-2.32, 0.72);
    shape.closePath();
  } else if (style === 'muscle') {
    shape.moveTo(-2.35, 0.24);
    shape.lineTo(2.35, 0.24);
    shape.lineTo(2.38, 0.66);
    shape.lineTo(1.25, 0.74);
    shape.lineTo(0.75, 0.78);
    shape.lineTo(-1.55, 0.8);
    shape.lineTo(-2.34, 0.82);
    shape.closePath();
  } else if (style === 'luxury') {
    shape.moveTo(-2.35, 0.23);
    shape.lineTo(2.35, 0.23);
    shape.lineTo(2.36, 0.56);
    shape.lineTo(1.5, 0.7);
    shape.lineTo(0.7, 0.76);
    shape.lineTo(-1.65, 0.78);
    shape.lineTo(-2.34, 0.74);
    shape.closePath();
  } else if (style === 'jdm') {
    shape.moveTo(-2.28, 0.23);
    shape.lineTo(2.28, 0.23);
    shape.lineTo(2.32, 0.54);
    shape.lineTo(1.45, 0.68);
    shape.lineTo(0.68, 0.76);
    shape.lineTo(-1.52, 0.78);
    shape.lineTo(-2.26, 0.78);
    shape.closePath();
  } else {
    // supercar
    shape.moveTo(-2.32, 0.22);
    shape.lineTo(2.32, 0.22);
    shape.lineTo(2.35, 0.48);
    shape.lineTo(1.65, 0.64);
    shape.lineTo(0.85, 0.72);
    shape.lineTo(-1.55, 0.75);
    shape.lineTo(-2.3, 0.74);
    shape.closePath();
  }

  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth: 1.78,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 2,
    curveSegments: 6,
  });
  // Center along Z, then rotate +90deg around Y so +X (front of shape) becomes -Z (forward)
  extrude.translate(0, 0, -0.89);
  extrude.rotateY(Math.PI / 2);
  extrude.computeVertexNormals();
  return extrude;
}

function buildWheelMesh(
  design: WheelDesign,
  rimMat: THREE.Material,
  tireMat: THREE.Material,
  caliperMat: THREE.Material,
  isLeft: boolean
): THREE.Group {
  const wheelGroup = new THREE.Group();

  // Tire
  const tireGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 22);
  tireGeo.rotateZ(Math.PI / 2);
  const tire = new THREE.Mesh(tireGeo, tireMat);
  tire.castShadow = true;
  wheelGroup.add(tire);

  // Inner barrel
  const barrelGeo = new THREE.CylinderGeometry(0.245, 0.245, 0.29, 18);
  barrelGeo.rotateZ(Math.PI / 2);
  const barrel = new THREE.Mesh(barrelGeo, rimMat);
  wheelGroup.add(barrel);

  // Brake disc + caliper (non-spinning look via inner disc)
  const discGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.05, 14);
  discGeo.rotateZ(Math.PI / 2);
  const disc = new THREE.Mesh(discGeo, caliperMat);
  disc.position.x = isLeft ? 0.04 : -0.04;
  wheelGroup.add(disc);

  // Spokes based on WheelDesign
  const spokeOffset = isLeft ? -0.145 : 0.145;
  const spokeCount =
    design === 'five_spoke'
      ? 5
      : design === 'turbine'
        ? 8
        : design === 'deep_dish'
          ? 6
          : 10;

  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2;
    const spokeW = design === 'five_spoke' ? 0.05 : design === 'deep_dish' ? 0.045 : 0.028;
    const spokeGeo = new THREE.BoxGeometry(0.025, 0.42, spokeW);
    const spoke = new THREE.Mesh(spokeGeo, rimMat);
    spoke.position.x = spokeOffset;
    spoke.rotation.x = angle + (design === 'turbine' ? 0.32 : 0);
    wheelGroup.add(spoke);
  }

  // Center lug cap
  const capGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.04, 12);
  capGeo.rotateZ(Math.PI / 2);
  const cap = new THREE.Mesh(capGeo, rimMat);
  cap.position.x = spokeOffset;
  wheelGroup.add(cap);

  return wheelGroup;
}

function buildSpoilerMesh(
  design: SpoilerDesign,
  primaryMat: THREE.Material,
  secondaryMat: THREE.Material
): THREE.Group {
  const group = new THREE.Group();
  if (design === 'none') return group;

  if (design === 'lip') {
    const lipGeo = new THREE.BoxGeometry(1.66, 0.08, 0.18);
    const lip = new THREE.Mesh(lipGeo, secondaryMat);
    lip.position.set(0, 0.85, 2.22);
    lip.rotation.x = -0.25;
    group.add(lip);
    return group;
  }

  const wingY = design === 'swan_neck' ? 1.18 : 1.07;
  const wingZ = design === 'swan_neck' ? 2.24 : 2.16;

  // Main airfoil blade
  const bladeGeo = new THREE.BoxGeometry(1.86, 0.055, 0.32);
  const blade = new THREE.Mesh(bladeGeo, secondaryMat);
  blade.position.set(0, wingY, wingZ);
  blade.rotation.x = 0.14;
  blade.castShadow = true;
  group.add(blade);

  // Endplates
  const plateGeo = new THREE.BoxGeometry(0.04, 0.24, 0.42);
  for (const side of [-1, 1]) {
    const plate = new THREE.Mesh(plateGeo, primaryMat);
    plate.position.set(side * 0.94, wingY - 0.01, wingZ);
    group.add(plate);
  }

  // Uprights / pylons
  const pylonGeo = new THREE.BoxGeometry(0.05, wingY - 0.78, 0.16);
  for (const side of [-1, 1]) {
    const pylon = new THREE.Mesh(pylonGeo, secondaryMat);
    pylon.position.set(side * 0.46, 0.78 + (wingY - 0.78) * 0.5, wingZ - 0.04);
    pylon.rotation.x = design === 'swan_neck' ? 0.25 : -0.15;
    group.add(pylon);
  }

  return group;
}

export function createCarMesh(
  spec: CarSpec,
  customization: CarCustomization,
  options: { isPlayer?: boolean; castShadow?: boolean } = {}
): CarMeshHandle {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const paintMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(customization.paintColor),
    metalness: 0.72,
    roughness: 0.22,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });

  const secondaryMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(customization.secondaryColor),
    metalness: 0.35,
    roughness: 0.55,
  });

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    metalness: 0.15,
    roughness: 0.08,
    transparent: true,
    opacity: 0.72,
    clearcoat: 1.0,
  });

  const tireMaterial = new THREE.MeshStandardMaterial({
    color: 0x16181d,
    metalness: 0.05,
    roughness: 0.88,
  });

  const rimMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(customization.rimColor),
    metalness: 0.88,
    roughness: 0.22,
  });

  const caliperMaterial = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    metalness: 0.5,
    roughness: 0.35,
  });

  const hlColor = getHeadlightColor(customization.headlightStyle);
  const headlightMat = new THREE.MeshStandardMaterial({
    color: hlColor,
    emissive: hlColor,
    emissiveIntensity: 2.2,
    roughness: 0.15,
  });

  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    emissive: 0xef4444,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });

  const exhaustMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.92,
    roughness: 0.25,
  });

  // 1. Primary sculpted body silhouette
  const bodyGeo = createBodyProfileGeometry(spec.bodyStyle);
  const bodyMesh = new THREE.Mesh(bodyGeo, paintMaterial);
  bodyMesh.castShadow = options.castShadow ?? true;
  bodyMesh.receiveShadow = true;
  bodyGroup.add(bodyMesh);

  // 2. Front splitter + side skirts + rear diffuser
  const splitterGeo = new THREE.BoxGeometry(1.94, 0.07, 0.42);
  const splitter = new THREE.Mesh(splitterGeo, secondaryMaterial);
  splitter.position.set(0, 0.21, -2.26);
  bodyGroup.add(splitter);

  const skirtGeo = new THREE.BoxGeometry(1.96, 0.1, 2.75);
  const skirts = new THREE.Mesh(skirtGeo, secondaryMaterial);
  skirts.position.set(0, 0.21, 0);
  bodyGroup.add(skirts);

  const diffuserGeo = new THREE.BoxGeometry(1.78, 0.18, 0.32);
  const diffuser = new THREE.Mesh(diffuserGeo, secondaryMaterial);
  diffuser.position.set(0, 0.26, 2.26);
  bodyGroup.add(diffuser);

  // 3. Tinted greenhouse windshield & cabin canopy (extruded tapered silhouette)
  const cabinExterior = new THREE.Group();
  bodyGroup.add(cabinExterior);

  const cabinShape = new THREE.Shape();
  const roofH = spec.bodyStyle === 'hypercar' || spec.bodyStyle === 'supercar' ? 1.12 : 1.22;
  cabinShape.moveTo(-1.45, 0.74);
  cabinShape.lineTo(0.75, 0.74);
  cabinShape.lineTo(0.12, roofH);
  cabinShape.lineTo(-0.85, roofH);
  cabinShape.closePath();
  const canopyGeo = new THREE.ExtrudeGeometry(cabinShape, {
    depth: 1.48,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.03,
    bevelSegments: 1,
  });
  canopyGeo.translate(0, 0, -0.74);
  canopyGeo.rotateY(Math.PI / 2);
  canopyGeo.computeVertexNormals();
  const canopy = new THREE.Mesh(canopyGeo, glassMaterial);
  cabinExterior.add(canopy);

  // Painted roof cap
  const roofGeo = new THREE.BoxGeometry(1.42, 0.055, 1.05);
  const roof = new THREE.Mesh(roofGeo, paintMaterial);
  roof.position.set(0, roofH + 0.02, 0.36);
  cabinExterior.add(roof);

  // Muscle car supercharger scoop or hypercar roof scoop
  if (spec.bodyStyle === 'muscle') {
    const scoopGeo = new THREE.BoxGeometry(0.46, 0.16, 0.72);
    const scoop = new THREE.Mesh(scoopGeo, exhaustMat);
    scoop.position.set(0, 0.88, -1.25);
    bodyGroup.add(scoop);
  } else if (spec.bodyStyle === 'hypercar' || spec.bodyStyle === 'supercar') {
    const intakeGeo = new THREE.BoxGeometry(0.32, 0.12, 0.62);
    const intake = new THREE.Mesh(intakeGeo, secondaryMaterial);
    intake.position.set(0, roofH + 0.07, 0.55);
    cabinExterior.add(intake);
  }

  // 4. Side mirrors
  const mirrorGeo = new THREE.BoxGeometry(0.18, 0.08, 0.14);
  for (const side of [-1, 1]) {
    const mirror = new THREE.Mesh(mirrorGeo, secondaryMaterial);
    mirror.position.set(side * 1.0, 0.86, -0.58);
    bodyGroup.add(mirror);
  }

  // 5. Headlight clusters + Grille
  const grilleGeo = new THREE.BoxGeometry(1.18, 0.2, 0.08);
  const grille = new THREE.Mesh(grilleGeo, secondaryMaterial);
  grille.position.set(0, 0.36, -2.35);
  bodyGroup.add(grille);

  const hlGeo = new THREE.BoxGeometry(0.38, 0.09, 0.12);
  for (const side of [-1, 1]) {
    const hl = new THREE.Mesh(hlGeo, headlightMat);
    hl.position.set(side * 0.68, 0.52, -2.3);
    hl.rotation.y = side * -0.18;
    bodyGroup.add(hl);
  }

  // 6. Taillight LED bar / clusters
  const tlGeo = new THREE.BoxGeometry(0.48, 0.09, 0.1);
  for (const side of [-1, 1]) {
    const tl = new THREE.Mesh(tlGeo, taillightMat);
    tl.position.set(side * 0.64, 0.64, 2.33);
    bodyGroup.add(tl);
  }
  if (spec.bodyStyle === 'hypercar' || spec.bodyStyle === 'luxury') {
    const barGeo = new THREE.BoxGeometry(1.5, 0.045, 0.07);
    const bar = new THREE.Mesh(barGeo, taillightMat);
    bar.position.set(0, 0.64, 2.34);
    bodyGroup.add(bar);
  }

  // 7. Exhaust pipes & Nitro flames
  const pipeGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.18, 12);
  pipeGeo.rotateX(Math.PI / 2);
  const flameGeo = new THREE.ConeGeometry(0.11, 0.72, 10);
  flameGeo.rotateX(Math.PI / 2);
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.9,
  });
  const nitroFlames: THREE.Mesh[] = [];

  for (const side of [-1, 1]) {
    const pipe = new THREE.Mesh(pipeGeo, exhaustMat);
    pipe.position.set(side * 0.55, 0.27, 2.34);
    bodyGroup.add(pipe);

    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(side * 0.55, 0.27, 2.75);
    flame.visible = false;
    bodyGroup.add(flame);
    nitroFlames.push(flame);
  }

  // 8. Cockpit steering wheel & dash (visible in 1st-person cockpit camera!)
  const steeringWheel = new THREE.Group();
  steeringWheel.position.set(-0.34, 0.78, -0.45);
  const wheelRimGeo = new THREE.TorusGeometry(0.14, 0.022, 8, 20);
  const wheelRim = new THREE.Mesh(wheelRimGeo, secondaryMaterial);
  const wheelSpokeGeo = new THREE.BoxGeometry(0.24, 0.03, 0.02);
  const wheelSpoke = new THREE.Mesh(wheelSpokeGeo, exhaustMat);
  steeringWheel.add(wheelRim, wheelSpoke);
  steeringWheel.rotation.x = -0.28;
  bodyGroup.add(steeringWheel);

  const dashGeo = new THREE.BoxGeometry(1.38, 0.18, 0.36);
  const dash = new THREE.Mesh(dashGeo, secondaryMaterial);
  dash.position.set(0, 0.72, -0.68);
  bodyGroup.add(dash);

  // 9. Customizable Spoiler
  const spoilerGroup = buildSpoilerMesh(
    customization.spoiler,
    paintMaterial,
    secondaryMaterial
  );
  bodyGroup.add(spoilerGroup);

  // 10. Four independent wheels with steering pivots
  const wheelPositions: {
    x: number;
    z: number;
    isFront: boolean;
    isLeft: boolean;
  }[] = [
    { x: -0.94, z: -1.45, isFront: true, isLeft: true },
    { x: 0.94, z: -1.45, isFront: true, isLeft: false },
    { x: -0.94, z: 1.42, isFront: false, isLeft: true },
    { x: 0.94, z: 1.42, isFront: false, isLeft: false },
  ];

  const flSteer = new THREE.Group();
  const frSteer = new THREE.Group();
  const flSpin = new THREE.Group();
  const frSpin = new THREE.Group();
  const rlSpin = new THREE.Group();
  const rrSpin = new THREE.Group();

  const spinTargets = [flSpin, frSpin, rlSpin, rrSpin];

  wheelPositions.forEach((wp, idx) => {
    const wheelMesh = buildWheelMesh(
      customization.wheelDesign,
      rimMaterial,
      tireMaterial,
      caliperMaterial,
      wp.isLeft
    );
    const spinGroup = spinTargets[idx];
    spinGroup.add(wheelMesh);

    if (wp.isFront) {
      const steerGroup = wp.isLeft ? flSteer : frSteer;
      steerGroup.position.set(wp.x, 0.36, wp.z);
      steerGroup.add(spinGroup);
      root.add(steerGroup);
    } else {
      spinGroup.position.set(wp.x, 0.36, wp.z);
      root.add(spinGroup);
    }
  });

  // 11. Contact Shadow Plane (prevents floating look)
  const shadowPlaneGeo = new THREE.PlaneGeometry(2.6, 5.4);
  shadowPlaneGeo.rotateX(-Math.PI / 2);
  const shadowPlaneMat = new THREE.MeshBasicMaterial({
    map: getContactShadowTexture(),
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
  shadowPlane.position.y = 0.02;
  root.add(shadowPlane);

  // Optional player headlight SpotLight (no shadows for performance)
  let headlightBeam: THREE.SpotLight | null = null;
  if (options.isPlayer) {
    headlightBeam = new THREE.SpotLight(hlColor, 0, 55, Math.PI / 5, 0.55, 1.5);
    headlightBeam.position.set(0, 0.65, -2.35);
    headlightBeam.target.position.set(0, 0.1, -22);
    bodyGroup.add(headlightBeam);
    bodyGroup.add(headlightBeam.target);
  }

  const dispose = () => {
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry.dispose();
        if (Array.isArray(m.material)) {
          m.material.forEach((mat) => mat.dispose());
        } else if (m.material !== shadowPlaneMat) {
          m.material.dispose();
        }
      }
    });
    shadowPlaneMat.dispose();
  };

  return {
    root,
    bodyGroup,
    wheels: { flSteer, frSteer, flSpin, frSpin, rlSpin, rrSpin },
    steeringWheel,
    cabinExterior,
    brakeLightMats: [taillightMat],
    headlightMats: [headlightMat],
    headlightBeam,
    nitroFlames,
    spoilerGroup,
    paintMaterial,
    secondaryMaterial,
    rimMaterial,
    dispose,
  };
}
