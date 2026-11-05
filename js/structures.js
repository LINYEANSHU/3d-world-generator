// ============================================================
// structures.js — 树木 / 花草 / 村庄 / 道路 / 农田 / 了望塔 / 遗迹
// 全部由体素方块组合，位置由 seed 哈希决定，结果可复现
// ============================================================
import { B } from './blocks.js';
import { fbm2, Perlin, clamp, seededRandom, hash2 } from './noise.js';

// 在地形之上布置一切结构。terra 来自 generateTerrain()
export function decorateWorld(terra, opts) {
  const { world, size, seedHash } = terra;
  const rand = seededRandom(opts.seedStr, 'deco');
  const villages = [];       // {x,z} 村庄中心（供相机聚焦）
  const plants = new Map();  // plantId -> [{x,y,z,rot}]

  const nForest = new Perlin(rand);
  const nFlower = new Perlin(rand);
  const nTemp = new Perlin(rand);
  // 樱花林分布噪声：用独立 salt 流，不消耗 deco 主随机流（村庄/既有树种布局不受影响）
  const nBloom = new Perlin(seededRandom(opts.seedStr, 'bloom'));

  const forestAt = (x, z) => (fbm2(nForest, x * 0.018 + 91, z * 0.018 + 37, 3) + 1) / 2;
  const flowerAt = (x, z) => (fbm2(nFlower, x * 0.05 + 5, z * 0.05 + 55, 2) + 1) / 2;
  const tempAt = (x, z) => nTemp.noise2(x * 0.02 + 13, z * 0.02 + 71);
  const bloomAt = (x, z) => (fbm2(nBloom, x * 0.012 + 117, z * 0.012 + 59, 2) + 1) / 2;

  const addPlant = (id, x, y, z) => {
    if (!plants.has(id)) plants.set(id, []);
    plants.get(id).push({ x, y, z, rot: (hash2(x, z, seedHash + 99) * 4) | 0 });
  };

  // ---------------- 村庄 ----------------
  placeVillages(terra, opts, rand, villages, addPlant);

  // ---------------- 特殊建筑：了望塔 / 遗迹 ----------------
  // 用独立 salt 随机流，避免影响村庄选址与树种随机序列
  const towers = placeTowers(terra, seededRandom(opts.seedStr, 'tower'), villages);
  const ruins = placeRuins(terra, seededRandom(opts.seedStr, 'ruins'), villages, towers);

  // ---------------- 树木 ----------------
  const veg = opts.vegetation;
  const step = 4;
  for (let gx = 0; gx < size / step; gx++) {
    for (let gz = 0; gz < size / step; gz++) {
      const jx = hash2(gx, gz, seedHash + 31) * (step - 1);
      const jz = hash2(gx, gz, seedHash + 32) * (step - 1);
      const x = Math.min(size - 1, (gx * step + jx) | 0);
      const z = Math.min(size - 1, (gz * step + jz) | 0);
      if (x < 2 || x >= size - 2 || z < 2 || z >= size - 2) continue;

      const forest = forestAt(x, z);
      const density = clamp((forest - 0.32) * 1.9, 0, 1) * 0.62 + 0.028;
      if (hash2(x, z, seedHash + 33) > density * veg) continue;

      const h = surfaceOf(world, x, z);
      if (h < 0) continue;
      const top = world.get(x, h, z);
      if (top !== B.GRASS && top !== B.SNOWGRASS) continue;
      if (world.getFlag(x, z) !== 0) continue;
      if (occupiedAround(world, x, z)) continue;

      // 物种：高海拔/低温 → 云杉；其余橡木 / 白桦 / 樱花林（低海拔 bloom 噪声成片）
      const cold = tempAt(x, z);
      let species;
      if (h > 23 || cold < -0.28) species = 'spruce';
      else if (hash2(x, z, seedHash + 34) < 0.16) species = 'birch';
      else if (h <= 22 && bloomAt(x, z) > 0.6) species = 'cherry';
      else {
        // 橡木变体：少量大橡树与枯树（坐标哈希决定，确定性）
        const vr = hash2(x, z, seedHash + 35);
        species = vr < 0.07 ? 'big-oak' : vr > 0.96 ? 'dead' : 'oak';
      }

      buildTree(world, x, h, z, species, rand);
      world.flag(x, z, 2); // 树干占位
    }
  }

  // ---------------- 地表植被 ----------------
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      if (world.getFlag(x, z) !== 0) continue;
      const h = surfaceOf(world, x, z);
      if (h < 0 || h + 1 >= world.sy) continue;
      const top = world.get(x, h, z);
      const above = world.get(x, h + 1, z);
      if (above !== B.AIR) continue;

      const r = hash2(x, z, seedHash + 41);
      if (top === B.GRASS) {
        const f = forestAt(x, z);
        const fl = flowerAt(x, z);
        if (r < (0.035 + f * 0.115) * veg) { addPlant(B.TALLGRASS, x, h + 1, z); continue; }
        if (fl > 0.55 && r < 0.16 * veg) {
          addPlant(hash2(x, z, seedHash + 42) < 0.5 ? B.FLOWER_RED : B.FLOWER_YELLOW, x, h + 1, z);
          continue;
        }
        if (f > 0.55 && r < 0.018 * veg) {
          addPlant(hash2(x, z, seedHash + 43) < 0.6 ? B.MUSHROOM_BROWN : B.MUSHROOM_RED, x, h + 1, z);
          continue;
        }
        if (r < 0.0022 * veg) world.set(x, h + 1, z, B.PUMPKIN);
      } else if (top === B.SAND && h === terra.waterLevel) {
        // 水边芦苇（生成器保证：贴水的低地地表必为沙，故只需判 SAND）
        const nearWater = world.get(x + 1, h, z) === B.WATER || world.get(x - 1, h, z) === B.WATER
          || world.get(x, h, z + 1) === B.WATER || world.get(x, h, z - 1) === B.WATER;
        if (nearWater && r < 0.14 * veg) {
          const n = 1 + (hash2(x, z, seedHash + 44) < 0.5 ? 1 : 0);
          for (let i = 1; i <= n; i++) {
            if (world.get(x, h + i, z) === B.AIR) addPlant(B.REED, x, h + i, z);
          }
        }
      }
    }
  }

  return { plants, villages, towers, ruins };
}

// ---------------- 了望塔 ----------------
// 高地制高点上的石制了望塔：7×7 石墙 + 木质顶台 + 四角萤石，带入口坡道
function placeTowers(terra, rand, villages) {
  const { hmap, waterLevel, size } = terra;
  const want = 1 + ((rand() * 2) | 0); // 1~2 座
  const placed = [];
  for (let i = 0; i < 40 && placed.length < want; i++) {
    const x = 10 + ((rand() * (size - 20)) | 0);
    const z = 10 + ((rand() * (size - 20)) | 0);
    // 取 7×7 邻域高度统计
    const hs = [];
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      hs.push(hmap[clampI(x + dx, 0, size - 1) * size + clampI(z + dz, 0, size - 1)]);
    }
    hs.sort((a, b) => a - b);
    const med = hs[hs.length >> 1];
    // 山腰/高地、不淹水、相对平整
    if (med < 20 || med > 34 || hs[0] <= waterLevel || hs[hs.length - 1] - hs[0] > 10) continue;
    // 远离村庄与其他塔
    if (villages.some(v => Math.hypot(v.x - x, v.z - z) < 24)) continue;
    if (placed.some(p => Math.hypot(p.x - x, p.z - z) < size * 0.22)) continue;
    buildWatchtower(terra, x, z, med, rand);
    placed.push({ x, z });
  }
  return placed;
}

function buildWatchtower(terra, cx, cz, g, rand) {
  const { world } = terra;
  flattenRect(terra, cx - 3, cz - 3, cx + 3, cz + 3, g, B.GRASS);
  const doorSide = (rand() * 4) | 0;

  // 石墙（4 高，留 2 高门口）+ 石基座
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      const x = cx + dx, z = cz + dz;
      world.flag(x, z, 1);
      if (Math.abs(dx) !== 3 && Math.abs(dz) !== 3) continue;
      world.set(x, g, z, B.COBBLE);
      const isDoor = (doorSide === 0 && dx === 3 && dz === 0)
        || (doorSide === 1 && dx === -3 && dz === 0)
        || (doorSide === 2 && dz === 3 && dx === 0)
        || (doorSide === 3 && dz === -3 && dx === 0);
      for (let y = g + 1; y <= g + 4; y++) {
        if (isDoor && y <= g + 2) continue;
        world.set(x, y, z, B.COBBLE);
      }
    }
  }

  // 顶面平台（7×7 木板）+ 四角萤石
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      world.set(cx + dx, g + 5, cz + dz, B.PLANK_DARK);
    }
  }
  for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
    world.set(cx + dx, g + 6, cz + dz, B.GLOW);
  }

  // 门外 3 格土径坡道（贴地整平到门口高度）
  if (doorSide === 0) flattenRect(terra, cx + 4, cz, cx + 6, cz, g, B.PATH);
  else if (doorSide === 1) flattenRect(terra, cx - 6, cz, cx - 4, cz, g, B.PATH);
  else if (doorSide === 2) flattenRect(terra, cx, cz + 4, cx, cz + 6, g, B.PATH);
  else flattenRect(terra, cx, cz - 6, cx, cz - 4, g, B.PATH);
}

// ---------------- 遗迹 ----------------
// 平地上的残破石环：断墙高度随机、局部塌毁，中央残座
function placeRuins(terra, rand, villages, towers) {
  const { hmap, waterLevel, size } = terra;
  const want = 2 + ((rand() * 2) | 0); // 2~3 处
  const placed = [];
  for (let i = 0; i < 60 && placed.length < want; i++) {
    const x = 10 + ((rand() * (size - 20)) | 0);
    const z = 10 + ((rand() * (size - 20)) | 0);
    const hs = [];
    for (let dx = -4; dx <= 4; dx += 2) for (let dz = -4; dz <= 4; dz += 2) {
      hs.push(hmap[clampI(x + dx, 0, size - 1) * size + clampI(z + dz, 0, size - 1)]);
    }
    hs.sort((a, b) => a - b);
    const med = hs[hs.length >> 1];
    // 低地平缓处、不淹水
    if (med <= waterLevel + 1 || med > 28 || hs[hs.length - 1] - hs[0] > 6) continue;
    if (villages.some(v => Math.hypot(v.x - x, v.z - z) < 20)) continue;
    if (towers.some(p => Math.hypot(p.x - x, p.z - z) < 14)) continue;
    if (placed.some(p => Math.hypot(p.x - x, p.z - z) < 14)) continue;
    buildRuins(terra, x, z, rand);
    placed.push({ x, z });
  }
  return placed;
}

function buildRuins(terra, cx, cz, rand) {
  const { world, waterLevel, seedHash } = terra;
  const R = 3;
  // 苔化判定：坐标哈希（不消耗 rand 流，遗迹其余布局与旧版一致）
  const mossy = (x, z) => hash2(x, z, seedHash + 82) < 0.45;
  for (let dx = -R; dx <= R; dx++) {
    for (let dz = -R; dz <= R; dz++) {
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > R + 0.4) continue;
      const x = cx + dx, z = cz + dz;
      if (world.getFlag(x, z) !== 0) continue; // 避开村庄/道路等受保护格
      const h = surfaceOf(world, x, z);
      if (h < 0 || h <= waterLevel || h >= 30) continue;

      // 地面：外圈碎石，内圈土径/残砖
      if (d > R - 0.6) world.set(x, h, z, rand() < 0.6 ? (mossy(x, z) ? B.MOSSY : B.COBBLE) : B.GRAVEL);
      else world.set(x, h, z, rand() < 0.3 ? B.BRICK : B.PATH);

      // 残墙：圆环上随机立柱（35% 塌毁为 0 高）
      if (d > R - 0.8 && d < R + 0.4) {
        const hgt = rand() < 0.35 ? 0 : 1 + ((rand() * 3) | 0);
        for (let y = 1; y <= hgt; y++) {
          if (world.get(x, h + y, z) === B.AIR) {
            world.set(x, h + y, z, rand() < 0.25 ? B.BRICK : (mossy(x, z) ? B.MOSSY : B.COBBLE));
          }
        }
      }
      world.flag(x, z, 1);
    }
  }
  // 中央残座（石柱基座）
  const hc = surfaceOf(world, cx, cz);
  if (hc > waterLevel && world.getFlag(cx, cz) === 0) {
    world.set(cx, hc + 1, cz, mossy(cx, cz) ? B.MOSSY : B.COBBLE);
    if (rand() < 0.5) world.set(cx, hc + 2, cz, B.COBBLE);
    world.flag(cx, cz, 1);
  }
}

function surfaceOf(world, x, z) {
  return world.columnTop(x, z);
}
function occupiedAround(world, x, z) {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (world.getFlag(x + dx, z + dz) !== 0) return true;
  }
  return false;
}

// ---------------- 树 ----------------
function buildTree(world, x, y0, z, species, rand) {
  if (species === 'spruce') {
    const th = 6 + ((rand() * 4) | 0); // 6-9
    for (let i = 1; i <= th; i++) world.set(x, y0 + i, z, B.LOG_SPRUCE);
    for (let yy = y0 + 2; yy <= y0 + th; yy++) {
      const fromTop = y0 + th - yy;
      const r = fromTop === 0 ? 1 : (fromTop % 2 === 1 ? 1 : 2);
      ring(world, x, yy, z, r, B.LEAVES_SPRUCE, true);
    }
    world.set(x, y0 + th + 1, z, B.LEAVES_SPRUCE); // 树尖
  } else if (species === 'birch') {
    const th = 5 + ((rand() * 2) | 0);
    for (let i = 1; i <= th; i++) world.set(x, y0 + i, z, B.LOG_BIRCH);
    blob(world, x, y0 + th - 1, z, 2, B.LEAVES, rand);
    blob(world, x, y0 + th, z, 1, B.LEAVES, rand);
    world.set(x, y0 + th + 1, z, B.LEAVES);
  } else if (species === 'cherry') {
    // 樱花树：矮干 + 宽而蓬松的粉色树冠
    const th = 4 + ((rand() * 2) | 0); // 4-5
    for (let i = 1; i <= th; i++) world.set(x, y0 + i, z, B.LOG);
    blob(world, x, y0 + th, z, 2, B.LEAVES_CHERRY, rand);
    blob(world, x, y0 + th + 1, z, 1, B.LEAVES_CHERRY, rand);
    world.set(x, y0 + th + 2, z, B.LEAVES_CHERRY);
  } else if (species === 'big-oak') {
    // 大橡树：更高树干 + 三层宽树冠
    const th = 6 + ((rand() * 3) | 0); // 6-8
    for (let i = 1; i <= th; i++) world.set(x, y0 + i, z, B.LOG);
    blob(world, x, y0 + th - 1, z, 3, B.LEAVES, rand);
    blob(world, x, y0 + th, z, 3, B.LEAVES, rand);
    blob(world, x, y0 + th + 1, z, 2, B.LEAVES, rand);
    blob(world, x, y0 + th + 2, z, 1, B.LEAVES, rand);
    world.set(x, y0 + th + 3, z, B.LEAVES);
  } else if (species === 'dead') {
    // 枯树：裸树干 + 1~2 根侧枝，无树叶
    const th = 3 + ((rand() * 3) | 0); // 3-5
    for (let i = 1; i <= th; i++) world.set(x, y0 + i, z, B.LOG);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const bi = (rand() * 4) | 0;
    const [bx, bz] = dirs[bi];
    if (world.get(x + bx, y0 + th, z + bz) === B.AIR) world.set(x + bx, y0 + th, z + bz, B.LOG);
    if (rand() < 0.5) {
      const [bx2, bz2] = dirs[(bi + 2) % 4];
      if (world.get(x + bx2, y0 + th - 1, z + bz2) === B.AIR) world.set(x + bx2, y0 + th - 1, z + bz2, B.LOG);
    }
  } else { // oak
    const th = 4 + ((rand() * 3) | 0);
    for (let i = 1; i <= th; i++) world.set(x, y0 + i, z, B.LOG);
    blob(world, x, y0 + th - 1, z, 2, B.LEAVES, rand);
    blob(world, x, y0 + th, z, 2, B.LEAVES, rand);
    blob(world, x, y0 + th + 1, z, 1, B.LEAVES, rand);
    world.set(x, y0 + th + 2, z, B.LEAVES);
  }
}

// 圆形叶团（随机裁角）
function blob(world, cx, cy, cz, r, leaf, rand) {
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      if (dx * dx + dz * dz > r * r + 0.6) continue;
      if (Math.abs(dx) === r && Math.abs(dz) === r && rand() < 0.6) continue;
      const layers = r >= 2 ? [cy - 1, cy] : [cy];
      for (const y of layers) {
        if (world.get(cx + dx, y, cz + dz) === B.AIR) {
          world.set(cx + dx, y, cz + dz, leaf);
        }
      }
    }
  }
}

// 菱形环（云杉）
function ring(world, cx, cy, cz, r, leaf, diamond) {
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      if (diamond && Math.abs(dx) + Math.abs(dz) > r + 1) continue;
      if (!diamond && Math.abs(dx) === r && Math.abs(dz) === r) continue;
      if (dx === 0 && dz === 0) continue; // 让出树干
      if (world.get(cx + dx, cy, cz + dz) === B.AIR) {
        world.set(cx + dx, cy, cz + dz, leaf);
      }
    }
  }
}

// ---------------- 村庄 ----------------
function placeVillages(terra, opts, rand, villages, addPlant) {
  const { hmap, waterLevel, size } = terra;
  const want = opts.villageCount | 0;
  if (want <= 0) return;

  // 候选点评分：不淹没即可入选，越平越优（地基后续会整平）
  const cands = [];
  for (let i = 0; i < 320; i++) {
    const x = 12 + ((rand() * (size - 24)) | 0);
    const z = 12 + ((rand() * (size - 24)) | 0);
    let mn = 999, mx = -999, sum = 0, n = 0;
    for (let dx = -8; dx <= 8; dx += 2) {
      for (let dz = -8; dz <= 8; dz += 2) {
        const h = hmap[clampI(x + dx, 0, size - 1) * size + clampI(z + dz, 0, size - 1)];
        mn = Math.min(mn, h); mx = Math.max(mx, h); sum += h; n++;
      }
    }
    if (mn < waterLevel + 1 || mx > 30) continue;
    const avg = sum / n;
    const score = -(mx - mn) - Math.abs(avg - 16) * 0.05;
    cands.push({ x, z, score });
  }
  cands.sort((a, b) => b.score - a.score);

  const minDist = size * 0.38;
  for (const c of cands) {
    if (villages.length >= want) break;
    if (villages.some(v => Math.hypot(v.x - c.x, v.z - c.z) < minDist)) continue;
    villages.push({ x: c.x, z: c.z });
    buildVillage(terra, c.x, c.z, rand, addPlant);
  }
}

function clampI(v, a, b) { return v < a ? a : v > b ? b : v; }

function buildVillage(terra, cx, cz, rand, addPlant) {
  const { world, hmap, waterLevel, size, seedHash } = terra;
  const g = clampI(hmap[cx * size + cz], waterLevel + 2, 30);

  // 中央水井 + 广场
  flattenRect(terra, cx - 2, cz - 2, cx + 2, cz + 2, g, B.GRASS);
  buildWell(terra, cx, cz, g);
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    if (Math.abs(dx) + Math.abs(dz) > 4) continue;
    const x = cx + dx, z = cz + dz;
    if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) continue; // 让开水井
    if (world.get(x, g, z) !== B.AIR) {
      world.set(x, g, z, hash2(x, z, seedHash + 61) < 0.2 ? B.GRAVEL : B.PATH);
      world.flag(x, z, 1);
    }
  }

  // 建筑布局：环形槽位
  const nBuild = 4 + ((rand() * 3) | 0);
  const pads = [];
  const roadQueue = [];
  const lampSpots = [];
  const a0 = rand() * Math.PI * 2;
  for (let i = 0; i < nBuild; i++) {
    const ang = a0 + (i / nBuild) * Math.PI * 2 + (rand() - 0.5) * 0.5;
    const dist = 9 + rand() * 5;
    const bx0 = Math.round(cx + Math.cos(ang) * dist);
    const bz0 = Math.round(cz + Math.sin(ang) * dist);

    // 螺旋微调到最平的 5×5 邻域
    let best = null, bestScore = 1e9;
    for (let ox = -4; ox <= 4; ox++) {
      for (let oz = -4; oz <= 4; oz++) {
        const px = bx0 + ox, pz = bz0 + oz;
        if (px < 6 || px >= size - 6 || pz < 6 || pz >= size - 6) continue;
        let mn = 999, mx = -999;
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
          const h = hmap[clampI(px + dx, 0, size - 1) * size + clampI(pz + dz, 0, size - 1)];
          mn = Math.min(mn, h); mx = Math.max(mx, h);
        }
        if (mn <= waterLevel) continue;
        const overlap = pads.some(p => Math.abs(px - p.x) < 9 && Math.abs(pz - p.z) < 9);
        const score = (mx - mn) + (overlap ? 100 : 0);
        if (score < bestScore) { bestScore = score; best = { x: px, z: pz }; }
      }
    }
    if (!best || bestScore > 14) continue;

    const roll = rand();
    const kind = roll < 0.42 ? 'wood' : roll < 0.75 ? 'stone' : 'farm';
    const res = buildHouse(terra, best.x, best.z, cx, cz, kind, rand, lampSpots);
    if (!res.door) continue;
    pads.push(res.pad);
    roadQueue.push(res.door);
  }

  // 农田：贴着某座建筑放 1-2 块
  const farmCount = 1 + ((rand() * 2) | 0);
  for (let i = 0; i < farmCount && pads.length; i++) {
    const p = pads[(rand() * pads.length) | 0];
    const fx = clampI(p.x + (rand() < 0.5 ? -8 : 8), 4, size - 5);
    const fz = clampI(p.z + ((rand() * 10) | 0) - 5, 4, size - 5);
    if (Math.abs(fx - cx) > 22 || Math.abs(fz - cz) > 22) continue;
    buildFarm(terra, fx, fz, addPlant);
  }

  // 道路：门 → 村中心，随后整平滑坡
  const allRoad = new Set();
  for (const door of roadQueue) {
    for (const k of buildRoad(terra, door, { x: cx, z: cz }, rand)) allRoad.add(k);
  }
  smoothRoadCells(terra, allRoad, rand);

  // 路灯
  for (const [lx, lz] of lampSpots) {
    const h = surfaceOf(world, lx, lz);
    if (h < 0 || world.getFlag(lx, lz) !== 0) continue;
    const top = world.get(lx, h, lz);
    if (top !== B.GRASS && top !== B.PATH) continue;
    if (world.get(lx, h + 1, lz) !== B.AIR) continue;
    world.set(lx, h + 1, lz, B.LOG);
    world.set(lx, h + 2, lz, B.LOG);
    world.set(lx, h + 3, lz, B.GLOW);
    world.flag(lx, lz, 1);
  }
}

// 将矩形区域整平到高度 bh，地表材质 topBlock
function flattenRect(terra, x0, z0, x1, z1, bh, topBlock) {
  const { world, hmap, size } = terra;
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      if (x < 0 || x >= size || z < 0 || z >= size) continue;
      const cur = world.columnTop(x, z);
      for (let y = bh + 1; y <= Math.max(cur, bh); y++) world.set(x, y, z, B.AIR);
      for (let y = 0; y <= bh; y++) {
        if (y === bh) world.set(x, y, z, topBlock);
        else {
          const curB = world.get(x, y, z);
          if (curB === B.AIR || curB === B.WATER) world.set(x, y, z, y >= bh - 2 ? B.DIRT : B.STONE);
        }
      }
      hmap[x * size + z] = bh;
      world.flag(x, z, 1);
    }
  }
}

function buildHouse(terra, bx, bz, cx, cz, kind, rand, lampSpots) {
  const { world, hmap, size } = terra;
  const w = 5 + ((rand() * 2) | 0); // x 方向
  const d = 5 + ((rand() * 2) | 0); // z 方向
  const x0 = bx - (w >> 1), z0 = bz - (d >> 1);
  const x1 = x0 + w - 1, z1 = z0 + d - 1;
  if (x0 < 3 || z0 < 3 || x1 >= size - 3 || z1 >= size - 3) return {};

  // 基准高度：地基四角中位数
  const cs = [hmap[x0 * size + z0], hmap[x1 * size + z0], hmap[x0 * size + z1], hmap[x1 * size + z1]];
  cs.sort((a, b) => a - b);
  const bh = clampI(Math.round((cs[1] + cs[2]) / 2), 2, 30);

  flattenRect(terra, x0, z0, x1, z1, bh, B.GRASS);
  for (let x = x0 - 1; x <= x1 + 1; x++) { world.flag(x, z0 - 1, 1); world.flag(x, z1 + 1, 1); }
  for (let z = z0 - 1; z <= z1 + 1; z++) { world.flag(x0 - 1, z, 1); world.flag(x1 + 1, z, 1); }

  const wallMat = kind === 'stone' ? B.COBBLE : B.PLANK;
  const cornerMat = kind === 'stone' ? B.STONE : B.LOG;
  const roofMat = kind === 'stone' ? B.BRICK : B.PLANK_DARK;

  // 地板
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    world.set(x, bh, z, B.PLANK);
  }

  // 门：朝向村庄中心的那一侧
  const faceX = Math.abs(cx - bx) > Math.abs(cz - bz);
  const door = {};
  if (faceX) {
    door.x = cx > bx ? x1 : x0;
    door.z = bz;
  } else {
    door.x = bx;
    door.z = cz > bz ? z1 : z0;
  }

  // 墙（3 高）+ 角柱，留门与窗
  const fy = bh + 1, wy2 = bh + 3;
  for (let y = fy; y <= wy2; y++) {
    for (let x = x0; x <= x1; x++) {
      for (const z of [z0, z1]) {
        if (z === door.z && x === door.x && y <= fy + 1) continue; // 门口
        world.set(x, y, z, isCorner(x, z) ? cornerMat : wallMat);
      }
    }
    for (let z = z0 + 1; z <= z1 - 1; z++) {
      for (const x of [x0, x1]) {
        if (x === door.x && z === door.z && y <= fy + 1) continue;
        world.set(x, y, z, isCorner(x, z) ? cornerMat : wallMat);
      }
    }
  }
  function isCorner(x, z) { return (x === x0 || x === x1) && (z === z0 || z === z1); }

  // 窗
  for (let x = x0 + 1; x <= x1 - 1; x += 2) {
    if (faceX && (x === door.x && (z0 === door.z || z1 === door.z))) continue;
    world.set(x, fy + 1, z0, B.GLASS);
    world.set(x, fy + 1, z1, B.GLASS);
  }
  for (let z = z0 + 1; z <= z1 - 1; z += 2) {
    if (!faceX && (z === door.z && (x0 === door.x || x1 === door.x))) continue;
    world.set(x0, fy + 1, z, B.GLASS);
    world.set(x1, fy + 1, z, B.GLASS);
  }

  // 屋顶：四面内收
  let ry = wy2 + 1, ix = 0, iz = 0;
  while (x0 + ix <= x1 - ix && z0 + iz <= z1 - iz) {
    for (let x = x0 + ix; x <= x1 - ix; x++) {
      world.set(x, ry, z0 + iz, roofMat);
      world.set(x, ry, z1 - iz, roofMat);
    }
    for (let z = z0 + iz; z <= z1 - iz; z++) {
      world.set(x0 + ix, ry, z, roofMat);
      world.set(x1 - ix, ry, z, roofMat);
    }
    ix++; iz++; ry++;
  }

  // 烟囱（石屋）
  if (kind === 'stone' && rand() < 0.6) {
    const chx = x0 + 1, chz = z0 + 1;
    for (let y = wy2 + 1; y <= ry + 1; y++) world.set(chx, y, chz, B.COBBLE);
  }

  // 门口路灯（门侧偏移一格）
  const lx = faceX ? door.x + (cx > bx ? 1 : -1) : door.x + 1;
  const lz = faceX ? door.z - 1 : door.z + (cz > bz ? 1 : -1);
  lampSpots.push([clampI(lx, 1, size - 2), clampI(lz, 1, size - 2)]);

  // 道路起点：门外一格
  const road = {
    x: clampI(door.x + (faceX ? (cx > bx ? 1 : -1) : 0), 0, size - 1),
    z: clampI(door.z + (faceX ? 0 : (cz > bz ? 1 : -1)), 0, size - 1),
  };
  return { door: road, pad: { x: bx, z: bz } };
}

function buildFarm(terra, fx, fz, addPlant) {
  const { world, hmap, size } = terra;
  const w = 7, d = 5;
  const x0 = fx - (w >> 1), z0 = fz - (d >> 1);
  const x1 = x0 + w - 1, z1 = z0 + d - 1;
  if (x0 < 3 || z0 < 3 || x1 >= size - 3 || z1 >= size - 3) return;
  const cs = [hmap[x0 * size + z0], hmap[x1 * size + z1], hmap[x0 * size + z1], hmap[x1 * size + z0]];
  cs.sort((a, b) => a - b);
  const bh = clampI(Math.round((cs[1] + cs[2]) / 2), 2, 28);
  flattenRect(terra, x0, z0, x1, z1, bh, B.GRASS);

  const midZ = (z0 + z1) >> 1;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const border = x === x0 || x === x1 || z === z0 || z === z1;
    world.set(x, bh, z, border ? B.LOG : (z === midZ ? B.WATER : B.FARMLAND));
    world.flag(x, z, 1);
  }
  // 角落干草垛
  world.set(x0, bh + 1, z0, B.HAY);
  world.set(x1, bh + 1, z1, B.HAY);
  // 麦子
  for (let x = x0 + 1; x <= x1 - 1; x++) {
    for (let z = z0 + 1; z <= z1 - 1; z++) {
      if (z === midZ) continue;
      addPlant(B.WHEAT, x, bh + 1, z);
    }
  }
}

function buildWell(terra, cx, cz, g) {
  const { world } = terra;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    if (dx === 0 && dz === 0) {
      world.set(cx, g, cz, B.WATER);
      world.set(cx, g - 1, cz, B.WATER);
    } else {
      world.set(cx + dx, g + 1, cz + dz, B.COBBLE);
    }
    world.flag(cx + dx, cz + dz, 1);
  }
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    world.set(cx + dx, g + 2, cz + dz, B.LOG);
    world.set(cx + dx, g + 3, cz + dz, B.LOG);
  }
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    world.set(cx + dx, g + 4, cz + dz, B.PLANK_DARK);
  }
}

// 道路：随机化 L 行走，先记录后整平
function buildRoad(terra, from, to, rand) {
  const { size } = terra;
  const roadCells = new Set();
  let { x, z } = from;
  let guard = 0;
  while ((x !== to.x || z !== to.z) && guard++ < 400) {
    roadCells.add(x * size + z);
    const dx = Math.sign(to.x - x), dz = Math.sign(to.z - z);
    if (dx !== 0 && dz !== 0) {
      if (rand() < 0.5) x += dx; else z += dz;
    } else if (dx !== 0) x += dx;
    else z += dz;
    // 偶尔绕一下，避免太笔直
    if (rand() < 0.08) {
      if (rand() < 0.5) x = clampI(x + (rand() < 0.5 ? 1 : -1), 1, size - 2);
      else z = clampI(z + (rand() < 0.5 ? 1 : -1), 1, size - 2);
    }
  }
  roadCells.add(to.x * size + to.z);
  return roadCells;
}

// 批量修整道路：输入道路格集合，取邻域中位数高度逐格整平
function smoothRoadCells(terra, roadCells, rand) {
  const { hmap, size, waterLevel, seedHash } = terra;
  const targets = [];
  for (const k of roadCells) {
    const x = (k / size) | 0, z = k % size;
    const hs = [];
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const xx = clampI(x + dx, 0, size - 1), zz = clampI(z + dz, 0, size - 1);
      hs.push(hmap[xx * size + zz]);
    }
    hs.sort((a, b) => a - b);
    targets.push([x, z, hs[hs.length >> 1]]);
  }
  for (const [x, z, t] of targets) {
    const h = hmap[x * size + z];
    if (h <= waterLevel) continue;
    // 限制与原地形的偏差在 ±1 内，避免道路在房边切出深坑
    const lo = Math.max(waterLevel + 1, h - 1);
    const top = clampI(t, lo, h + 1);
    flattenRect(terra, x, z, x, z, top,
      hash2(x, z, seedHash + 71) < 0.15 ? B.GRAVEL : B.PATH);
  }
}
