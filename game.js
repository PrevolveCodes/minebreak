import * as THREE from "three";

const gameRoot = document.querySelector("#game");
const startScreen = document.querySelector("#start-screen");
const playButton = document.querySelector("#play-button");
const hud = document.querySelector("#hud");
const crosshair = document.querySelector("#crosshair");
const statusText = document.querySelector("#status");
const coordsText = document.querySelector("#coords");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8bc8f0);
scene.fog = new THREE.Fog(0x8bc8f0, 28, 76);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 180);
camera.rotation.order = "YXZ";
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;
gameRoot.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xd9efff, 0x65503b, 2.0));
const sun = new THREE.DirectionalLight(0xfff0d1, 2.2);
sun.position.set(-25, 40, 20);
scene.add(sun);

const WORLD_SIZE = 40;
const WORLD_HALF = WORLD_SIZE / 2;
const MAX_REACH = 6;
const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.30;
const BLOCKS = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, WOOD: 4 };
const blockNames = ["Grass", "Dirt", "Stone", "Wood"];
const hotbarTypes = [BLOCKS.GRASS, BLOCKS.DIRT, BLOCKS.STONE, BLOCKS.WOOD];
const world = new Map();
const terrainMeshes = [];
const materials = {};
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
  for (let i = 0; i < 75; i++) {
    const x = Math.floor(rand() * size), y = Math.floor(rand() * size);
    const w = style === "wood" ? 1 + Math.floor(rand() * 2) : 1 + Math.floor(rand() * 3);
    const h = style === "wood" ? 2 + Math.floor(rand() * 7) : 1 + Math.floor(rand() * 3);
    ctx.globalAlpha = 0.2 + rand() * 0.45;
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, w, h);
  }
  if (style === "grass") {
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#765035";
    ctx.fillRect(0, 6, 16, 10);
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = i % 2 ? "#5d9d37" : "#78bd4c";
      ctx.fillRect(Math.floor(rand() * 16), 6 + Math.floor(rand() * 2), 1, 1);
    }
    for (let i = 0; i < 35; i++) {
      ctx.fillStyle = i % 2 ? "#8c6039" : "#69452d";
      ctx.fillRect(Math.floor(rand() * 16), 7 + Math.floor(rand() * 9), 1 + Math.floor(rand() * 2), 1);
    }
  }
  if (style === "wood") {
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "#684324";
    for (let x = 2; x < 16; x += 5) ctx.fillRect(x, 0, 1, 16);
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

materials[BLOCKS.GRASS] = new THREE.MeshLambertMaterial({ map: makePixelTexture("#59a83d", "#a3d85c", 12, "grass") });
materials[BLOCKS.DIRT] = new THREE.MeshLambertMaterial({ map: makePixelTexture("#805331", "#c08a50", 24) });
materials[BLOCKS.STONE] = new THREE.MeshLambertMaterial({ map: makePixelTexture("#858a8b", "#c0c3c0", 31) });
materials[BLOCKS.WOOD] = new THREE.MeshLambertMaterial({ map: makePixelTexture("#9b6a39", "#d0a05c", 42, "wood") });

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
  // A few simple trees make the first world feel less empty.
  const trees = [[-8, -7], [7, -9], [10, 6], [-12, 9], [2, 13], [14, -1]];
  for (const [x, z] of trees) {
    const ground = terrainHeight(x, z);
    for (let y = ground + 1; y <= ground + 4; y++) setBlock(x, y, z, BLOCKS.WOOD);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      for (let dy = 3; dy <= 5; dy++) {
        if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy - 4) <= 4 && getBlock(x + dx, ground + dy, z + dz) === BLOCKS.AIR) {
          // Leaves use the grass texture temporarily until leaf blocks are added.
          setBlock(x + dx, ground + dy, z + dz, BLOCKS.GRASS);
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
  for (const type of hotbarTypes) geometryData.set(type, { positions: [], normals: [], uvs: [], indices: [] });
  for (const [key, type] of world) {
    const [x, y, z] = key.split(",").map(Number);
    const data = geometryData.get(type);
    if (!data) continue;
    for (const face of faceDefs) {
      const [nx, ny, nz] = face.n;
      if (getBlock(x + nx, y + ny, z + nz) !== BLOCKS.AIR) continue;
      const start = data.positions.length / 3;
      for (let i = 0; i < 4; i++) {
        const c = face.c[i];
        data.positions.push(x + c[0], y + c[1], z + c[2]);
        data.normals.push(nx, ny, nz);
      }
      data.uvs.push(0,0, 0,1, 1,1, 1,0);
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
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, materials[type]);
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
function selectSlot(index) {
  selectedSlot = (index + hotbarTypes.length) % hotbarTypes.length;
  document.querySelectorAll(".slot").forEach((el, i) => el.classList.toggle("selected", i === selectedSlot));
}
document.querySelectorAll(".slot").forEach((el, i) => el.addEventListener("click", () => selectSlot(i)));

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
  if (/^Digit[1-4]$/.test(event.code)) selectSlot(Number(event.code.slice(5)) - 1);
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
  setBlock(target.x, target.y, target.z, BLOCKS.AIR);
  rebuildTerrain();
}
function handlePlace() {
  const target = targetedBlock();
  if (!target) return;
  const nx = Math.round(target.normal.x), ny = Math.round(target.normal.y), nz = Math.round(target.normal.z);
  const x = target.x + nx, y = target.y + ny, z = target.z + nz;
  if (getBlock(x, y, z) !== BLOCKS.AIR) return;
  const minX = Math.floor(player.x - PLAYER_RADIUS), maxX = Math.floor(player.x + PLAYER_RADIUS);
  const minY = Math.floor(player.y), maxY = Math.floor(player.y + PLAYER_HEIGHT);
  const minZ = Math.floor(player.z - PLAYER_RADIUS), maxZ = Math.floor(player.z + PLAYER_RADIUS);
  if (x >= minX && x <= maxX && y >= minY && y <= maxY && z >= minZ && z <= maxZ) return;
  setBlock(x, y, z, hotbarTypes[selectedSlot]);
  rebuildTerrain();
}
document.addEventListener("mousedown", event => {
  if (!locked) return;
  if (event.button === 0) handleMine();
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
  if (player.y < -10) findSpawn();
  player.x = Math.max(-WORLD_HALF + 0.5, Math.min(WORLD_HALF - 0.5, player.x));
  player.z = Math.max(-WORLD_HALF + 0.5, Math.min(WORLD_HALF - 0.5, player.z));
  updateCamera();
  coordsText.textContent = "X " + Math.floor(player.x) + " · Y " + Math.floor(player.y) + " · Z " + Math.floor(player.z);
}

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastTime) / 1000, 0.04);
  lastTime = now;
  if (locked) updatePlayer(dt);
  renderer.render(scene, camera);
}
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
});

generateWorld();
rebuildTerrain();
findSpawn();
updateCamera();
statusText.textContent = "World ready · 40 × 40 blocks";
requestAnimationFrame(animate);
