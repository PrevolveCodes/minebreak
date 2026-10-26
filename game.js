import * as THREE from "three";
import JSZip from "jszip";

const gameRoot = document.querySelector("#game");
const startScreen = document.querySelector("#start-screen");
const playButton = document.querySelector("#play-button");
const hud = document.querySelector("#hud");
const crosshair = document.querySelector("#crosshair");
const statusText = document.querySelector("#status");
const coordsText = document.querySelector("#coords");
const textureZipInput = document.querySelector("#texture-zip");
const loadTexturesButton = document.querySelector("#load-textures-button");
const textureStatus = document.querySelector("#texture-status");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8bc8f0);
scene.fog = new THREE.Fog(0x8bc8f0, 28, 76);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 180);
camera.rotation.order = "YXZ";
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Shadow maps are expensive on many integrated GPUs.
renderer.shadowMap.enabled = false;
gameRoot.appendChild(renderer.domElement);

const ambientLight = new THREE.HemisphereLight(0xd9efff, 0x75634d, 1.65);
scene.add(ambientLight);
const sun = new THREE.DirectionalLight(0xfff5e6, 1.35);
sun.position.set(-25, 40, 20);
sun.castShadow = false;
scene.add(sun);

const WORLD_SIZE = 40;
const WORLD_HALF = WORLD_SIZE / 2;
const MAX_REACH = 6;
const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.30;
const BLOCKS = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, WOOD: 4, LEAVES: 5, PLANKS: 6, COAL_ORE: 7, IRON_ORE: 8 };
const blockNames = ["Grass", "Dirt", "Stone", "Wood", "Planks", "Coal Ore", "Iron Ore"];
const hotbarTypes = [BLOCKS.GRASS, BLOCKS.DIRT, BLOCKS.STONE, BLOCKS.WOOD, BLOCKS.PLANKS, BLOCKS.COAL_ORE, BLOCKS.IRON_ORE];
const inventory = [0, 0, 0, 0, 0, 0, 0];
const extraInventory = { [BLOCKS.PLANKS]: 0, [BLOCKS.COAL_ORE]: 0, [BLOCKS.IRON_ORE]: 0 };
let health = 20, hunger = 20, survivalClock = 0, autosaveClock = 0;
const creatures = [];
const MAX_STACK_SIZE = 64;
const world = new Map();
const terrainMeshes = [];
let selectedSlot = 0;
let yaw = 0;
let pitch = 0;
let locked = false;
let started = false;
let lastTime = performance.now();
let velocityY = 0;
let onGround = false;
const keys = new Set();

function keyOf(x, y, z) { return x + "," + y + "," + z; }
function getBlock(x, y, z) {
  if (x < -WORLD_HALF || x >= WORLD_HALF || z < -WORLD_HALF || z >= WORLD_HALF || y < 0) return BLOCKS.AIR;
  return world.get(keyOf(x, y, z)) || BLOCKS.AIR;
}
function setBlock(x, y, z, type) {
  if (x < -WORLD_HALF || x >= WORLD_HALF || z < -WORLD_HALF || z >= WORLD_HALF || y < 0 || y > 40) return;
  const key = keyOf(x, y, z);
  if (type === BLOCKS.AIR) world.delete(key);
  else world.set(key, type);
}

function makePixelTexture(base, accent, seed = 1, style = "noise") {
  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  let s = seed >>> 0;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

  if (style === "grassTop") {
    for (let i = 0; i < 95; i++) {
      ctx.fillStyle = rand() > 0.5 ? "#4b9133" : "#72b847";
      ctx.fillRect(Math.floor(rand() * 16), Math.floor(rand() * 16), 1 + Math.floor(rand() * 2), 1 + Math.floor(rand() * 2));
    }
  } else if (style === "grassSide") {
    ctx.fillStyle = "#765035";
    ctx.fillRect(0, 3, 16, 13);
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = ["#69452d", "#805331", "#8c6039"][Math.floor(rand() * 3)];
      ctx.fillRect(Math.floor(rand() * 16), 4 + Math.floor(rand() * 12), 1 + Math.floor(rand() * 2), 1);
    }
    ctx.fillStyle = "#4d9133";
    ctx.fillRect(0, 0, 16, 3);
    for (let i = 0; i < 28; i++) {
      ctx.fillStyle = rand() > 0.5 ? "#6caf40" : "#387a28";
      ctx.fillRect(Math.floor(rand() * 16), Math.floor(rand() * 3), 1, 1);
    }
    for (let i = 0; i < 13; i++) {
      ctx.fillStyle = "#3d7d2b";
      ctx.fillRect(Math.floor(rand() * 16), 3, 1, 1);
    }
  } else if (style === "woodSide") {
    for (let i = 0; i < 65; i++) {
      ctx.fillStyle = rand() > 0.5 ? "#80552e" : "#b1854e";
      ctx.fillRect(Math.floor(rand() * 16), Math.floor(rand() * 16), 1, 2 + Math.floor(rand() * 5));
    }
    ctx.fillStyle = "#694522";
    for (let x = 2; x < 16; x += 5) ctx.fillRect(x, 0, 1, 16);
  } else if (style === "woodTop") {
    ctx.fillStyle = "#684324";
    ctx.fillRect(1, 1, 14, 14);
    ctx.fillStyle = "#c49a61";
    ctx.fillRect(3, 3, 10, 10);
    ctx.fillStyle = "#8c6237";
    ctx.fillRect(5, 5, 6, 6);
    ctx.fillStyle = "#d0a873";
    ctx.fillRect(7, 7, 2, 2);
  } else {
    for (let i = 0; i < 75; i++) {
      ctx.globalAlpha = 0.25 + rand() * 0.4;
      ctx.fillStyle = accent;
      ctx.fillRect(Math.floor(rand() * 16), Math.floor(rand() * 16), 1 + Math.floor(rand() * 2), 1 + Math.floor(rand() * 2));
    }
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeMaterial(texture) {
  return new THREE.MeshLambertMaterial({ map: texture });
}
const grassTopMat = makeMaterial(makePixelTexture("#59a83d", "#a3d85c", 12, "grassTop"));
const grassSideMat = makeMaterial(makePixelTexture("#59a83d", "#a3d85c", 13, "grassSide"));
const dirtMat = makeMaterial(makePixelTexture("#805331", "#c08a50", 24));
const stoneMat = makeMaterial(makePixelTexture("#858a8b", "#c0c3c0", 31));
const woodSideMat = makeMaterial(makePixelTexture("#9b6a39", "#d0a05c", 42, "woodSide"));
const woodTopMat = makeMaterial(makePixelTexture("#9b6a39", "#d0a05c", 43, "woodTop"));
const leavesMat = makeMaterial(makePixelTexture("#326b2c", "#64a83d", 51));
const planksMat = makeMaterial(makePixelTexture("#b58a54", "#e0bd7c", 61, "woodSide"));
const coalOreMat = makeMaterial(makePixelTexture("#777b7c", "#272a2b", 71));
const ironOreMat = makeMaterial(makePixelTexture("#858a8b", "#c7a78c", 81));
const materials = {
  [BLOCKS.GRASS]: { side: grassSideMat, top: grassTopMat, bottom: dirtMat },
  [BLOCKS.DIRT]: { all: dirtMat },
  [BLOCKS.STONE]: { all: stoneMat },
  [BLOCKS.WOOD]: { side: woodSideMat, top: woodTopMat, bottom: woodTopMat },
  [BLOCKS.LEAVES]: { all: leavesMat },
  [BLOCKS.PLANKS]: { all: planksMat },
  [BLOCKS.COAL_ORE]: { all: coalOreMat },
  [BLOCKS.IRON_ORE]: { all: ironOreMat }
};


async function loadResourcePackZip(file) {
  if (!file) throw new Error("Choose a resource-pack ZIP file first.");
  if (!file.name.toLowerCase().endsWith(".zip")) throw new Error("Please choose a .zip file.");
  textureStatus.textContent = "Reading ZIP…";
  const zip = await JSZip.loadAsync(file);
  const paths = Object.keys(zip.files).filter(path => !zip.files[path].dir && /\.png$/i.test(path));
  // Prefer block textures specifically; never accidentally use an item icon with the same filename.
  const blockPaths = paths.filter(path => /(?:^|\/)assets\/minecraft\/textures\/block\//i.test(path));
  const texturePaths = blockPaths.length ? blockPaths : paths.filter(path => /(?:^|\/)textures\/block\//i.test(path));
  const findTexture = (...names) => {
    const source = texturePaths.length ? texturePaths : paths;
    for (const name of names) {
      const exact = source.find(path => path.toLowerCase().endsWith("/" + name.toLowerCase()));
      if (exact) return exact;
    }
    return undefined;
  };
  const entityPaths = paths.filter(path => /(?:^|\/)assets\/minecraft\/textures\/entity\//i.test(path));
  const findEntityTexture = (kind, ...names) => {
    const normalized = path => path.toLowerCase().replace(/\\/g, "/");
    for (const name of names) {
      const exact = entityPaths.find(path => normalized(path).endsWith("/" + name.toLowerCase()));
      if (exact) return exact;
    }
    // Recent Minecraft packs place variant skins in folders such as
    // textures/entity/cow/temperate.png or textures/entity/pig/temperate.png.
    const folderMatch = entityPaths.find(path => {
      const p = normalized(path);
      return p.includes("/entity/" + kind + "/") && p.endsWith(".png");
    });
    if (folderMatch) return folderMatch;
    // Some template ZIPs omit the assets/minecraft prefix.
    return paths.find(path => {
      const p = normalized(path);
      return p.includes("/textures/entity/" + kind + "/") && p.endsWith(".png");
    });
  };
  const textureLoader = new THREE.TextureLoader();
  async function decodeTexture(path) {
    const blob = await zip.file(path).async("blob");
    const url = URL.createObjectURL(blob);
    try {
      const texture = await new Promise((resolve, reject) => textureLoader.load(url, resolve, undefined, reject));
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      return texture;
    } finally { URL.revokeObjectURL(url); }
  }
  async function loadOne(names, material, transparent = false, tint = 0xffffff) {
    const path = findTexture(...names);
    if (!path) return { ok: false, reason: "not found" };
    const blob = await zip.file(path).async("blob");
    const url = URL.createObjectURL(blob);
    try {
      const texture = await new Promise((resolve, reject) => {
        textureLoader.load(url, resolve, undefined, reject);
      });
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      if (material.map) material.map.dispose();
      material.map = texture;
      // Vanilla grass-top and leaf textures are grayscale tint masks; apply their biome colors.
      material.color.setHex(tint);
      material.transparent = transparent;
      // Minecraft leaves are cutout textures: discard transparent pixels and render both sides.
      material.alphaTest = transparent ? 0.5 : 0;
      material.side = transparent ? THREE.DoubleSide : THREE.FrontSide;
      material.depthWrite = true;
      material.needsUpdate = true;
      return { ok: true, path };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const jobs = [
    ["grass top", () => loadOne(["grass_block_top.png", "grass_top.png"], grassTopMat, false, 0x80bd63)],
    ["grass side", () => loadOne(["grass_block_side.png", "grass_side.png"], grassSideMat)],
    ["dirt", () => loadOne(["dirt.png"], dirtMat)],
    ["stone", () => loadOne(["stone.png"], stoneMat)],
    ["oak log side", () => loadOne(["oak_log.png", "oak_wood.png", "log_oak.png"], woodSideMat)],
    ["oak log top", () => loadOne(["oak_log_top.png", "oak_wood_top.png", "log_oak_top.png"], woodTopMat)],
    ["oak leaves", () => loadOne(["oak_leaves.png", "leaves_oak.png"], leavesMat, true, 0x78b85a)],
    ["oak planks", () => loadOne(["oak_planks.png", "planks_oak.png"], planksMat)],
    ["coal ore", () => loadOne(["coal_ore.png"], coalOreMat)],
    ["iron ore", () => loadOne(["iron_ore.png"], ironOreMat)]
  ];
  const results = await Promise.all(jobs.map(async ([name, load]) => {
    try { return { name, ...(await load()) }; }
    catch (error) { console.warn("Texture failed to load:", name, error); return { name, ok: false, reason: "failed to decode" }; }
  }));
  const loaded = results.filter(result => result.ok).length;
  const missing = results.filter(result => !result.ok).map(result => result.name);
  const mobResults = [];
  // Newer Minecraft resource packs split cow and pig skins into biome variants.
  // Try both modern variant filenames and older single-texture filenames.
  const mobFiles = [
    ["cow", ["cow/cow_temperate.png", "cow/cow_warm.png", "cow/cow_cold.png", "cow/cow_temperate_baby.png", "cow/cow.png", "cow.png"]],
    ["pig", ["pig/pig_temperate.png", "pig/pig_warm.png", "pig/pig_cold.png", "pig/pig_temperate_baby.png", "pig/pig.png", "pig.png"]],
    ["zombie", ["zombie.png", "zombie/zombie.png"]]
  ];
  for (const [kind, names] of mobFiles) {
    const path = findEntityTexture(kind, ...names);
    if (!path) { mobResults.push(kind + ": missing"); continue; }
    try {
      const texture = await decodeTexture(path);
      applyEntityTexture(kind, texture);
      mobResults.push(kind + ": loaded");
    } catch (error) {
      console.warn("Entity texture failed:", kind, error);
      mobResults.push(kind + ": failed");
    }
  }
  if (loaded === 0) {
    throw new Error("No block textures could be loaded. Check that the ZIP contains PNGs in assets/minecraft/textures/block/.");
  }
  textureStatus.textContent = "Loaded " + loaded + " of " + jobs.length + " block textures. Entity textures — " + mobResults.join(", ") +
    (missing.length ? ". Default blocks kept for: " + missing.join(", ") + "." : ".");
}

loadTexturesButton.addEventListener("click", async () => {
  loadTexturesButton.disabled = true;
  try {
    await loadResourcePackZip(textureZipInput.files[0]);
  } catch (error) {
    console.error("Minebreak resource pack error:", error);
    textureStatus.textContent = error?.message || "Could not load that ZIP.";
  } finally {
    loadTexturesButton.disabled = false;
  }
});

function terrainHeight(x, z) {
  const hills = Math.sin(x * 0.22) * 1.7 + Math.cos(z * 0.19) * 1.5 + Math.sin((x + z) * 0.13) * 1.3;
  return Math.max(3, Math.min(11, Math.floor(6 + hills)));
}

function generateWorld() {
  for (let x = -WORLD_HALF; x < WORLD_HALF; x++) {
    for (let z = -WORLD_HALF; z < WORLD_HALF; z++) {
      const top = terrainHeight(x, z);
      for (let y = 0; y <= top; y++) {
        let type = BLOCKS.STONE;
        if (y === top) type = BLOCKS.GRASS;
        else if (y >= top - 2) type = BLOCKS.DIRT;
        setBlock(x, y, z, type);
      }
    }
  }
  // Small underground ore deposits. The first version uses exposed ore blocks inside stone.
  let oreSeed = 9281;
  const randomOre = () => { oreSeed = (oreSeed * 1664525 + 1013904223) >>> 0; return oreSeed / 4294967296; };
  for (let x = -WORLD_HALF + 2; x < WORLD_HALF - 2; x++) for (let z = -WORLD_HALF + 2; z < WORLD_HALF - 2; z++) {
    for (let y = 1; y <= 4; y++) {
      if (getBlock(x, y, z) === BLOCKS.STONE && randomOre() < 0.018) setBlock(x, y, z, y <= 2 && randomOre() < 0.35 ? BLOCKS.IRON_ORE : BLOCKS.COAL_ORE);
      // Simple one-block cave pockets in the lower layers.
      if (y <= 3 && randomOre() < 0.008) setBlock(x, y, z, BLOCKS.AIR);
    }
  }
  // A few simple trees make the first world feel less empty.
  const trees = [[-8, -7], [7, -9], [10, 6], [-12, 9], [2, 13], [14, -1]];
  for (const [x, z] of trees) {
    const ground = terrainHeight(x, z);
    for (let y = ground + 1; y <= ground + 4; y++) setBlock(x, y, z, BLOCKS.WOOD);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      for (let dy = 3; dy <= 5; dy++) {
        if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy - 4) <= 4 && getBlock(x + dx, ground + dy, z + dz) === BLOCKS.AIR) {
          // Leaves use the grass texture temporarily until leaf blocks are added.
          setBlock(x + dx, ground + dy, z + dz, BLOCKS.LEAVES);
        }
      }
    }
  }
}

const faceDefs = [
  { n: [1,0,0], c: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },
  { n: [-1,0,0], c: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]] },
  { n: [0,1,0], c: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },
  { n: [0,-1,0], c: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
  { n: [0,0,1], c: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]] },
  { n: [0,0,-1], c: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] }
];

function rebuildTerrain() {
  for (const mesh of terrainMeshes) {
    scene.remove(mesh);
    mesh.geometry.dispose();
  }
  terrainMeshes.length = 0;
  const geometryData = new Map();
  for (const type of [BLOCKS.GRASS, BLOCKS.DIRT, BLOCKS.STONE, BLOCKS.WOOD, BLOCKS.LEAVES, BLOCKS.PLANKS, BLOCKS.COAL_ORE, BLOCKS.IRON_ORE]) geometryData.set(type, { positions: [], normals: [], uvs: [], indices: [], groups: [] });
  for (const [key, type] of world) {
    const [x, y, z] = key.split(",").map(Number);
    const data = geometryData.get(type);
    if (!data) continue;
    for (let faceIndex = 0; faceIndex < faceDefs.length; faceIndex++) {
      const face = faceDefs[faceIndex];
      const [nx, ny, nz] = face.n;
      const neighborType = getBlock(x + nx, y + ny, z + nz);
      // Leaves have transparent cutouts, so keep neighboring log/solid faces visible through them.
      if (neighborType !== BLOCKS.AIR && !(neighborType === BLOCKS.LEAVES && type !== BLOCKS.LEAVES)) continue;
      const start = data.positions.length / 3;
      for (let i = 0; i < 4; i++) {
        const c = face.c[i];
        data.positions.push(x + c[0], y + c[1], z + c[2]);
        data.normals.push(nx, ny, nz);
      }
      data.uvs.push(0,0, 0,1, 1,1, 1,0);
      const materialIndex = type === BLOCKS.GRASS ? (faceIndex === 2 ? 1 : faceIndex === 3 ? 2 : 0) : type === BLOCKS.WOOD ? ((faceIndex === 2 || faceIndex === 3) ? 1 : 0) : 0;
      data.groups.push({ start: data.indices.length, count: 6, materialIndex });
      data.indices.push(start, start+1, start+2, start, start+2, start+3);
    }
  }
  for (const [type, data] of geometryData) {
    if (!data.positions.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(data.normals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(data.uvs, 2));
    geometry.setIndex(data.indices);
    for (const group of data.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
    geometry.computeBoundingSphere();
    const blockMaterials = materials[type];
    const meshMaterials = blockMaterials.all ? [blockMaterials.all] : [blockMaterials.side, blockMaterials.top, blockMaterials.bottom];
    const mesh = new THREE.Mesh(geometry, meshMaterials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.blockType = type;
    scene.add(mesh);
    terrainMeshes.push(mesh);
  }
}

const player = { x: 0.5, y: 15, z: 0.5 };
function isSolidAt(x, y, z) {
  return getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) !== BLOCKS.AIR;
}
function collides(px, py, pz) {
  const minX = Math.floor(px - PLAYER_RADIUS), maxX = Math.floor(px + PLAYER_RADIUS);
  const minY = Math.floor(py + 0.05), maxY = Math.floor(py + PLAYER_HEIGHT - 0.05);
  const minZ = Math.floor(pz - PLAYER_RADIUS), maxZ = Math.floor(pz + PLAYER_RADIUS);
  for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) for (let z = minZ; z <= maxZ; z++) {
    if (isSolidAt(x, y, z)) return true;
  }
  return false;
}
function findSpawn() {
  player.x = 0.5;
  player.z = 0.5;
  player.y = terrainHeight(0, 0) + 2;
  while (collides(player.x, player.y, player.z)) player.y += 1;
}
function updateCamera() {
  camera.position.set(player.x, player.y + 1.62, player.z);
  camera.rotation.set(pitch, yaw, 0, "YXZ");
}
function renderInventory() {
  document.querySelectorAll(".slot").forEach((el, i) => {
    el.classList.toggle("selected", i === selectedSlot);
    let count = el.querySelector(".stack-count");
    if (!count) {
      count = document.createElement("span");
      count.className = "stack-count";
      el.appendChild(count);
    }
    count.textContent = inventory[i] > 0 ? String(inventory[i]) : "";
    count.setAttribute("aria-label", inventory[i] + " items");
  });
}
function selectSlot(index) {
  selectedSlot = (index + hotbarTypes.length) % hotbarTypes.length;
  renderInventory();
}
document.querySelectorAll(".slot").forEach((el, i) => el.addEventListener("click", () => selectSlot(i)));
renderInventory();

function setupSurvivalUI() {
  let panel = document.querySelector("#survival-ui");
  if (panel) return;
  panel = document.createElement("div");
  panel.id = "survival-ui";
  panel.innerHTML = '<div class="survival-bars"><div>♥ <span id="health-value">20</span>/20</div><div>Food <span id="hunger-value">20</span>/20</div></div><div class="survival-actions"><button id="craft-button">Craft (E)</button><button id="save-button">Save world</button></div><div id="craft-panel" hidden><strong>Crafting</strong><button data-recipe="planks">4 Planks (1 Wood)</button><button data-recipe="wood-pick">Wooden Pickaxe (3 Planks + 2 Wood)</button><button id="close-craft">Close</button><p id="craft-message">Recipes are basic for now.</p></div>';
  hud.appendChild(panel);
  document.querySelector("#craft-button").addEventListener("click", toggleCrafting);
  document.querySelector("#save-button").addEventListener("click", saveWorld);
  document.querySelector("#close-craft").addEventListener("click", toggleCrafting);
  panel.querySelectorAll("[data-recipe]").forEach(button => button.addEventListener("click", () => craft(button.dataset.recipe)));
  updateSurvivalUI();
}
function updateSurvivalUI() {
  const h = document.querySelector("#health-value"), f = document.querySelector("#hunger-value");
  if (h) h.textContent = String(Math.max(0, Math.ceil(health)));
  if (f) f.textContent = String(Math.max(0, Math.ceil(hunger)));
}
function toggleCrafting() {
  const panel = document.querySelector("#craft-panel");
  if (panel) panel.hidden = !panel.hidden;
}
function craft(recipe) {
  const message = document.querySelector("#craft-message");
  if (recipe === "planks") {
    const woodSlot = hotbarTypes.indexOf(BLOCKS.WOOD), plankSlot = hotbarTypes.indexOf(BLOCKS.PLANKS);
    if (woodSlot < 0 || inventory[woodSlot] < 1) { message.textContent = "You need 1 Wood in your hotbar."; return; }
    if (inventory[plankSlot] > MAX_STACK_SIZE - 4) { message.textContent = "Your Planks stack is full."; return; }
    inventory[woodSlot]--;
    inventory[plankSlot] += 4;
    message.textContent = "Crafted 4 Planks.";
  } else if (recipe === "wood-pick") {
    const woodSlot = hotbarTypes.indexOf(BLOCKS.WOOD);
    const plankSlot = hotbarTypes.indexOf(BLOCKS.PLANKS);
    if (inventory[plankSlot] < 3 || woodSlot < 0 || inventory[woodSlot] < 2) { message.textContent = "Need 3 Planks and 2 Wood."; return; }
    inventory[plankSlot] -= 3;
    inventory[woodSlot] -= 2;
    message.textContent = "Crafted a wooden pickaxe! Tool mining speeds are coming in the next pass.";
  }
  renderInventory();
  updateSurvivalUI();
  saveWorld(false);
}
function saveWorld(showMessage = true) {
  try {
    const data = { version: 1, world: Array.from(world.entries()), inventory, extraInventory, player: {x:player.x,y:player.y,z:player.z}, health, hunger, survivalClock };
    localStorage.setItem("minebreak-save-v1", JSON.stringify(data));
    if (showMessage) statusText.textContent = "World saved in this browser.";
  } catch (error) { if (showMessage) statusText.textContent = "Could not save: browser storage may be full or disabled."; }
}
function loadSavedWorld() {
  try {
    const raw = localStorage.getItem("minebreak-save-v1");
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !Array.isArray(data.world)) return false;
    world.clear();
    for (const [key, type] of data.world) if (typeof key === "string" && Number.isInteger(type)) world.set(key, type);
    if (Array.isArray(data.inventory)) data.inventory.forEach((v,i) => { if (i < inventory.length) inventory[i] = Math.max(0, Math.min(MAX_STACK_SIZE, Number(v) || 0)); });
    if (data.extraInventory) for (const id of Object.keys(extraInventory)) extraInventory[id] = Math.max(0, Math.min(MAX_STACK_SIZE, Number(data.extraInventory[id]) || 0));
    if (data.player) { player.x = Number(data.player.x) || 0.5; player.y = Number(data.player.y) || 10; player.z = Number(data.player.z) || 0.5; }
    health = Math.max(1, Math.min(20, Number(data.health) || 20));
    hunger = Math.max(0, Math.min(20, Number(data.hunger) || 20));
    survivalClock = Number(data.survivalClock) || 0;
    return true;
  } catch (error) { console.warn("Minebreak save could not be loaded:", error); return false; }
}
function damagePlayer(amount) {
  health = Math.max(0, health - amount);
  if (health <= 0) {
    health = 20; hunger = Math.max(8, hunger); velocityY = 0;
    findSpawn();
    statusText.textContent = "You respawned. Your blocks stay where they were.";
  }
  updateSurvivalUI();
}
function requestLock() { renderer.domElement.requestPointerLock?.(); }
playButton.addEventListener("click", () => {
  started = true;
  startScreen.style.display = "none";
  hud.style.display = "block";
  crosshair.style.display = "block";
  requestLock();
});
renderer.domElement.addEventListener("click", () => { if (started && !locked) requestLock(); });
document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === renderer.domElement;
  if (started) {
    startScreen.style.display = locked ? "none" : "grid";
    if (!locked) {
      startScreen.querySelector("h1").textContent = "PAUSED";
      startScreen.querySelector(".eyebrow").textContent = "WORLD PAUSED";
      playButton.textContent = "Resume world";
    }
  }
});
document.addEventListener("mousemove", event => {
  if (!locked) return;
  yaw -= event.movementX * 0.0022;
  pitch -= event.movementY * 0.0022;
  pitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, pitch));
});
document.addEventListener("keydown", event => {
  keys.add(event.code);
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
  if (/^Digit[1-7]$/.test(event.code)) selectSlot(Number(event.code.slice(5)) - 1);
  if (event.code === "KeyE" && started) toggleCrafting();
});
document.addEventListener("keyup", event => keys.delete(event.code));
document.addEventListener("wheel", event => {
  if (started) selectSlot(selectedSlot + (event.deltaY > 0 ? 1 : -1));
}, { passive: true });
document.addEventListener("contextmenu", event => event.preventDefault());

const raycaster = new THREE.Raycaster();
function targetedBlock() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  raycaster.far = MAX_REACH;
  const hits = raycaster.intersectObjects(terrainMeshes, false);
  if (!hits.length) return null;
  const hit = hits[0];
  const n = hit.face.normal;
  const p = hit.point.clone().addScaledVector(n, -0.01);
  return { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z), normal: n.clone(), hit };
}
function handleMine() {
  const target = targetedBlock();
  if (!target) return;
  const type = getBlock(target.x, target.y, target.z);
  const slot = hotbarTypes.indexOf(type);
  // Each supported block type drops into its matching hotbar stack.
  if (slot !== -1 && inventory[slot] >= MAX_STACK_SIZE) return;
  setBlock(target.x, target.y, target.z, BLOCKS.AIR);
  if (slot !== -1) inventory[slot]++;
  renderInventory();
  rebuildTerrain();
}
function handlePlace() {
  const target = targetedBlock();
  if (!target) return;
  const nx = Math.round(target.normal.x), ny = Math.round(target.normal.y), nz = Math.round(target.normal.z);
  const x = target.x + nx, y = target.y + ny, z = target.z + nz;
  if (getBlock(x, y, z) !== BLOCKS.AIR) return;
  if (inventory[selectedSlot] <= 0) return;
  const minX = Math.floor(player.x - PLAYER_RADIUS), maxX = Math.floor(player.x + PLAYER_RADIUS);
  const minY = Math.floor(player.y), maxY = Math.floor(player.y + PLAYER_HEIGHT);
  const minZ = Math.floor(player.z - PLAYER_RADIUS), maxZ = Math.floor(player.z + PLAYER_RADIUS);
  if (x >= minX && x <= maxX && y >= minY && y <= maxY && z >= minZ && z <= maxZ) return;
  setBlock(x, y, z, hotbarTypes[selectedSlot]);
  inventory[selectedSlot]--;
  renderInventory();
  rebuildTerrain();
}
document.addEventListener("mousedown", event => {
  if (!locked) return;
  if (event.button === 0) { if (!hitCreature()) handleMine(); }
  if (event.button === 2) handlePlace();
});

function updatePlayer(dt) {
  const speed = (keys.has("ShiftLeft") ? 7 : 4.6) * dt;
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const move = new THREE.Vector3();
  if (keys.has("KeyW")) move.add(forward);
  if (keys.has("KeyS")) move.sub(forward);
  if (keys.has("KeyD")) move.add(right);
  if (keys.has("KeyA")) move.sub(right);
  if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed);
  const nextX = player.x + move.x;
  if (!collides(nextX, player.y, player.z)) player.x = nextX;
  const nextZ = player.z + move.z;
  if (!collides(player.x, player.y, nextZ)) player.z = nextZ;

  if (keys.has("Space") && onGround) {
    velocityY = 8.1;
    onGround = false;
  }
  velocityY -= 22 * dt;
  const nextY = player.y + velocityY * dt;
  if (!collides(player.x, nextY, player.z)) {
    player.y = nextY;
    onGround = false;
  } else {
    if (velocityY < 0) onGround = true;
    velocityY = 0;
  }
  if (player.y < -10) { damagePlayer(health); findSpawn(); }
  if (player.y < (terrainHeight(Math.floor(player.x), Math.floor(player.z)) - 3) && velocityY < -9) damagePlayer(2);
  survivalClock += dt;
  autosaveClock += dt;
  if (survivalClock > 30) { survivalClock = 0; hunger = Math.max(0, hunger - 1); if (hunger === 0) damagePlayer(1); updateSurvivalUI(); }
  if (autosaveClock > 20) { autosaveClock = 0; saveWorld(false); }
  player.x = Math.max(-WORLD_HALF + 0.5, Math.min(WORLD_HALF - 0.5, player.x));
  player.z = Math.max(-WORLD_HALF + 0.5, Math.min(WORLD_HALF - 0.5, player.z));
  updateCamera();
  coordsText.textContent = "X " + Math.floor(player.x) + " · Y " + Math.floor(player.y) + " · Z " + Math.floor(player.z);
}

const entityTextures = new Map();
const entityMaterials = new Map();

function makeEntityBox(width, height, depth, uvU, uvV, textureWidth, textureHeight, mirror = false) {
  const geometry = new THREE.BoxGeometry(width / 16, height / 16, depth / 16);
  const uv = geometry.attributes.uv;
  // Java ModelPart cuboids use this unfolded atlas: top/bottom plus four side strips.
  // BoxGeometry face order is +X, -X, +Y, -Y, +Z, -Z.
  const d = depth, w = width, h = height, u = uvU, v = uvV;
  const rects = [
    [u+d+w, v+d, d, h],       // east / +X
    [u, v+d, d, h],           // west / -X
    [u+d, v, w, d],           // top / +Y
    [u+d+w, v, w, d],         // bottom / -Y
    [u+d, v+d, w, h],         // front / +Z
    [u+d+w+d, v+d, w, h]      // back / -Z
  ];
  for (let face = 0; face < 6; face++) {
    const [rx, ry, rw, rh] = rects[face];
    for (let corner = 0; corner < 4; corner++) {
      const oldU = uv.getX(face * 4 + corner);
      const oldV = uv.getY(face * 4 + corner);
      const faceU = mirror ? 1 - oldU : oldU;
      uv.setXY(face * 4 + corner,
        (rx + faceU * rw) / textureWidth,
        1 - (ry + (1 - oldV) * rh) / textureHeight);
    }
  }
  uv.needsUpdate = true;
  return geometry;
}
function makeCreature(kind, x, z) {
  const group = new THREE.Group();
  const isCow = kind === "cow", isPig = kind === "pig", isZombie = kind === "zombie";
  const fallback = isCow ? 0x8b6548 : isPig ? 0xe6a0a0 : 0x4d9a45;
  const material = new THREE.MeshLambertMaterial({ color: fallback });
  entityMaterials.set(kind, material);
  const texSize = isZombie ? [64, 64] : [64, 32];
  const addBox = (w,h,d,px,py,pz,u,v) => {
    const mesh = new THREE.Mesh(makeEntityBox(w,h,d,u,v,texSize[0],texSize[1]), material);
    mesh.position.set(px/16,py/16,pz/16);
    mesh.castShadow = false; mesh.receiveShadow = false; group.add(mesh);
    return mesh;
  };
  if (isCow) {
    // Classic Minecraft cow proportions: compact body, large head, short legs.
    // The face points toward local -Z.
    addBox(10,8,12,0,11,0,18,4);
    addBox(8,8,6,0,15,-9,0,0);
    // Horns sit on the upper sides of the head.
    addBox(2,3,2,-5,19,-8,22,0);
    addBox(2,3,2,5,19,-8,22,0,true);
    for (const [xLeg,zLeg] of [[-3,-4],[3,-4],[-3,4],[3,4]]) addBox(4,6,4,xLeg,3,zLeg,0,16);
  } else if (isPig) {
    // Classic Minecraft pig proportions: broad body, cube-shaped head and short legs.
    addBox(10,8,14,0,11,0,28,8);
    addBox(8,8,8,0,15,-10,0,0);
    addBox(4,3,2,0,14,-15,16,16);
    for (const [xLeg,zLeg] of [[-3,-4],[3,-4],[-3,4],[3,4]]) addBox(4,6,4,xLeg,3,zLeg,0,16);
  } else {
    // Java zombie 64x64 atlas: distinct modern UV regions for each limb.
    addBox(8,12,4,0,12,0,16,16);             // torso
    addBox(8,8,8,0,22,0,0,0);                // head
    addBox(4,12,4,-6,12,0,40,16);            // right arm
    addBox(4,12,4,6,12,0,32,48,true);       // left arm (separate mirrored region)
    addBox(4,12,4,-2,6,0,0,16);              // right leg
    addBox(4,12,4,2,6,0,16,48,true);        // left leg (separate mirrored region)
  }
  group.position.set(x, terrainHeight(Math.floor(x),Math.floor(z))+1, z);
  scene.add(group);
  creatures.push({kind, group, x, z, direction:Math.random()*Math.PI*2, wander:1+Math.random()*4, hp:isZombie?8:4, speed:isZombie?1.4:0.55, lastAttack:0});
  const texture = entityTextures.get(kind);
  if (texture) applyEntityTexture(kind, texture);
}
function applyEntityTexture(kind, texture) {
  entityTextures.set(kind, texture);
  let material = entityMaterials.get(kind);
  if (!material) return;
  material.map = texture;
  material.color.setHex(0xffffff);
  material.transparent = true;
  material.alphaTest = 0.5;
  material.side = THREE.DoubleSide;
  material.needsUpdate = true;
  for (const creature of creatures) {
    if (creature.kind === kind) creature.group.traverse(object => {
      if (object.isMesh) { object.material = material; object.material.needsUpdate = true; }
    });
  }
}
function spawnCreatures() {
  for (const [x,z] of [[-5,-3],[5,4],[12,-5],[-13,4],[2,-12]]) makeCreature(Math.random() < 0.5 ? "cow" : "pig",x,z);
  makeCreature("zombie", -10, 0);
}
function updateCreatures(dt) {
  for (let i=creatures.length-1;i>=0;i--) {
    const c=creatures[i];
    const dx=player.x-c.x,dz=player.z-c.z,dist=Math.hypot(dx,dz);
    if(c.kind==="zombie" && dist<12 && dist>0.8) { c.x += dx/dist*c.speed*dt; c.z += dz/dist*c.speed*dt; }
    else { c.wander-=dt; if(c.wander<=0){c.direction=Math.random()*Math.PI*2;c.wander=2+Math.random()*5;} c.x+=Math.cos(c.direction)*c.speed*dt;c.z+=Math.sin(c.direction)*c.speed*dt; }
    c.x=Math.max(-WORLD_HALF+1,Math.min(WORLD_HALF-1,c.x)); c.z=Math.max(-WORLD_HALF+1,Math.min(WORLD_HALF-1,c.z));
    c.group.position.set(c.x,terrainHeight(Math.floor(c.x),Math.floor(c.z))+1,c.z);
    // Animals face the direction they are walking and turn as their wandering direction changes.
    // Zombies instead keep facing the player while pursuing them.
    if (c.kind === "zombie") {
      c.group.rotation.y = Math.atan2(-dx, -dz);
    } else {
      c.group.rotation.y = Math.atan2(-Math.cos(c.direction), -Math.sin(c.direction));
    }
    if(c.kind==="zombie" && dist<1.25 && performance.now()/1000-c.lastAttack>1.4){c.lastAttack=performance.now()/1000;damagePlayer(2);}
  }
}
function hitCreature() {
  const origin=camera.position.clone(), direction=new THREE.Vector3();
  camera.getWorldDirection(direction);
  let nearest=null, best=3.2;
  for(const c of creatures) {
    const center=new THREE.Vector3(c.x, c.group.position.y+0.7, c.z);
    const along=center.clone().sub(origin).dot(direction);
    if(along<0||along>best) continue;
    const closest=origin.clone().addScaledVector(direction,along);
    if(closest.distanceTo(center)<0.9){nearest=c;best=along;}
  }
  if(!nearest)return false;
  nearest.hp-=4;
  if(nearest.hp<=0){scene.remove(nearest.group);creatures.splice(creatures.indexOf(nearest),1);if(nearest.kind!=="zombie"){const s=hotbarTypes.indexOf(BLOCKS.WOOD);if(s>=0)inventory[s]=Math.min(MAX_STACK_SIZE,inventory[s]+1);renderInventory();}}
  return true;
}
function updateDayNight(dt) {
  const cycle=(performance.now()/1000/180)*Math.PI*2;
  const daylight=Math.max(0.12,(Math.sin(cycle+Math.PI/2)+1)/2);
  ambientLight.intensity=0.8+daylight*1.05;
  sun.intensity=0.35+daylight*1.15;
  scene.background.setRGB(0.08+daylight*0.46,0.12+daylight*0.58,0.19+daylight*0.72);
  scene.fog.color.copy(scene.background);
}
let creatureUpdateAccumulator = 0;
let lightingUpdateAccumulator = 0;
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastTime) / 1000, 0.04);
  lastTime = now;
  if (locked) updatePlayer(dt);
  // Mob movement and sky lighting can update less often than the rendered frame rate.
  creatureUpdateAccumulator += dt;
  if (creatureUpdateAccumulator >= 0.05) {
    updateCreatures(creatureUpdateAccumulator);
    creatureUpdateAccumulator = 0;
  }
  lightingUpdateAccumulator += dt;
  if (lightingUpdateAccumulator >= 0.1) {
    updateDayNight(lightingUpdateAccumulator);
    lightingUpdateAccumulator = 0;
  }
  renderer.render(scene, camera);
}
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
});

generateWorld();
loadSavedWorld();
rebuildTerrain();
if (!Number.isFinite(player.y) || player.y < 0) findSpawn();
updateCamera();
spawnCreatures();
setupSurvivalUI();
renderInventory();
statusText.textContent = "World ready · survival prototype · saved locally in this browser";
requestAnimationFrame(animate);
