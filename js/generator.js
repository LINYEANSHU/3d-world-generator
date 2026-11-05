// ============================================================
// generator.js — 程序化地形生成
// 大陆/丘陵 fBm + 山脊噪声造山 + 湖盆下陷 + 河道 carving，
// 再按海拔/坡度/湿度铺装地表（草/沙/石/雪），填充水体
// ============================================================
import { B } from './blocks.js';
import { World } from './world.js';
import { Perlin, fbm2, ridged2, lerp, clamp, smoothstep, seededRandom, hash2 } from './noise.js';

export const WORLD_H = 64;

// 生成地形与水体（不含植被/建筑），返回 { world, height, biome }
export function generateTerrain(opts) {
  const { seedStr, size, mountainAmp, waterDelta } = opts;
  const SY = WORLD_H;
  const world = new World(size, size, SY);
  const height = new Float32Array(size * size);   // 平滑后的地表高度（浮点）
  const hmap = new Int16Array(size * size);       // 取整后的地表高度
  const waterLevel = Math.round(13 + waterDelta);

  const r = seededRandom(seedStr, 'terrain');
  const nCont = new Perlin(r), nHill = new Perlin(r), nM = new Perlin(r);
  const nRidge = new Perlin(r), nLake = new Perlin(r), nRiv = new Perlin(r);
  const nWarp = new Perlin(r), nDetail = new Perlin(r), nTemp = new Perlin(r);
  const seedHash = xmurShort(seedStr);

  const off = [];
  for (let i = 0; i < 12; i++) off.push(r() * 512);

  // ---------- 第一遍：自然高度场（未含河湖） ----------
  const natural = new Float32Array(size * size);
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      // 大陆基面 + 丘陵（频率需匹配世界尺寸：128 格内覆盖数个噪声周期）
      const base = fbm2(nCont, x * 0.013 + off[0], z * 0.013 + off[1], 4);
      const hills = fbm2(nHill, x * 0.037 + off[2], z * 0.037 + off[3], 3);

      // 山地遮罩 + 山脊噪声
      const mSel = smoothstep(0.02, 0.42, fbm2(nM, x * 0.014 + off[4], z * 0.014 + off[5], 2));
      const ridge = ridged2(nRidge, x * 0.023 + off[6], z * 0.023 + off[7], 4);

      let h = 15.5 + base * 6.2 + hills * 3.4
        + Math.pow(mSel, 1.25) * mountainAmp * (5 + ridge * 27);

      // 细节抖动
      h += fbm2(nDetail, x * 0.09, z * 0.09, 2) * 1.1;
      natural[x * size + z] = h;
    }
  }

  // ---------- 高度归一（温和仿射） ----------
  // 限制拉伸倍率，把过缓/过陡的高度分布调整到合适起伏
  {
    const sorted = Float32Array.from(natural);
    sorted.sort();
    const p30 = sorted[Math.floor(sorted.length * 0.30)];
    const p60 = sorted[Math.floor(sorted.length * 0.60)];
    const a = clamp(6 / Math.max(0.8, p60 - p30), 0.7, 1.6);
    const b = 15 - a * (p30 + p60) / 2;
    for (let i = 0; i < natural.length; i++) natural[i] = a * natural[i] + b;
  }

  // ---------- 湖盆 / 河道场预计算（分位数自校准，与种子分布无关） ----------
  const lnField = new Float32Array(size * size);
  const rvField = new Float32Array(size * size);
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      const i = x * size + z;
      lnField[i] = fbm2(nLake, x * 0.021 + off[8], z * 0.021 + off[9], 3);
      const wx = fbm2(nWarp, x * 0.014 + off[10], z * 0.014 + off[11], 2) * 22;
      rvField[i] = Math.abs(fbm2(nRiv, (x + wx) * 0.009 + 31.7, (z + wx * 0.6) * 0.009 + 11.3, 2));
    }
  }
  const sortedLn = Float32Array.from(lnField); sortedLn.sort();
  const lakeT = sortedLn[(sortedLn.length * 0.82) | 0];           // 湖盆起始于 top 18%
  const sortedRv = Float32Array.from(rvField); sortedRv.sort();
  const rvFull = sortedRv[(sortedRv.length * 0.07) | 0];          // 7% 面积为完整河道
  const rvBank = Math.max(sortedRv[(sortedRv.length * 0.24) | 0], rvFull * 1.6); // 24% 处河岸消失

  const carveAt = (D) => {
    const out = new Float32Array(size * size);
    for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
        const i = x * size + z;
        let h = natural[i] + D;
        // 湖盆（高海拔减弱，避免山顶怪坑）
        const dep = smoothstep(lakeT, lakeT + 0.3, lnField[i]);
        const altDamp = 0.35 + 0.65 * smoothstep(26, 15, h);
        h -= dep * dep * 10 * altDamp;
        // 河道
        const rf = 1 - smoothstep(rvFull, rvBank, rvField[i]);
        const bed = waterLevel - 1.8;
        h = lerp(h, Math.min(h, bed), rf);
        out[i] = h;
      }
    }
    return out;
  };
  const waterFrac = (field) => {
    let n = 0;
    for (let i = 0; i < field.length; i++) if (field[i] < waterLevel) n++;
    return n / field.length;
  };

  // 二分搜索整体位移，使最终水域比例 ≈ 32%（对任何种子分布都成立）
  let D = 0;
  {
    let lo = -24, hi = 36; // f(D) 单调递减
    for (let i = 0; i < 7; i++) {
      const mid = (lo + hi) / 2;
      if (waterFrac(carveAt(mid)) > 0.32) lo = mid;
      else hi = mid;
    }
    D = (lo + hi) / 2;
  }

  // ---------- 最终高度 ----------
  {
    const field = carveAt(D);
    for (let i = 0; i < field.length; i++) {
      const h = clamp(field[i], 3, SY - 12);
      height[i] = h;
      hmap[i] = Math.round(h);
    }
  }

  // ---------- 水邻域掩码（距离水域 3 格内，用于沙滩判定） ----------
  const nearWater = new Uint8Array(size * size);
  for (let i = 0; i < nearWater.length; i++) nearWater[i] = hmap[i] < waterLevel ? 1 : 0;
  for (let pass = 0; pass < 3; pass++) {
    const next = Uint8Array.from(nearWater);
    for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
        const i = x * size + z;
        if (nearWater[i]) continue;
        for (let dx = -1; dx <= 1 && !next[i]; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            const xx = x + dx, zz = z + dz;
            if (xx < 0 || xx >= size || zz < 0 || zz >= size) continue;
            if (nearWater[xx * size + zz]) { next[i] = 1; break; }
          }
        }
      }
    }
    nearWater.set(next);
  }

  // ---------- 第二遍：铺装地表 ----------
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      const i = x * size + z;
      const h = hmap[i];
      // 坡度：与四邻最大高差
      let slope = 0;
      if (x > 0) slope = Math.max(slope, Math.abs(h - hmap[i - size]));
      if (x < size - 1) slope = Math.max(slope, Math.abs(h - hmap[i + size]));
      if (z > 0) slope = Math.max(slope, Math.abs(h - hmap[i - 1]));
      if (z < size - 1) slope = Math.max(slope, Math.abs(h - hmap[i + 1]));

      const t = nTemp.noise2(x * 0.02 + 77, z * 0.02 + 77); // 温度：决定针叶林
      const snowLine = 33 + hash2(x, z, seedHash) * 3 + t * 3;
      const rockLine = 26 + hash2(x, z, seedHash + 7) * 4;

      let top;
      if (h <= waterLevel) {
        // 水下：深水砂砾/泥，浅水沙
        top = h <= waterLevel - 4
          ? (hash2(x, z, seedHash + 13) < 0.45 ? B.GRAVEL : B.DIRT)
          : B.SAND;
      } else if (h <= waterLevel + 2 && nearWater[i]) {
        top = B.SAND; // 海滩 / 河滩
      } else if (h >= snowLine) {
        top = B.SNOW;
      } else if (h >= rockLine || slope >= 3) {
        top = B.STONE;
      } else if (h >= snowLine - 4 && hash2(x, z, seedHash + 21) < 0.5) {
        top = B.SNOWGRASS;
      } else {
        top = B.GRASS;
      }

      // 填充柱体
      for (let y = 0; y <= h; y++) {
        let b;
        if (y === h) b = top;
        else if (y >= h - 3) {
          b = (top === B.SAND) ? B.SAND
            : (top === B.GRASS || top === B.SNOWGRASS) ? B.DIRT
            : (top === B.GRAVEL) ? B.GRAVEL
            : B.STONE;
        } else {
          b = B.STONE;
        }
        world.set(x, y, z, b);
      }
      // 水体
      if (h < waterLevel) {
        for (let y = h + 1; y <= waterLevel; y++) world.set(x, y, z, B.WATER);
      }
    }
  }

  return { world, height, hmap, waterLevel, size, SY, seedHash };
}

function xmurShort(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
