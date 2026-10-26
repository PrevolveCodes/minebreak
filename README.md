# Minebreak

Minebreak is a browser-based voxel sandbox prototype built with Three.js.

## Run it

Because this project uses JavaScript modules, open it through a local web server rather than opening `index.html` directly. GitHub Pages can also host it:

1. Open the repository's **Settings → Pages**.
2. Choose **Deploy from a branch**, select `main` and `/(root)`, then save.
3. Wait for the deployment and open the Pages URL.

## Controls

- **W A S D** — move
- **Space** — jump
- **Mouse** — look around
- **Left click** — mine the targeted block
- **Right click** — place the selected block
- **1–4 / mouse wheel** — select a hotbar slot
- **Esc** — release the mouse

## Texture assets

The prototype currently generates temporary pixel textures in code. It does not include Minecraft's original resource-pack files. Later, local textures can be added under `assets/textures/block/` and loaded by the game. Do not commit resource-pack files you do not have permission to redistribute to this public repository.

## Current scope

This is the first playable foundation, not a complete Minecraft replacement yet. It has a generated voxel landscape, first-person movement, mining, block placement, and a hotbar. Chunk streaming, saving, crafting, mobs, and multiplayer are future systems.
