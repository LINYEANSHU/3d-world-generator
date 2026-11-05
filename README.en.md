<p align="center"><a href="README.md">简体中文</a> · English</p>

<p align="center">
  <img src="./assets/readme/hero.en.svg" width="100%" alt="Block World Generator — type a seed and watch a voxel world of mountains, rivers, forests, villages and ruins grow in your browser">
</p>

<p align="center">
  <a href="https://github.com/LINYEANSHU/3d-world-generator/actions/workflows/ci.yml"><img src="https://github.com/LINYEANSHU/3d-world-generator/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/Three.js-r160-049EF4.svg" alt="Three.js r160">
  <img src="https://img.shields.io/badge/build-none-lightgrey.svg" alt="No build step">
</p>

**Block World Generator** is a pure front-end 3D voxel world generator: type any seed, and a
miniature world of mountains, plains, rivers, lakes, forests, villages, watchtowers and ruins
grows in your browser. Every terrain is generated locally and procedurally — no backend, no
build step, no external image assets (textures are painted pixel by pixel with Canvas).
Orbit the world freely or explore it in first-person fly mode; the UI speaks both
English and Chinese.

## Features

- **Seed reproducibility** — the same seed with the same parameters always yields the same
  world (verifiable via the checksum in the panel); no `Math.random()` anywhere in the pipeline
- **Shareable links** — one click encodes the seed and every parameter into the URL hash;
  anyone opening the link lands in the same world
- **Biomes & structures** — oak / birch / spruce / cherry groves, snow lines, beaches, mossy
  ruins, hillside watchtowers, and villages with farms and wells
- **Atmosphere presets** — Crisp Day / Golden Dusk / Misty Rain switch the sky gradient, fog
  and lighting in one click, without touching the world itself
- **Bilingual UI** — English / Chinese toggle in the panel, following your browser language by default
- **Performance-friendly** — chunked mesh merging with per-vertex ambient occlusion keeps a
  128-world at 60 FPS on an ordinary desktop browser

## Getting Started

```bash
git clone https://github.com/LINYEANSHU/3d-world-generator.git
cd 3d-world-generator
```

**Option 1 (Windows)**: double-click `start.bat` — it starts a local server and opens the browser.

**Option 2 (any platform)**: serve the folder with any static server and open `http://127.0.0.1:8137`:

```bash
npx -y http-server -p 8137
# or: python -m http.server 8137
```

> **Why a local server?** The page loads its code as ES Modules with an import map, and the
> browser's same-origin policy blocks module imports over the `file://` protocol. Opening
> `index.html` directly therefore cannot work — the folder must be served over HTTP (a local
> server is enough; no internet access required).

## Controls

| Action | How |
| --- | --- |
| Rotate / pan / zoom | Left-drag / right-drag / scroll |
| Generate a world | Enter a seed → click "Generate World" or press Enter |
| Random world | Click the 🎲 button |
| Copy seed / share link | Click the 📋 / 🔗 buttons (the address bar also carries all parameters) |
| Atmosphere | Pick one of three presets from the dropdown; applies instantly |
| Fly mode | Press `F` or click the button; `WASD` moves, `Space`/`Shift` ascend & descend, `ESC` exits |
| UI language | Click the 🌐 button at the top of the panel (English / 中文) |

## Parameters

| Parameter | Range | Default | Effect |
| --- | --- | --- | --- |
| World seed | Any text | `2026` | Uniquely determines the whole world; left blank, a random one is filled in |
| Terrain relief | 0 – 2 (step 0.1) | 1.0 | Ridge-noise amplitude: 0 = plains, 2 = rugged peaks |
| Water level | -3 – +4 (step 1) | 0 | Global sea-level offset; positive values widen oceans and lakes |
| Vegetation density | 0 – 2 (step 0.1) | 1.0 | Scatter multiplier for trees, flowers, mushrooms and reeds |
| Village count | 0 – 3 (step 1) | 2 | Target count; the actual number depends on finding flat sites |
| World size | 96 / 128 / 160 / 192 | 128 | Map edge length in blocks; also drives fog, shadows and camera |
| Atmosphere | day / dusk / overcast | day | Changes sky, fog and lighting only — never terrain or structures |

## Architecture in Brief

### Generation pipeline

1. **Height field** — continental fBm + hill fBm + mountain mask × ridged noise, with
   frequencies chosen to match the world size;
2. **Height normalization** — a gentle affine remap keeps unusual seeds from going uniformly
   flat or uniformly steep;
3. **River & lake carving** — lake basins sink; rivers follow the zero line of a
   domain-warped noise field, with a width threshold self-calibrated at runtime from the
   field's own quantiles;
4. **Water balance** — a binary search shifts the whole field until water covers roughly 30%
   of the map, for every seed;
5. **Surface painting** — grass, snow, stone, beaches and underwater gravel are assigned by
   elevation, slope and temperature; ridgelines accumulate snow;
6. **Structure placement** — villages are sited by a flatness score with foundations leveled,
   watchtowers claim hillside high ground, ruins scatter across lowlands and grow moss.

All randomness derives from `seed string → xmur3 hash → mulberry32 PRNG / coordinate hash`,
so results are fully reproducible.

### Meshing & rendering

- The world is split into 16×16 chunks; each chunk builds its mesh across frames;
- Interior faces between adjacent solid blocks are culled entirely (voxel-level face culling);
- The meshing hot path inlines neighbor lookups into column-base array reads; occlusion and
  tile slots go through precomputed **lookup tables (LUTs)** and AO levels reuse a scratch
  array — measured at roughly one third faster meshing in like-for-like tests;
- Per-vertex **AO** with quad flipping removes anisotropy artifacts and softens block edges;
- Each chunk merges into one solid + one water `BufferGeometry` — about 120 draw calls for
  the whole scene;
- Plants and clouds render as `InstancedMesh` batches; the world is static, so the shadow map
  renders exactly once (zero ongoing shadow cost);
- Voxels live in a column-major `Uint8Array` layout.

### Project layout

```
3d-world-generator/
├── index.html          Entry page (UI + import map)
├── start.bat           One-click launcher (Windows)
├── css/style.css       Panel styling
├── js/
│   ├── i18n.js         English/Chinese strings and language toggle
│   ├── noise.js        Seeded RNG (xmur3/mulberry32) + Perlin/fBm/ridged noise
│   ├── blocks.js       Block registry (IDs, tile-slot lookup tables, culling flags)
│   ├── atlas.js        Procedural pixel texture atlas (Canvas 2D)
│   ├── world.js        Voxel storage (column-major Uint8Array)
│   ├── generator.js    Terrain generation (height field, rivers, biome painting)
│   ├── structures.js   Trees, flowers, villages, watchtowers, ruins
│   ├── mesher.js       Chunk meshing (face culling + vertex AO + merged meshes)
│   ├── scene.js        Rendering (light, shadows, sky, camera, fly, atmosphere)
│   └── main.js         App orchestration (UI wiring, pipeline, share links, stats)
└── lib/                Third-party bundled files (see below)
```

## Third-Party Dependencies (lib/)

| File | Source | License |
| --- | --- | --- |
| `lib/three.module.min.js` | Build artifact of [three.js](https://github.com/mrdoob/three.js) r160 | MIT |
| `lib/OrbitControls.js` | Control from three.js `examples/jsm/controls` | MIT |

Local copies are bundled so the app runs offline; all rights remain with the three.js authors.

## Credits

- Visual style inspired by [Minecraft](https://www.minecraft.net/) — this project is not
  affiliated with Mojang or Microsoft and contains no game assets; every texture is painted
  procedurally with Canvas;
- All rendering is powered by [Three.js](https://threejs.org/) (MIT).

## License

[MIT](LICENSE) © 2026 LINYEANSHU
