import * as THREE from 'three';
import { RECIPES, CUSTOMERS, SHOP_ITEMS, MISSION_POOL } from './data.js';
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
  lastMissionDate: '',
  dailyMissionIds: [],
  missions: {},
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

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function checkDailyRefresh() {
  const today = getTodayKey();
  if (
    save.lastMissionDate === today &&
    Array.isArray(save.dailyMissionIds) &&
    save.dailyMissionIds.length === 4
  ) {
    return;
  }
  const shuffled = [...MISSION_POOL].sort(() => Math.random() - 0.5);
  save.dailyMissionIds = shuffled.slice(0, 4).map((m) => m.id);
  save.missions = {};
  save.claimedMissions = [];
  save.lastMissionDate = today;
  persist();
}

function getActiveMissions() {
  return save.dailyMissionIds
    .map((id) => MISSION_POOL.find((m) => m.id === id))
    .filter(Boolean);
}

checkDailyRefresh();

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

scene.add(new THREE.HemisphereLight(0xfff9f0, 0xb89b7a, 0.9));

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

const ownedSet = new Set(save.owned);
cafe.updateDecor(ownedSet);
cafe.updateTheme(save.equippedTheme);
capy.applyCosmetics(save.equippedHat, save.hasGlasses);

// --- Challenge & Gameplay State ---
let heldRecipe = null;
let moveTarget = null;
let pendingInteract = null;
let spawnTimer = 1.6;
let currentShopTab = 'decor';
let activePrep = null;

let combo = 0;
let rushCooldown = 40; // seconds until Rush Hour
let rushActive = 0;    // > 0 means Rush Hour active

const stationUses = { blender: 0, espresso: 0, bakery: 0 };
const stationNeedsRefill = { blender: false, espresso: false, bakery: false };

const keys = new Set();
const joyVec = { x: 0, y: 0 };

// --- DOM & Dynamic Challenge Badges ---
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

const hudLeft = document.querySelector('.hud-left');
const comboBadge = document.createElement('div');
comboBadge.className = 'pill hidden';
comboBadge.style.background = '#fff0e6';
comboBadge.style.borderColor = '#f08a5d';
hudLeft.appendChild(comboBadge);

const rushBadge = document.createElement('div');
rushBadge.className = 'pill hidden';
rushBadge.style.background = '#ffe5e5';
rushBadge.style.borderColor = '#e53935';
rushBadge.style.color = '#b71c1c';
hudLeft.appendChild(rushBadge);

let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 2600);
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
    showToast(`🎉 Level ${save.level}! +1 💎 (Double orders unlocked!)`);
  }
}

function addMissionProgress(type, amount = 1) {
  save.missions[type] = (save.missions[type] || 0) + amount;
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

  if (combo >= 2) {
    comboBadge.classList.remove('hidden');
    comboBadge.textContent = `🔥 Combo x${combo}`;
  } else {
    comboBadge.classList.add('hidden');
  }

  if (rushActive > 0) {
    rushBadge.classList.remove('hidden');
    rushBadge.textContent = `⚡ RUSH HOUR ${Math.ceil(rushActive)}s (+50% 🪙)`;
  } else {
    rushBadge.classList.add('hidden');
  }

  const anyClaimable = getActiveMissions().some(
    (m) => !save.claimedMissions.includes(m.id) && (save.missions[m.type] || 0) >= m.target
  );
  missionDot.classList.toggle('hidden', !anyClaimable);
  persist();
}

// --- Customer AI ---
function pickRandomCustomerDef() {
  if (Math.random() < 0.1) return CUSTOMERS.find((c) => c.rare);
  const normal = CUSTOMERS.filter((c) => !c.rare);
  return normal[Math.floor(Math.random() * normal.length)];
}

function pickOrdersFor(def) {
  const keysList = Object.keys(RECIPES);
  const first =
    Math.random() < 0.6 && RECIPES[def.favorite]
      ? RECIPES[def.favorite]
      : RECIPES[keysList[Math.floor(Math.random() * keysList.length)]];

  // Double orders unlock at Level 2+ (higher chance as level rises)
  const doubleChance = save.level >= 2 ? Math.min(0.55, 0.22 + (save.level - 2) * 0.08) : 0;
  if (Math.random() < doubleChance) {
    const others = keysList.filter((k) => k !== first.id);
    const second = RECIPES[others[Math.floor(Math.random() * others.length)]];
    return [first, second];
  }
  return [first];
}

function trySpawnCustomer() {
  const freeTables = cafe.tables.filter((t) => t.unlocked && t.state === 'empty' && !t.customer);
  if (freeTables.length === 0) return;

  const table = freeTables[Math.floor(Math.random() * freeTables.length)];
  const def = pickRandomCustomerDef();
  const orders = pickOrdersFor(def);
  const mesh = createAnimalCustomer(def);
  mesh.group.position.set(cafe.doorPos.x, 0, cafe.doorPos.z);
  scene.add(mesh.group);

  if (def.rare) {
    addMissionProgress('rare', 1);
    showToast('✨ Rare Golden Bunny! Big reward awaits!');
    audio.playSuccess();
  } else {
    audio.playDing();
  }

  // Personality patience + slight scaling by level + extra time if double order
  const levelTighten = Math.max(0.75, 1 - (save.level - 1) * 0.03);
  const basePatience = (def.patience || 45) * levelTighten + (orders.length > 1 ? 16 : 0);

  table.customer = {
    def,
    orders,
    totalItems: orders.length,
    mesh,
    phase: 'toSeat',
    patience: basePatience,
    maxPatience: basePatience,
    eatTimer: 3.0,
  };
  table.state = 'reserved';
}

function updateRushHour(dt) {
  if (rushActive > 0) {
    rushActive -= dt;
    if (rushActive <= 0) {
      rushActive = 0;
      rushCooldown = 65;
      showToast('☕ Rush Hour ended! Great job, Barista!');
    }
    rushBadge.textContent = `⚡ RUSH HOUR ${Math.ceil(rushActive)}s (+50% 🪙)`;
    rushBadge.classList.toggle('hidden', rushActive <= 0);
  } else {
    rushCooldown -= dt;
    if (rushCooldown <= 0) {
      rushActive = 25;
      audio.playSuccess();
      showToast('⚡ LUNCH RUSH HOUR! Fast spawns & +50% coins for 25s!');
      updateHUD();
    }
  }
}

function updateCustomers(dt) {
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    trySpawnCustomer();
    spawnTimer = rushActive > 0 ? 1.8 + Math.random() * 1.4 : 4.0 + Math.random() * 2.5;
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
        c.mesh.group.rotation.y = 0;
        c.phase = 'waiting';
        t.state = 'waiting';
      } else {
        const step = Math.min(dist, dt * 2.5);
        c.mesh.group.position.x += (dx / dist) * step;
        c.mesh.group.position.z += (dz / dist) * step;
        c.mesh.group.rotation.y = Math.atan2(dx, dz);
        c.mesh.update(dt, 'walking');
      }
    } else if (c.phase === 'waiting') {
      c.patience -= dt;
      c.mesh.update(dt, 'sitting');
      if (c.patience <= 0) {
        combo = 0;
        showToast(`${c.def.name} left! Combo reset 😢`);
        c.phase = 'leaving';
        t.state = 'empty';
        updateHUD();
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
        const step = Math.min(dist, dt * 2.8);
        c.mesh.group.position.x += (dx / dist) * step;
        c.mesh.group.position.z += (dz / dist) * step;
        c.mesh.group.rotation.y = Math.atan2(dx, dz);
        c.mesh.update(dt, 'walking');
      }
    }
  }
}

// --- Interactions ---
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
    if (d < 1.55) return { type: 'station', ref: s };
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
      save.coins += 5;
      addMissionProgress('cleaned', 1);
      addXP(8);
      audio.playClean();
      spawnFloatText(t.x, 1.3, t.z, '+5 🪙 Clean!');
      updateHUD();
      return;
    }

    if (t.state === 'waiting' && t.customer) {
      const c = t.customer;
      const wantedText = c.orders.map((o) => `${o.emoji} ${o.name}`).join(' + ');
      if (!heldRecipe) {
        showToast(`${c.def.name} (${c.def.personality}) wants ${wantedText}`);
        return;
      }

      const matchIdx = c.orders.findIndex((o) => o.id === heldRecipe.id);
      if (matchIdx === -1) {
        combo = 0;
        audio.playWrong();
        showToast(`Wrong item! Combo reset. Wants ${wantedText}`);
        updateHUD();
        return;
      }

      const servedItem = c.orders.splice(matchIdx, 1)[0];
      heldRecipe = null;
      capy.setHeldItem(null);

      // Still waiting for second item in a double order
      if (c.orders.length > 0) {
        c.patience = Math.min(c.maxPatience, c.patience + 10);
        const partialCoins = servedItem.price;
        save.coins += partialCoins;
        addXP(servedItem.xp);
        audio.playCoin();
        spawnFloatText(t.x, 1.5, t.z, `+${partialCoins} 🪙 (1/2)`);
        updateHUD();
        return;
      }

      // Order fully completed!
      const isFast = c.patience > c.maxPatience * 0.45;
      if (isFast) {
        combo += 1;
        addMissionProgress('fast', 1);
        if (combo >= 3) addMissionProgress('combo3', 1);
      } else {
        combo = 0;
      }

      const comboBonus = Math.min(combo, 6) * 3;
      const decorBonus = (ownedSet.has('plants') ? 2 : 0) + (ownedSet.has('lights') ? 2 : 0);
      const rareBonus = c.def.rare ? 25 : 0;
      const doubleBonus = c.totalItems > 1 ? 10 : 0;
      let total = servedItem.price + comboBonus + decorBonus + rareBonus + doubleBonus;
      if (rushActive > 0) total = Math.round(total * 1.5);

      save.coins += total;
      addMissionProgress('served', 1);
      addXP(servedItem.xp + (c.totalItems > 1 ? 8 : 0));

      t.servedMesh.material.color.setHex(servedItem.color);
      t.servedMesh.visible = true;
      t.state = 'eating';
      c.phase = 'eating';

      audio.playCoin();
      const tag = `${combo >= 2 ? ` 🔥x${combo}` : ''}${rushActive > 0 ? ' ⚡' : ''}`;
      spawnFloatText(t.x, 1.5, t.z, `+${total} 🪙${tag}`);
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

    if (stationNeedsRefill[s.id]) {
      stationNeedsRefill[s.id] = false;
      audio.playClean();
      spawnFloatText(s.x, 1.7, s.z, '📦 Refilled!');
      showToast(`${s.name} restocked! Ready to prep.`);
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
  const wantedIds = new Set();
  cafe.tables
    .filter((t) => t.state === 'waiting' && t.customer)
    .forEach((t) => t.customer.orders.forEach((o) => wantedIds.add(o.id)));

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
          addMissionProgress(recipe.id, 1);

          stationUses[recipe.station] += 1;
          if (stationUses[recipe.station] % 5 === 0) {
            stationNeedsRefill[recipe.station] = true;
          }

          audio.playSuccess();
          prepModal.classList.add('hidden');
          activePrep = null;
          showToast(`Prepared ${recipe.emoji} ${recipe.name}!`);
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

    row.querySelector('button').onclick = () => {
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

document.getElementById('btn-shop').onclick = () => { renderShop(); shopModal.classList.remove('hidden'); };
document.getElementById('shop-close').onclick = () => shopModal.classList.add('hidden');
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentShopTab = btn.dataset.tab;
    renderShop();
  };
});

// --- Daily Missions Modal ---
const missionsModal = document.getElementById('missions-modal');
const missionsList = document.getElementById('missions-list');

function renderMissions() {
  checkDailyRefresh();
  missionsList.innerHTML = '';
  for (const m of getActiveMissions()) {
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

document.getElementById('btn-missions').onclick = () => { renderMissions(); missionsModal.classList.remove('hidden'); };
document.getElementById('missions-close').onclick = () => missionsModal.classList.add('hidden');
document.getElementById('btn-mute').onclick = (e) => {
  const m = audio.toggleMute();
  e.currentTarget.textContent = m ? '🔇' : '🔊';
};

// --- Controls ---
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

const joyZone = document.getElementById('joystick-zone');
const joyKnob = document.getElementById('joystick-knob');
let joyActive = false;

function updateJoystick(clientX, clientY) {
  const rect = joyZone.getBoundingClientRect();
  let dx = clientX - (rect.left + rect.width / 2);
  let dy = clientY - (rect.top + rect.height / 2);
  const maxR = 32;
  const dist = Math.hypot(dx, dy);
  if (dist > maxR) { dx = (dx / dist) * maxR; dy = (dy / dist) * maxR; }
  joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  joyVec.x = dx / maxR;
  joyVec.y = dy / maxR;
  moveTarget = null;
  pendingInteract = null;
}

joyZone.addEventListener('pointerdown', (e) => { joyActive = true; joyZone.setPointerCapture(e.pointerId); updateJoystick(e.clientX, e.clientY); });
joyZone.addEventListener('pointermove', (e) => { if (joyActive) updateJoystick(e.clientX, e.clientY); });
joyZone.addEventListener('pointerup', () => { joyActive = false; joyKnob.style.transform = 'translate(0, 0)'; joyVec.x = 0; joyVec.y = 0; });

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
canvas.addEventListener('pointerdown', (e) => {
  audio.init();
  const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(groundPlane, hit)) {
    moveTarget = { x: THREE.MathUtils.clamp(hit.x, -5.8, 5.8), z: THREE.MathUtils.clamp(hit.z, -2.5, 4.4) };
    pendingInteract = null;
  }
});

function walkToAndInteract(x, z, interactTarget) {
  moveTarget = { x, z };
  pendingInteract = interactTarget;
}

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

const tableBubbles = new Map();
const stationTags = new Map();

function syncWorldOverlays() {
  const neededStations = new Set();
  if (!heldRecipe) {
    cafe.tables
      .filter((t) => t.state === 'waiting' && t.customer)
      .forEach((t) => t.customer.orders.forEach((o) => neededStations.add(o.station)));
  }

  for (const s of cafe.stations) {
    let tag = stationTags.get(s.id);
    if (!tag) {
      tag = document.createElement('div');
      tag.className = 'station-tag';
      tag.onclick = () => walkToAndInteract(s.interactX, s.interactZ, { type: 'station', ref: s });
      overlaysEl.appendChild(tag);
      stationTags.set(s.id, tag);
    }
    const refill = !!stationNeedsRefill[s.id];
    tag.textContent = refill ? `📦 Refill ${s.name}!` : `${s.emoji} ${s.name}`;
    const pos = projectToScreen(s.x, 1.85, s.z);
    tag.style.left = `${pos.x}px`;
    tag.style.top = `${pos.y}px`;
    tag.classList.toggle('highlight', refill || neededStations.has(s.id));
  }

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
      const match = heldRecipe && c.orders.some((o) => o.id === heldRecipe.id);
      const barColor = pct > 50 ? '#7bc47f' : pct > 25 ? '#f6c453' : '#e57373';
      const orderIcons = c.orders.map((o) => o.emoji).join(' + ');
      bubble.className = `world-bubble ${match ? 'ready-match' : ''}`;
      bubble.innerHTML = `
        <div class="bubble-top">
          <span class="bubble-emoji">${orderIcons}</span>
          <span>${c.def.name}</span>
        </div>
        <div class="patience-track">
          <div class="patience-fill" style="width:${pct}%;background:${barColor}"></div>
        </div>
      `;
    }
  }
}

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
  let vx = 0, vz = 0;

  if (keys.has('w') || keys.has('arrowup')) vz -= 1;
  if (keys.has('s') || keys.has('arrowdown')) vz += 1;
  if (keys.has('a') || keys.has('arrowleft')) vx -= 1;
  if (keys.has('d') || keys.has('arrowright')) vx += 1;
  if (Math.abs(joyVec.x) > 0.1 || Math.abs(joyVec.y) > 0.1) { vx = joyVec.x; vz = joyVec.y; }

  let isWalking = false;
  if (vx !== 0 || vz !== 0) {
    moveTarget = null;
    pendingInteract = null;
    const len = Math.hypot(vx, vz);
    vx /= len; vz /= len;
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
      if (pendingInteract) { handleInteract(pendingInteract); pendingInteract = null; }
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
  updateRushHour(dt);
  updateCustomers(dt);
  syncWorldOverlays();

  const near = getNearestInteractable();
  if (!near) {
    actionBtn.classList.add('idle');
    actionBtnLabel.textContent = 'Walk to Table/Bar';
  } else {
    actionBtn.classList.remove('idle');
    if (near.type === 'station') {
      if (stationNeedsRefill[near.ref.id]) {
        actionBtnLabel.textContent = '📦 Refill Station';
      } else {
        actionBtnLabel.textContent = near.ref.id === 'sink' ? '🧼 Use Sink' : `${near.ref.emoji} Cook/Brew`;
      }
    } else if (near.ref.state === 'dirty') {
      actionBtnLabel.textContent = '🧼 Clean Table';
    } else {
      actionBtnLabel.textContent = heldRecipe ? `Serve ${heldRecipe.emoji}` : 'Check Order';
    }
  }

  renderer.render(scene, camera);
}

animate();