import * as THREE from 'three';

function box(w, h, d, color, roughness = 0.8) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness })
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createCafeEnvironment(scene) {
  const root = new THREE.Group();
  scene.add(root);

  // Floor
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xe7c697, roughness: 0.85 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(13.2, 10.6), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  // Back & Left Walls
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xfff3e0, roughness: 0.9 });
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(13.2, 3.6, 0.25), wallMat);
  backWall.position.set(0, 1.8, -5.2);
  backWall.receiveShadow = true;
  root.add(backWall);

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.6, 10.6), wallMat);
  leftWall.position.set(-6.5, 1.8, 0);
  leftWall.receiveShadow = true;
  root.add(leftWall);

  // Window frame on back wall
  const windowGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 1.5),
    new THREE.MeshStandardMaterial({ color: 0xb3e5fc, emissive: 0x81d4fa, emissiveIntensity: 0.25 })
  );
  windowGlass.position.set(0, 2.0, -5.06);
  root.add(windowGlass);

  // Café Sign
  const signBoard = box(2.4, 0.55, 0.14, 0x6d4c41);
  signBoard.position.set(-4.1, 2.5, -5.02);
  root.add(signBoard);

  // Service Counter (back area)
  const counterTop = box(9.2, 0.18, 1.1, 0xa47148);
  counterTop.position.set(-0.4, 0.92, -3.5);
  const counterBase = box(9.0, 0.88, 0.96, 0xd4a373);
  counterBase.position.set(-0.4, 0.44, -3.5);
  root.add(counterBase, counterTop);

  // Station 1: Fruit & Milkshake Blender (left)
  const blenderGroup = new THREE.Group();
  blenderGroup.position.set(-3.1, 1.01, -3.5);
  const bBase = box(0.45, 0.18, 0.45, 0xff8fab);
  bBase.position.y = 0.09;
  const bJar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.14, 0.42, 12),
    new THREE.MeshStandardMaterial({ color: 0xffd6e0, transparent: true, opacity: 0.85 })
  );
  bJar.position.y = 0.38;
  blenderGroup.add(bBase, bJar);
  root.add(blenderGroup);

  // Station 2: Espresso & Tea Machine (center)
  const espressoGroup = new THREE.Group();
  espressoGroup.position.set(-0.3, 1.01, -3.5);
  const eBody = box(0.7, 0.55, 0.5, 0x5d4037);
  eBody.position.y = 0.27;
  const eAccent = box(0.54, 0.16, 0.54, 0xd7ccc8);
  eAccent.position.y = 0.44;
  espressoGroup.add(eBody, eAccent);
  root.add(espressoGroup);

  // Station 3: Bakery Counter (right)
  const bakeryGroup = new THREE.Group();
  bakeryGroup.position.set(2.5, 1.01, -3.5);
  const oven = box(0.75, 0.5, 0.55, 0xf6c453);
  oven.position.y = 0.25;
  const glassDoor = box(0.52, 0.26, 0.06, 0xffe082);
  glassDoor.position.set(0, 0.25, 0.26);
  bakeryGroup.add(oven, glassDoor);
  root.add(bakeryGroup);

  // Station 4: Sink / Trash (right wall)
  const sinkGroup = new THREE.Group();
  sinkGroup.position.set(5.4, 0, -2.0);
  const sinkBody = box(0.95, 0.85, 1.2, 0xe0e0e0);
  sinkBody.position.y = 0.42;
  const basin = box(0.65, 0.1, 0.85, 0x90caf9);
  basin.position.y = 0.84;
  sinkGroup.add(sinkBody, basin);
  root.add(sinkGroup);

  // Welcome Mat / Doorway
  const doorMat = box(1.8, 0.04, 1.0, 0xe07a5f);
  doorMat.position.set(0, 0.02, 4.7);
  root.add(doorMat);

  // Tables (2 unlocked initially, 2 unlockable)
  const tableCoords = [
    { id: 0, x: -3.4, z: 0.3, unlocked: true },
    { id: 1, x: 3.4, z: 0.3, unlocked: true },
    { id: 2, x: -3.4, z: 3.0, unlocked: false, unlockKey: 'table_3' },
    { id: 3, x: 3.4, z: 3.0, unlocked: false, unlockKey: 'table_4' },
  ];

  const tables = tableCoords.map((cfg) => {
    const tGroup = new THREE.Group();
    tGroup.position.set(cfg.x, 0, cfg.z);

    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.72, 0.1, 18),
      new THREE.MeshStandardMaterial({ color: 0xb07d4f, roughness: 0.75 })
    );
    top.position.y = 0.68;
    top.castShadow = true;
    top.receiveShadow = true;

    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.16, 0.65, 12),
      new THREE.MeshStandardMaterial({ color: 0x6d4c41, roughness: 0.8 })
    );
    leg.position.y = 0.32;
    leg.castShadow = true;

    // Customer chair on outer side
    const chair = box(0.55, 0.12, 0.55, 0xf2b880);
    chair.position.set(0, 0.38, -0.95);
    const chairBack = box(0.55, 0.45, 0.1, 0xe09f67);
    chairBack.position.set(0, 0.62, -1.18);

    // Dirty cup mesh
    const dirtyMesh = new THREE.Group();
    const puddle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.02, 12),
      new THREE.MeshStandardMaterial({ color: 0x795548 })
    );
    puddle.position.set(0.1, 0.74, 0.05);
    dirtyMesh.add(puddle);
    dirtyMesh.visible = false;

    // Served drink mesh
    const servedMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.08, 0.24, 10),
      new THREE.MeshStandardMaterial({ color: 0xff8fab })
    );
    servedMesh.position.set(0, 0.85, 0);
    servedMesh.visible = false;

    tGroup.add(top, leg, chair, chairBack, dirtyMesh, servedMesh);
    tGroup.visible = cfg.unlocked;
    root.add(tGroup);

    return {
      id: cfg.id,
      x: cfg.x,
      z: cfg.z,
      interactX: cfg.x,
      interactZ: cfg.z + 1.15,
      seatX: cfg.x,
      seatZ: cfg.z - 0.92,
      unlocked: cfg.unlocked,
      unlockKey: cfg.unlockKey || null,
      group: tGroup,
      dirtyMesh,
      servedMesh,
      customer: null,
      state: 'empty', // empty | waiting | eating | dirty
    };
  });

  // Unlockable Decor: Plants
  const plantsGroup = new THREE.Group();
  const plantSpots = [
    [-5.7, -4.2],
    [5.7, -4.2],
    [-5.7, 3.8],
  ];
  for (const [px, pz] of plantSpots) {
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.22, 0.42, 12),
      new THREE.MeshStandardMaterial({ color: 0xd97d54 })
    );
    pot.position.set(px, 0.21, pz);
    pot.castShadow = true;
    const leaves = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.42),
      new THREE.MeshStandardMaterial({ color: 0x55a630 })
    );
    leaves.position.set(px, 0.68, pz);
    leaves.castShadow = true;
    plantsGroup.add(pot, leaves);
  }
  plantsGroup.visible = false;
  root.add(plantsGroup);

  // Unlockable Decor: Fairy Lights
  const lightsGroup = new THREE.Group();
  const bulbColors = [0xffe082, 0xffab91, 0xfff59d];
  for (let i = 0; i < 9; i++) {
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 10, 10),
      new THREE.MeshStandardMaterial({
        color: bulbColors[i % 3],
        emissive: bulbColors[i % 3],
        emissiveIntensity: 0.9,
      })
    );
    bulb.position.set(-4.8 + i * 1.2, 3.1 + Math.sin(i) * 0.14, -4.95);
    lightsGroup.add(bulb);
  }
  lightsGroup.visible = false;
  root.add(lightsGroup);

  const stations = [
    { id: 'blender', name: 'Drink Bar', emoji: '🍓', x: -3.1, z: -3.5, interactX: -3.1, interactZ: -2.2 },
    { id: 'espresso', name: 'Coffee & Tea', emoji: '☕', x: -0.3, z: -3.5, interactX: -0.3, interactZ: -2.2 },
    { id: 'bakery', name: 'Bakery Oven', emoji: '🥞', x: 2.5, z: -3.5, interactX: 2.5, interactZ: -2.2 },
    { id: 'sink', name: 'Sink / Trash', emoji: '🧼', x: 5.4, z: -2.0, interactX: 4.3, interactZ: -2.0 },
  ];

  // Simple AABB colliders for smooth sliding
  function getColliders() {
    const list = [
      { minX: -5.0, maxX: 4.2, minZ: -4.1, maxZ: -2.9 }, // main counter
      { minX: 4.85, maxX: 6.0, minZ: -2.7, maxZ: -1.3 }, // sink
    ];
    for (const t of tables) {
      if (t.unlocked) {
        list.push({ minX: t.x - 0.85, maxX: t.x + 0.85, minZ: t.z - 1.2, maxZ: t.z + 0.8 });
      }
    }
    return list;
  }

  function updateTheme(themeId) {
    if (themeId === 'theme_flower') {
      floorMat.color.setHex(0xf3d5e5);
      wallMat.color.setHex(0xfff0f6);
      windowGlass.material.color.setHex(0xf8bbd0);
      scene.background = new THREE.Color(0xfce4ec);
    } else if (themeId === 'theme_beach') {
      floorMat.color.setHex(0xf5deb3);
      wallMat.color.setHex(0xe0f7fa);
      windowGlass.material.color.setHex(0x4dd0e1);
      scene.background = new THREE.Color(0xb2ebf2);
    } else {
      floorMat.color.setHex(0xe7c697);
      wallMat.color.setHex(0xfff3e0);
      windowGlass.material.color.setHex(0xb3e5fc);
      scene.background = new THREE.Color(0xd7ebd0);
    }
  }

  function updateDecor(ownedSet) {
    plantsGroup.visible = ownedSet.has('plants');
    lightsGroup.visible = ownedSet.has('lights');
    for (const t of tables) {
      if (t.unlockKey) {
        t.unlocked = ownedSet.has(t.unlockKey);
        t.group.visible = t.unlocked;
      }
    }
  }

  return {
    tables,
    stations,
    doorPos: { x: 0, z: 4.9 },
    getColliders,
    updateTheme,
    updateDecor,
  };
}