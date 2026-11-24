import * as THREE from 'three';

function mat(color, roughness = 0.75) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });
}

export function createCapybara() {
  const group = new THREE.Group();
  const bodyRoot = new THREE.Group();
  group.add(bodyRoot);

  const fur = mat(0x9b6b43, 0.85);
  const snoutMat = mat(0x7c5030, 0.85);
  const dark = mat(0x231712, 0.4);
  const apronMat = mat(0xfff5e6, 0.7);
  const strapMat = mat(0xe07a5f, 0.7);

  // Plump rounded body
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.34, 8, 16), fur);
  torso.position.y = 0.52;
  torso.castShadow = true;
  bodyRoot.add(torso);

  // Cute barista apron
  const apron = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.42, 16, 1, false, -0.9, 1.8), apronMat);
  apron.position.set(0, 0.44, 0.03);
  apron.castShadow = true;
  bodyRoot.add(apron);

  const apronPocket = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.06), strapMat);
  apronPocket.position.set(0, 0.38, 0.37);
  bodyRoot.add(apronPocket);

  // Head
  const head = new THREE.Group();
  head.position.set(0, 0.96, 0.14);
  bodyRoot.add(head);

  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.44, 0.56), fur);
  skull.castShadow = true;
  head.add(skull);

  // Iconic boxy capybara snout
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.26), snoutMat);
  snout.position.set(0, -0.05, 0.32);
  snout.castShadow = true;
  head.add(snout);

  // Chill capybara eyes & nose
  const eyeGeo = new THREE.SphereGeometry(0.042, 10, 10);
  const eyeL = new THREE.Mesh(eyeGeo, dark);
  eyeL.position.set(-0.18, 0.08, 0.28);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.18;
  head.add(eyeL, eyeR);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.05), dark);
  nose.position.set(0, 0.02, 0.45);
  head.add(nose);

  // Little ears
  const earGeo = new THREE.SphereGeometry(0.09, 10, 10);
  const earL = new THREE.Mesh(earGeo, snoutMat);
  earL.scale.set(0.7, 1.1, 0.7);
  earL.position.set(-0.23, 0.22, -0.05);
  const earR = earL.clone();
  earR.position.x = 0.23;
  head.add(earL, earR);

  // 4 little stubby legs
  const legGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.24, 10);
  const legs = [];
  const legPositions = [
    [-0.18, 0.12, 0.16],
    [0.18, 0.12, 0.16],
    [-0.18, 0.12, -0.16],
    [0.18, 0.12, -0.16],
  ];
  for (const [lx, ly, lz] of legPositions) {
    const leg = new THREE.Mesh(legGeo, snoutMat);
    leg.position.set(lx, ly, lz);
    leg.castShadow = true;
    bodyRoot.add(leg);
    legs.push(leg);
  }

  // Cosmetics: Flower Hat
  const flowerHat = new THREE.Group();
  flowerHat.position.set(0, 0.24, 0.02);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.06, 16), mat(0xffb3c6));
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.14, 14), mat(0xff8fab));
  crown.position.y = 0.09;
  const blossom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), mat(0xfff176));
  blossom.position.set(0.16, 0.1, 0.1);
  flowerHat.add(brim, crown, blossom);
  flowerHat.visible = false;
  head.add(flowerHat);

  // Cosmetics: Chef Hat
  const chefHat = new THREE.Group();
  chefHat.position.set(0, 0.24, 0);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.14, 16), mat(0xffffff));
  band.position.y = 0.06;
  const puff = new THREE.Mesh(new THREE.SphereGeometry(0.23, 14, 14), mat(0xffffff));
  puff.position.y = 0.22;
  chefHat.add(band, puff);
  chefHat.visible = false;
  head.add(chefHat);

  // Cosmetics: Cute Glasses
  const glasses = new THREE.Group();
  glasses.position.set(0, 0.08, 0.3);
  const frameMat = mat(0x4e342e, 0.3);
  const ringL = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.015, 8, 16), frameMat);
  ringL.position.x = -0.16;
  const ringR = ringL.clone();
  ringR.position.x = 0.16;
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.02), frameMat);
  glasses.add(ringL, ringR, bridge);
  glasses.visible = false;
  head.add(glasses);

  // Held tray & item indicator
  const trayGroup = new THREE.Group();
  trayGroup.position.set(0, 0.62, 0.52);
  const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.04, 16), mat(0xd7a86e));
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.24, 12), mat(0xff8fab));
  cup.position.y = 0.14;
  trayGroup.add(tray, cup);
  trayGroup.visible = false;
  bodyRoot.add(trayGroup);

  let walkClock = 0;

  return {
    group,
    setWalking(isWalking, dt) {
      if (isWalking) {
        walkClock += dt * 13;
        bodyRoot.position.y = Math.abs(Math.sin(walkClock)) * 0.07;
        bodyRoot.rotation.z = Math.sin(walkClock) * 0.05;
        legs[0].rotation.x = Math.sin(walkClock) * 0.45;
        legs[3].rotation.x = Math.sin(walkClock) * 0.45;
        legs[1].rotation.x = -Math.sin(walkClock) * 0.45;
        legs[2].rotation.x = -Math.sin(walkClock) * 0.45;
      } else {
        bodyRoot.position.y *= 0.85;
        bodyRoot.rotation.z *= 0.85;
        for (const l of legs) l.rotation.x *= 0.8;
      }
    },
    setHeldItem(recipe) {
      if (!recipe) {
        trayGroup.visible = false;
      } else {
        trayGroup.visible = true;
        cup.material.color.setHex(recipe.color);
      }
    },
    applyCosmetics(hatId, hasGlasses) {
      flowerHat.visible = hatId === 'hat_flower';
      chefHat.visible = hatId === 'hat_chef';
      glasses.visible = !!hasGlasses;
    },
  };
}

export function createAnimalCustomer(def) {
  const group = new THREE.Group();
  const root = new THREE.Group();
  group.add(root);

  const mainMat = mat(def.color, 0.78);
  const accentMat = mat(def.accentColor, 0.78);
  const eyeMat = mat(0x221814, 0.3);

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.26, 8, 14), mainMat);
  body.position.y = 0.42;
  body.castShadow = true;
  root.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 14), mainMat);
  head.position.set(0, 0.84, 0.04);
  head.castShadow = true;
  root.add(head);

  // Eyes
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 8), eyeMat);
  eyeL.position.set(-0.1, 0.87, 0.27);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.1;
  root.add(eyeL, eyeR);

  // Species features
  if (def.earType === 'bunny') {
    const earGeo = new THREE.CapsuleGeometry(0.06, 0.26, 6, 10);
    const eL = new THREE.Mesh(earGeo, mainMat);
    eL.position.set(-0.11, 1.22, 0);
    const eR = eL.clone();
    eR.position.x = 0.11;
    root.add(eL, eR);
  } else if (def.earType === 'panda') {
    const eGeo = new THREE.SphereGeometry(0.09, 10, 10);
    const eL = new THREE.Mesh(eGeo, accentMat);
    eL.position.set(-0.18, 1.07, 0);
    const eR = eL.clone();
    eR.position.x = 0.18;
    const pL = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), accentMat);
    pL.scale.set(1.1, 1.2, 0.4);
    pL.position.set(-0.1, 0.87, 0.24);
    const pR = pL.clone();
    pR.position.x = 0.1;
    root.add(eL, eR, pL, pR);
  } else if (def.earType === 'fox' || def.earType === 'cat') {
    const cone = new THREE.ConeGeometry(0.09, 0.2, 8);
    const eL = new THREE.Mesh(cone, mainMat);
    eL.position.set(-0.15, 1.11, 0.02);
    eL.rotation.z = 0.2;
    const eR = new THREE.Mesh(cone, mainMat);
    eR.position.set(0.15, 1.11, 0.02);
    eR.rotation.z = -0.2;
    root.add(eL, eR);
  } else if (def.earType === 'bear') {
    const eGeo = new THREE.SphereGeometry(0.09, 10, 10);
    const eL = new THREE.Mesh(eGeo, mainMat);
    eL.position.set(-0.18, 1.06, 0.02);
    const eR = eL.clone();
    eR.position.x = 0.18;
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), accentMat);
    snout.position.set(0, 0.8, 0.24);
    root.add(eL, eR, snout);
  } else if (def.earType === 'duck') {
    const beak = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.16), accentMat);
    beak.position.set(0, 0.81, 0.29);
    root.add(beak);
  }

  let clock = Math.random() * 6;

  return {
    group,
    update(dt, animState) {
      clock += dt * 7;
      if (animState === 'walking') {
        root.position.y = Math.abs(Math.sin(clock * 1.4)) * 0.08;
        root.rotation.z = Math.sin(clock * 1.4) * 0.05;
      } else if (animState === 'happy') {
        root.position.y = Math.abs(Math.sin(clock * 2.2)) * 0.18;
        root.rotation.z = 0;
      } else {
        // sitting
        root.position.y = Math.sin(clock * 0.6) * 0.02 - 0.08;
        root.rotation.z = 0;
      }
    },
  };
}