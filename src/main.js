import * as THREE from 'three';
import { RECIPES, CUSTOMERS, SHOP_ITEMS, DAILY_MISSIONS } from './data.js';
import { audio } from './audio.js';
import { createCapybara, createAnimalCustomer } from './characters.js';
import { createCafeEnvironment } from './cafeScene.js';

const SAVE_KEY = 'capybara_cozy_cafe_v1';

const defaultSave = {
  coins: 60,
  gems: 5,
  xp: 0,
  level: 1,
  owned: ['hat_none', 'theme_forest'],
  equippedHat: 'hat_none',
  hasGlasses: false,
  equippedTheme: 'theme_forest',
  missions: { served: 0, strawberry: 0, cleaned: 0, rare: 0 },
  claimedMissions: [],
};

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return structuredClone(defaultSave);
    return { ...structuredClone(defaultSave), ...JSON.parse(raw) };
  } catch {
    return structuredClone(defaultSave);
  }
}

const save = loadSave();
function persist() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

// --- Three.js Setup ---
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd7ebd0);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 60);
camera.position.set(0, 10.2, 10.6);
camera.lookAt(0, 0.3, -0.4);

const hemiLight = new THREE.HemisphereLight(0xfff9f0, 0xb89b7a, 0.9);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xfff1d6, 1.15);
dirLight.position.set(6, 11, 7);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 30;
dirLight.shadow.camera.left = -8;
dirLight.shadow.camera.right = 8;
dirLight.shadow.camera.top = 8;
dirLight.shadow.camera.bottom = -8;
scene.add(dirLight);

const cafe = createCafeEnvironment(scene);
const capy = createCapybara();
capy.group.position.set(0, 0, 1.0);
scene.add(capy.group);

// Apply initial cosmetics & theme
const ownedSet = new Set(save.owned);
cafe.updateDecor(ownedSet);
cafe.updateTheme(save.equippedTheme);
capy.applyCosmetics(save.equippedHat, save.hasGlasses);

// --- Game State ---
let heldRecipe = null;
let moveTarget = null;
let pendingInteract = null;
let spawnTimer = 1.6;
let currentShopTab = 'decor';
let activePrep = null; // { stationId, recipe, stepIndex }

const keys = new Set();
const joyVec = { x: 0, y: 0 };

// --- DOM Elements ---
const overlaysEl = document.getElementById('world-overlays');
const floatTextsEl = document.getElementById('floating-texts');
const hudLevel = document.getElementById('hud-level');
const hudThemeName = document.getElementById('hud-theme-name');
const hudXpFill = document.getElementById('hud-xp-fill');
const hudCoins = document.getElementById('hud-coins');
const hudGems = document.getElementById('hud-gems');
const heldBadge = document.getElementById('held-badge');
const heldEmoji = document.getElementById('held-emoji');
const heldName = document.getElementById('held-name');
const actionBtn = document.getElementById('btn-action');
const actionBtnLabel = document.getElementById('action-btn-label');
const missionDot = document.getElementById('mission-dot');
const toastEl = document.getElementById('toast');

let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 2400);
}

function projectToScreen(x, y, z) {
  const v = new THREE.Vector3(x, y, z).project(camera);
  return {
    x: (v.x * 0.5 + 0.5) * window.innerWidth,
    y: (-v.y * 0.5 + 0.5) * window.innerHeight,
  };
}

function spawnFloatText(x, y, z, text) {
  const pos = projectToScreen(x, y, z);
  const el = document.createElement('div');
  el.className = 'float-text';
  el.textContent = text;
  el.style.left = `${pos.x}px`;
  el.style.top = `${pos.y}px`;
  floatTextsEl.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

function xpNeeded(lvl) {
  return 50 + (lvl - 1) * 35;
}

function addXP(amount) {
  save.xp += amount;
  while (save.xp >= xpNeeded(save.level)) {
    save.xp -= xpNeeded(save.level);
    save.level += 1;
    save.gems += 1;
    audio.playSuccess();
    showToast(`🎉 Level ${save.level}! +1 💎`);
  }
}

function updateHUD() {
  hudLevel.textContent = save.level;
  const themeItem = SHOP_ITEMS.find((i) => i.id === save.equippedTheme);
  hudThemeName.textContent = themeItem ? themeItem.name : 'Forest Café';
  hudXpFill.style.width = `${Math.min(100, (save.xp / xpNeeded(save.level)) * 100)}%`;
  hudCoins.textContent = save.coins;
  hudGems.textContent = save.gems;

  if (heldRecipe) {
    heldBadge.classList.remove('hidden');
    heldEmoji.textContent = heldRecipe.emoji;
    heldName.textContent = heldRecipe.name;
  } else {
    heldBadge.classList.add('hidden');
  }

  const anyClaimable = DAILY_MISSIONS.some(
    (m) => !save.claimedMissions.includes(m.id) && (save.missions[m.type] || 0) >= m.target
  );
  missionDot.classList.toggle('hidden', !anyClaimable);
  persist();
}

// --- Customer AI ---
function pickRandomCustomerDef() {
  if (Math.random() < 0.1) {
    return CUSTOMERS.find((c) => c.rare);
  }
  const normal = CUSTOMERS.filter((c) => !c.rare);
  return normal[Math.floor(Math.random() * normal.length)];
}

function pickOrderFor(def) {
  const keysList = Object.keys(RECIPES);
  if (Math.random() < 0.65 && RECIPES[def.favorite]) {
    return RECIPES[def.favorite];
  }
  return RECIPES[keysList[Math.floor(Math.random() * keysList.length)]];
}

function trySpawnCustomer() {
  const freeTables = cafe.tables.filter((t) => t.unlocked && t.state === 'empty' && !t.customer);
  if (freeTables.length === 0) return;

  const table = freeTables[Math.floor(Math.random() * freeTables.length)];
  const def = pickRandomCustomerDef();
  const order = pickOrderFor(def);
  const mesh = createAnimalCustomer(def);
  mesh.group.position.set(cafe.doorPos.x, 0, cafe.doorPos.z);
  scene.add(mesh.group);

  if (def.rare) {
    save.missions.rare += 1;
    showToast('✨ A Rare Golden Bunny entered the café!');
    audio.playSuccess();
  } else {
    audio.playDing();
  }

  table.customer = {
    def,
    order,
    mesh,
    phase: 'toSeat', // toSeat | waiting | eating | leaving
    patience: 48,
    maxPatience: 48,
    eatTimer: 3.2,
  };
  table.state = 'reserved';
}

function updateCustomers(dt) {
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    trySpawnCustomer();
    spawnTimer = 4.2 + Math.random() * 2.8;
  }

  for (const t of cafe.tables) {
    const c = t.customer;
    if (!c) continue;

    if (c.phase === 'toSeat') {
      const dx = t.seatX - c.mesh.group.position.x;
      const dz = t.seatZ - c.mesh.group.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.12) {
        c.mesh.group.position.set(t.seatX, 0, t.seatZ);
        c.mesh.group.rotation.y = 0; // face table
        c.phase = 'waiting';
        t.state = 'waiting';
      } else {
        const step = Math.min(dist, dt * 2.4);
        c.mesh.group.position.x += (dx / dist) * step;
        c.mesh.group.position.z += (dz / dist) * step;
        c.mesh.group.rotation.y = Math.atan2(dx, dz);
        c.mesh.update(dt, 'walking');
      }
    } else if (c.phase === 'waiting') {
      c.patience -= dt;
      c.mesh.update(dt, 'sitting');
      if (c.patience <= 0) {
        showToast(`${c.def.name} left! Too slow 😢`);
        c.phase = 'leaving';
        t.state = 'empty';
      }
    } else if (c.phase === 'eating') {
      c.eatTimer -= dt;
      c.mesh.update(dt, 'happy');
      if (c.eatTimer <= 0) {
        t.servedMesh.visible = false;
        t.dirtyMesh.visible = true;
        t.state = 'dirty';
        c.phase = 'leaving';
      }
    } else if (c.phase === 'leaving') {
      const dx = cafe.doorPos.x - c.mesh.group.position.x;
      const dz = cafe.doorPos.z - c.mesh.group.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.25) {
        scene.remove(c.mesh.group);
        t.customer = null;
      } else {
        const step = Math.min(dist, dt * 2.7);
        c.mesh.group.position.x += (dx / dist) * step;
        c.mesh.group.position.z += (dz / dist) * step;
        c.mesh.group.rotation.y = Math.atan2(dx, dz);
        c.mesh.update(dt, 'walking');
      }
    }
  }
}

// --- Interaction & Gameplay ---
function getNearestInteractable() {
  const px = capy.group.position.x;
  const pz = capy.group.position.z;
  let best = null;
  let bestDist = 1.9;

  for (const t of cafe.tables) {
    if (!t.unlocked) continue;
    const d = Math.hypot(px - t.x, pz - t.z);
    if (d < bestDist && (t.state === 'waiting' || t.state === 'dirty')) {
      bestDist = d;
      best = { type: 'table', ref: t };
    }
  }

  for (const s of cafe.stations) {
    const d = Math.hypot(px - s.interactX, pz - s.interactZ);
    if (d < 1.55) {
      return { type: 'station', ref: s };
    }
  }
  return best;
}

function handleInteract(target) {
  if (!target) return;

  if (target.type === 'table') {
    const t = target.ref;
    if (t.state === 'dirty') {
      t.dirtyMesh.visible = false;
      t.state = 'empty';
      const cleanCoins = 5;
      save.coins += cleanCoins;
      save.missions.cleaned += 1;
      addXP(8);
      audio.playClean();
      spawnFloatText(t.x, 1.3, t.z, `+${cleanCoins} 🪙 Clean!`);
      updateHUD();
      return;
    }

    if (t.state === 'waiting' && t.customer) {
      const c = t.customer;
      if (!heldRecipe) {
        showToast(`${c.def.name} wants ${c.order.emoji} ${c.order.name}!`);
        return;
      }
      if (heldRecipe.id !== c.order.id) {
        audio.playWrong();
        showToast(`Wrong order! ${c.def.name} wants ${c.order.emoji} ${c.order.name}`);
        return;
      }

      // Serve success!
      const fastBonus = c.patience > c.maxPatience * 0.55 ? 6 : 0;
      const decorBonus = (ownedSet.has('plants') ? 2 : 0) + (ownedSet.has('lights') ? 2 : 0);
      const rareBonus = c.def.rare ? 25 : 0;
      const total = c.order.price + fastBonus + decorBonus + rareBonus;

      save.coins += total;
      save.missions.served += 1;
      addXP(c.order.xp);

      heldRecipe = null;
      capy.setHeldItem(null);
      t.servedMesh.material.color.setHex(c.order.color);
      t.servedMesh.visible = true;
      t.state = 'eating';
      c.phase = 'eating';

      audio.playCoin();
      spawnFloatText(t.x, 1.5, t.z, `+${total} 🪙${fastBonus ? ' ⚡' : ''}`);
      updateHUD();
    }
  } else if (target.type === 'station') {
    const s = target.ref;
    if (s.id === 'sink') {
      if (heldRecipe) {
        heldRecipe = null;
        capy.setHeldItem(null);
        audio.playClean();
        showToast('Cleared tray!');
        updateHUD();
      } else {
        showToast('Sink is sparkling clean 🧼');
      }
      return;
    }

    if (heldRecipe) {
      showToast(`Serve ${heldRecipe.emoji} ${heldRecipe.name} first (or use Sink to clear)`);
      return;
    }
    openPrepModal(s.id);
  }
}

// --- Prep Modal ---
const prepModal = document.getElementById('prep-modal');
const prepTitle = document.getElementById('prep-title');
const prepSubtitle = document.getElementById('prep-subtitle');
const prepPicker = document.getElementById('prep-recipe-picker');
const prepWorkspace = document.getElementById('prep-workspace');
const prepStepsDisplay = document.getElementById('prep-steps-display');
const prepCupVisual = document.getElementById('prep-cup-visual');
const prepStatusText = document.getElementById('prep-status-text');
const prepButtons = document.getElementById('prep-buttons');

function openPrepModal(stationId) {
  const stationRecipes = Object.values(RECIPES).filter((r) => r.station === stationId);
  const wantedIds = new Set(
    cafe.tables.filter((t) => t.state === 'waiting' && t.customer).map((t) => t.customer.order.id)
  );

  prepTitle.textContent =
    stationId === 'blender' ? '🍓 Drink Bar' : stationId === 'espresso' ? '☕ Coffee & Tea' : '🥞 Bakery Oven';
  prepSubtitle.textContent = 'Choose a recipe to prepare';
  prepPicker.classList.remove('hidden');
  prepWorkspace.classList.add('hidden');
  prepPicker.innerHTML = '';

  for (const r of stationRecipes) {
    const btn = document.createElement('button');
    btn.className = `recipe-choice ${wantedIds.has(r.id) ? 'wanted' : ''}`;
    btn.innerHTML = `
      <span class="rc-emoji">${r.emoji}</span>
      <div class="rc-name">${r.name}</div>
      <div class="rc-price">🪙 ${r.price} ${wantedIds.has(r.id) ? '• Ordered!' : ''}</div>
    `;
    btn.onclick = () => startRecipePrep(r);
    prepPicker.appendChild(btn);
  }

  prepModal.classList.remove('hidden');
}

function startRecipePrep(recipe) {
  activePrep = { recipe, stepIndex: 0 };
  prepTitle.textContent = `Making ${recipe.emoji} ${recipe.name}`;
  prepSubtitle.textContent = 'Tap the ingredients in order!';
  prepPicker.classList.add('hidden');
  prepWorkspace.classList.remove('hidden');
  renderPrepStep();
}

function renderPrepStep() {
  const { recipe, stepIndex } = activePrep;
  prepStepsDisplay.innerHTML = recipe.steps
    .map((st, idx) => {
      const cls = idx < stepIndex ? 'done' : idx === stepIndex ? 'current' : '';
      return `<span class="step-chip ${cls}">${idx + 1}. ${st.emoji} ${st.label}</span>`;
    })
    .join('');

  const cur = recipe.steps[stepIndex];
  prepCupVisual.textContent = stepIndex === 0 ? '🫙' : recipe.steps[stepIndex - 1].emoji;
  prepStatusText.textContent = `Next: ${cur.emoji} ${cur.label}`;

  // Shuffle ingredient buttons so it feels interactive
  const shuffled = [...recipe.steps].sort(() => Math.random() - 0.5);
  prepButtons.innerHTML = '';
  for (const st of shuffled) {
    const btn = document.createElement('button');
    btn.className = 'prep-ing-btn';
    btn.innerHTML = `<span>${st.emoji}</span><span>${st.label}</span>`;
    btn.onclick = () => {
      if (st.label === cur.label) {
        audio.playPop();
        prepCupVisual.classList.remove('pop');
        void prepCupVisual.offsetWidth;
        prepCupVisual.classList.add('pop');
        activePrep.stepIndex += 1;

        if (activePrep.stepIndex >= recipe.steps.length) {
          heldRecipe = recipe;
          capy.setHeldItem(recipe);
          if (recipe.id === 'strawberry_milkshake') {
            save.missions.strawberry += 1;
          }
          audio.playSuccess();
          prepModal.classList.add('hidden');
          activePrep = null;
          showToast(`Prepared ${recipe.emoji} ${recipe.name}! Carry it to the table.`);
          updateHUD();
        } else {
          renderPrepStep();
        }
      } else {
        audio.playWrong();
        btn.classList.remove('wrong');
        void btn.offsetWidth;
        btn.classList.add('wrong');
      }
    };
    prepButtons.appendChild(btn);
  }
}

document.getElementById('prep-close').onclick = () => {
  prepModal.classList.add('hidden');
  activePrep = null;
};

// --- Shop Modal ---
const shopModal = document.getElementById('shop-modal');
const shopList = document.getElementById('shop-list');

function renderShop() {
  shopList.innerHTML = '';
  const items = SHOP_ITEMS.filter((i) => i.category === currentShopTab);

  for (const item of items) {
    const owned = ownedSet.has(item.id);
    const isEquipped =
      (item.category === 'outfit' &&
        ((item.slot === 'hat' && save.equippedHat === item.id) ||
          (item.slot === 'glasses' && save.hasGlasses))) ||
      (item.category === 'theme' && save.equippedTheme === item.id);

    const row = document.createElement('div');
    row.className = 'shop-item';

    let btnHtml = '';
    if (item.category === 'decor') {
      btnHtml = owned
        ? `<button class="buy-btn equipped" disabled>Owned ✓</button>`
        : `<button class="buy-btn" ${save.coins < item.price ? 'disabled' : ''}>🪙 ${item.price}</button>`;
    } else if (!owned) {
      btnHtml = `<button class="buy-btn" ${save.coins < item.price ? 'disabled' : ''}>🪙 ${item.price}</button>`;
    } else if (isEquipped) {
      btnHtml = `<button class="buy-btn equipped" disabled>Equipped ✓</button>`;
    } else {
      btnHtml = `<button class="buy-btn equip">Equip</button>`;
    }

    row.innerHTML = `
      <div class="item-info">
        <span class="item-emoji">${item.emoji}</span>
        <div>
          <div class="item-name">${item.name}</div>
          <div class="item-desc">${item.desc}</div>
        </div>
      </div>
      ${btnHtml}
    `;

    const btn = row.querySelector('button');
    btn.onclick = () => {
      if (!owned) {
        if (save.coins < item.price) return;
        save.coins -= item.price;
        save.owned.push(item.id);
        ownedSet.add(item.id);
        audio.playSuccess();
        showToast(`Unlocked ${item.emoji} ${item.name}!`);
      }

      if (item.category === 'decor') {
        cafe.updateDecor(ownedSet);
      } else if (item.category === 'outfit') {
        if (item.slot === 'hat') save.equippedHat = item.id;
        if (item.slot === 'glasses') save.hasGlasses = !save.hasGlasses || !isEquipped;
        capy.applyCosmetics(save.equippedHat, save.hasGlasses);
      } else if (item.category === 'theme') {
        save.equippedTheme = item.id;
        cafe.updateTheme(item.id);
      }
      updateHUD();
      renderShop();
    };

    shopList.appendChild(row);
  }
}

document.getElementById('btn-shop').onclick = () => {
  renderShop();
  shopModal.classList.remove('hidden');
};
document.getElementById('shop-close').onclick = () => shopModal.classList.add('hidden');
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentShopTab = btn.dataset.tab;
    renderShop();
  };
});

// --- Missions Modal ---
const missionsModal = document.getElementById('missions-modal');
const missionsList = document.getElementById('missions-list');

function renderMissions() {
  missionsList.innerHTML = '';
  for (const m of DAILY_MISSIONS) {
    const prog = Math.min(m.target, save.missions[m.type] || 0);
    const done = prog >= m.target;
    const claimed = save.claimedMissions.includes(m.id);

    const row = document.createElement('div');
    row.className = 'mission-item';
    row.innerHTML = `
      <div class="item-info">
        <span class="item-emoji">${claimed ? '✅' : done ? '🎁' : '📌'}</span>
        <div>
          <div class="item-name">${m.label} (${prog}/${m.target})</div>
          <div class="item-desc">Reward: 🪙 ${m.rewardCoins} & 💎 ${m.rewardGems}</div>
        </div>
      </div>
      <button class="buy-btn ${claimed ? 'claimed' : done ? 'equip' : ''}" ${!done || claimed ? 'disabled' : ''}>
        ${claimed ? 'Claimed' : done ? 'Claim!' : 'In Progress'}
      </button>
    `;
    row.querySelector('button').onclick = () => {
      if (!done || claimed) return;
      save.claimedMissions.push(m.id);
      save.coins += m.rewardCoins;
      save.gems += m.rewardGems;
      audio.playSuccess();
      showToast(`Mission Complete! +${m.rewardCoins} 🪙 +${m.rewardGems} 💎`);
      updateHUD();
      renderMissions();
    };
    missionsList.appendChild(row);
  }
}

document.getElementById('btn-missions').onclick = () => {
  renderMissions();
  missionsModal.classList.remove('hidden');
};
document.getElementById('missions-close').onclick = () => missionsModal.classList.add('hidden');

document.getElementById('btn-mute').onclick = (e) => {
  const m = audio.toggleMute();
  e.currentTarget.textContent = m ? '🔇' : '🔊';
};

// --- Controls: Keyboard, Virtual Joystick, Click-to-Move ---
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === ' ' || k === 'e') {
    if (prepModal.classList.contains('hidden') && shopModal.classList.contains('hidden')) {
      handleInteract(getNearestInteractable());
    }
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

actionBtn.onclick = () => handleInteract(getNearestInteractable());

// Virtual Joystick
const joyZone = document.getElementById('joystick-zone');
const joyKnob = document.getElementById('joystick-knob');
let joyActive = false;

function updateJoystick(clientX, clientY) {
  const rect = joyZone.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = clientX - cx;
  let dy = clientY - cy;
  const maxR = 32;
  const dist = Math.hypot(dx, dy);
  if (dist > maxR) {
    dx = (dx / dist) * maxR;
    dy = (dy / dist) * maxR;
  }
  joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  joyVec.x = dx / maxR;
  joyVec.y = dy / maxR;
  moveTarget = null;
  pendingInteract = null;
}

joyZone.addEventListener('pointerdown', (e) => {
  joyActive = true;
  joyZone.setPointerCapture(e.pointerId);
  updateJoystick(e.clientX, e.clientY);
});
joyZone.addEventListener('pointermove', (e) => {
  if (joyActive) updateJoystick(e.clientX, e.clientY);
});
joyZone.addEventListener('pointerup', () => {
  joyActive = false;
  joyKnob.style.transform = 'translate(0, 0)';
  joyVec.x = 0;
  joyVec.y = 0;
});

// Click / Tap on floor to walk
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
canvas.addEventListener('pointerdown', (e) => {
  audio.init();
  const ndc = new THREE.Vector2(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(groundPlane, hit)) {
    moveTarget = {
      x: THREE.MathUtils.clamp(hit.x, -5.8, 5.8),
      z: THREE.MathUtils.clamp(hit.z, -2.5, 4.4),
    };
    pendingInteract = null;
  }
});

function walkToAndInteract(x, z, interactTarget) {
  moveTarget = { x, z };
  pendingInteract = interactTarget;
}

// --- Smooth Circle-vs-AABB Collision ---
function resolveCollisions(pos) {
  pos.x = THREE.MathUtils.clamp(pos.x, -5.85, 5.85);
  pos.z = THREE.MathUtils.clamp(pos.z, -2.6, 4.45);
  const r = 0.42;
  for (const b of cafe.getColliders()) {
    const cx = THREE.MathUtils.clamp(pos.x, b.minX, b.maxX);
    const cz = THREE.MathUtils.clamp(pos.z, b.minZ, b.maxZ);
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 0.001;
      pos.x += (dx / d) * (r - d);
      pos.z += (dz / d) * (r - d);
    }
  }
}

// --- Projected 3D-to-2D Bubbles ---
const tableBubbles = new Map();
const stationTags = new Map();

function syncWorldOverlays() {
  const neededStations = new Set(
    cafe.tables
      .filter((t) => t.state === 'waiting' && t.customer && !heldRecipe)
      .map((t) => t.customer.order.station)
  );

  // Stations
  for (const s of cafe.stations) {
    let tag = stationTags.get(s.id);
    if (!tag) {
      tag = document.createElement('div');
      tag.className = 'station-tag';
      tag.textContent = `${s.emoji} ${s.name}`;
      tag.onclick = () => walkToAndInteract(s.interactX, s.interactZ, { type: 'station', ref: s });
      overlaysEl.appendChild(tag);
      stationTags.set(s.id, tag);
    }
    const pos = projectToScreen(s.x, 1.85, s.z);
    tag.style.left = `${pos.x}px`;
    tag.style.top = `${pos.y}px`;
    tag.classList.toggle('highlight', neededStations.has(s.id));
  }

  // Tables
  for (const t of cafe.tables) {
    let bubble = tableBubbles.get(t.id);
    const show = t.unlocked && (t.state === 'waiting' || t.state === 'dirty');
    if (!show) {
      if (bubble) bubble.classList.add('hidden');
      continue;
    }

    if (!bubble) {
      bubble = document.createElement('div');
      bubble.className = 'world-bubble';
      bubble.onclick = () => walkToAndInteract(t.interactX, t.interactZ, { type: 'table', ref: t });
      overlaysEl.appendChild(bubble);
      tableBubbles.set(t.id, bubble);
    }
    bubble.classList.remove('hidden');
    const pos = projectToScreen(t.x, 1.85, t.z - 0.5);
    bubble.style.left = `${pos.x}px`;
    bubble.style.top = `${pos.y}px`;

    if (t.state === 'dirty') {
      bubble.className = 'world-bubble dirty';
      bubble.innerHTML = `<div class="bubble-top"><span class="bubble-emoji">🧼</span> Clean!</div>`;
    } else if (t.customer) {
      const c = t.customer;
      const pct = Math.max(0, (c.patience / c.maxPatience) * 100);
      const match = heldRecipe && heldRecipe.id === c.order.id;
      const barColor = pct > 50 ? '#7bc47f' : pct > 25 ? '#f6c453' : '#e57373';
      bubble.className = `world-bubble ${match ? 'ready-match' : ''}`;
      bubble.innerHTML = `
        <div class="bubble-top">
          <span class="bubble-emoji">${c.order.emoji}</span>
          <span>${c.def.name}</span>
        </div>
        <div class="patience-track">
          <div class="patience-fill" style="width:${pct}%;background:${barColor}"></div>
        </div>
      `;
    }
  }
}

// --- Main Loop ---
const clock = new THREE.Clock();
updateHUD();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  const speed = ownedSet.has('speed_boots') ? 4.6 : 3.5;
  let vx = 0;
  let vz = 0;

  if (keys.has('w') || keys.has('arrowup')) vz -= 1;
  if (keys.has('s') || keys.has('arrowdown')) vz += 1;
  if (keys.has('a') || keys.has('arrowleft')) vx -= 1;
  if (keys.has('d') || keys.has('arrowright')) vx += 1;

  if (Math.abs(joyVec.x) > 0.1 || Math.abs(joyVec.y) > 0.1) {
    vx = joyVec.x;
    vz = joyVec.y;
  }

  let isWalking = false;
  if (vx !== 0 || vz !== 0) {
    moveTarget = null;
    pendingInteract = null;
    const len = Math.hypot(vx, vz);
    vx /= len;
    vz /= len;
    capy.group.position.x += vx * speed * dt;
    capy.group.position.z += vz * speed * dt;
    capy.group.rotation.y = Math.atan2(vx, vz);
    isWalking = true;
  } else if (moveTarget) {
    const dx = moveTarget.x - capy.group.position.x;
    const dz = moveTarget.z - capy.group.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.16) {
      moveTarget = null;
      if (pendingInteract) {
        handleInteract(pendingInteract);
        pendingInteract = null;
      }
    } else {
      const step = Math.min(dist, speed * dt);
      capy.group.position.x += (dx / dist) * step;
      capy.group.position.z += (dz / dist) * step;
      capy.group.rotation.y = Math.atan2(dx, dz);
      isWalking = true;
    }
  }

  resolveCollisions(capy.group.position);
  capy.setWalking(isWalking, dt);

  updateCustomers(dt);
  syncWorldOverlays();

  // Update contextual action button
  const near = getNearestInteractable();
  if (!near) {
    actionBtn.classList.add('idle');
    actionBtnLabel.textContent = 'Walk to Table/Bar';
  } else {
    actionBtn.classList.remove('idle');
    if (near.type === 'station') {
      actionBtnLabel.textContent = near.ref.id === 'sink' ? '🧼 Use Sink' : `${near.ref.emoji} Cook/Brew`;
    } else if (near.ref.state === 'dirty') {
      actionBtnLabel.textContent = '🧼 Clean Table';
    } else {
      actionBtnLabel.textContent = heldRecipe ? `Serve ${heldRecipe.emoji}` : 'Check Order';
    }
  }

  renderer.render(scene, camera);
}

animate();