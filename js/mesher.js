// ============================================================
// mesher.js — 区块网格生成
// · 面剔除：相邻方块遮挡的内部面不生成
// · 合并网格：整个区块合并为一份 BufferGeometry（solid + water）
// · 逐顶点 AO（环境光遮蔽）+ 四叉翻转消除各向异性
// · 输出供实例化渲染的十字植物几何
// ============================================================
import * as THREE from 'three';
import { B, OPAQUE, tilesOf } from './blocks.js';
import { hash3 } from './noise.js';

export const CHUNK = 16;
const TILE_N = 16;        // 图集每行列数
const UV_TILE = 1 / TILE_N;
const UV_EPS = 0.0005;    // 防止采样越入相邻贴图

// 六个面：法线 n、切向 U/V（保证 U×V=n，CCW 绕序）、起始角 O
// 顶点顺序：O, O+U, O+U+V, O+V；对应 (a,b)=(0,0),(1,0),(1,1),(0,1)
const FACES = [
  { n: [1, 0, 0], U: [0, 0, -1], V: [0, 1, 0], O: [1, 0, 1] },   // +X
  { n: [-1, 0, 0], U: [0, 0, 1], V: [0, 1, 0], O: [0, 0, 0] },   // -X
  { n: [0, 1, 0], U: [0, 0, 1], V: [1, 0, 0], O: [0, 1, 0] },   // +Y
  { n: [0, -1, 0], U: [1, 0, 0], V: [0, 0, 1], O: [0, 0, 0] },   // -Y
  { n: [0, 0, 1], U: [1, 0, 0], V: [0, 1, 0], O: [0, 0, 1] },   // +Z
  { n: [0, 0, -1], U: [-1, 0, 0], V: [0, 1, 0], O: [1, 0, 0] },  // -Z
];

const AO_BRIGHT = [0.42, 0.62, 0.82, 1.0]; // AO 等级 0-3 → 亮度

// 每体素 6 邻方向读取暂存（模块级复用，避免逐体素分配临时对象）
// meshChunk 为同步非重入调用，暂存安全
const NB = new Uint8Array(6);
// AO 等级暂存（emitSolidFace 非重入，同样安全）
const AO_SCRATCH = new Uint8Array(4);
// 当前列 3×3 水平邻域的列基址（含中心），AO 采样直读用：
// AO_NB[(dx+1)*3+(dz+1)] = (xx*sz+zz)*sy，水平越界记 -1（语义 = 空气）
const AO_NB = new Int32Array(9);

// 生成一个区块的网格数据（绝对坐标）
export function meshChunk(world, cx, cz, seed) {
  const { sx, sy, sz, data } = world;
  const x0 = cx * CHUNK, z0 = cz * CHUNK;

  const solid = { pos: [], nor: [], uv: [], col: [], idx: [] };
  const water = { pos: [], nor: [], uv: [], col: [], idx: [], wave: [] };

  for (let lx = 0; lx < CHUNK; lx++) {
    const x = x0 + lx;
    for (let lz = 0; lz < CHUNK; lz++) {
      const z = z0 + lz;
      const colBase = (x * sz + z) * sy;
      // 四个水平邻列的列基址；-1 表示越界（语义与 world.get 一致：水平越界为空气）
      const nbXp = x + 1 < sx ? colBase + sz * sy : -1;
      const nbXm = x > 0 ? colBase - sz * sy : -1;
      const nbZp = z + 1 < sz ? colBase + sy : -1;
      const nbZm = z > 0 ? colBase - sy : -1;
      // 3×3 邻域列基址（AO 采样用）：dx/dz ∈ {-1,0,1}，越界记 -1
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        for (let dz = -1; dz <= 1; dz++) {
          const zz = z + dz;
          AO_NB[(dx + 1) * 3 + (dz + 1)] =
            (xx >= 0 && xx < sx && zz >= 0 && zz < sz) ? (xx * sz + zz) * sy : -1;
        }
      }
      for (let y = 0; y < sy; y++) {
        const b = data[colBase + y];
        if (b === B.AIR) continue;

        if (b === B.WATER) { emitWater(world, x, y, z, water); continue; }

        // 6 邻快速读取（与 world.get 完全等价：y<0 为石头，其余越界为空气）
        NB[0] = nbXp >= 0 ? data[nbXp + y] : B.AIR;
        NB[1] = nbXm >= 0 ? data[nbXm + y] : B.AIR;
        NB[2] = y < sy - 1 ? data[colBase + y + 1] : B.AIR;
        NB[3] = y > 0 ? data[colBase + y - 1] : B.STONE;
        NB[4] = nbZp >= 0 ? data[nbZp + y] : B.AIR;
        NB[5] = nbZm >= 0 ? data[nbZm + y] : B.AIR;

        const tiles = tilesOf(b);
        const jitter = 0.945 + hash3(x, y, z, seed) * 0.1;

        for (let f = 0; f < 6; f++) {
          const nb = NB[f];
          // 可见性：邻块不遮挡即可见（玻璃与玻璃相邻时剔除）
          // OPAQUE 查找表与 isOccluder(nb) 等价（nb 均为已注册方块 ID）
          if (OPAQUE[nb]) continue;
          if (b === B.GLASS && nb === B.GLASS) continue;

          emitSolidFace(solid, data, sy, x, y, z, f, tiles[f], jitter);
        }
      }
    }
  }

  return { solid, water };
}

// AO 遮挡直读：与旧 occl(x+dx, y+dy, z+dz) = isOccluder(world.get(...)) 完全等价
// 判断顺序与 world.get 逐条对应：先 y<0（无条件 STONE，即使水平同时越界），
// 再水平越界（AIR），再 y>=sy（AIR），最后数组直读
function aoBlocked(data, sy, y, dx, dy, dz) {
  const yy = y + dy;
  if (yy < 0) return 1;
  const base = AO_NB[(dx + 1) * 3 + (dz + 1)];
  if (base < 0) return 0;
  if (yy >= sy) return 0;
  return OPAQUE[data[base + yy]];
}

function emitSolidFace(buf, data, sy, x, y, z, f, tile, jitter) {
  const F = FACES[f];
  const base = buf.pos.length / 3;
  const tu = (tile % TILE_N) * UV_TILE;
  const tv = 1 - (Math.floor(tile / TILE_N) + 1) * UV_TILE;

  const ao = AO_SCRATCH; // 复用模块级暂存（本函数非重入，调用后立即消费）
  for (let k = 0; k < 4; k++) {
    const a = (k === 1 || k === 2) ? 1 : 0;
    const b = (k === 2 || k === 3) ? 1 : 0;
    const sa = a ? 1 : -1, sb = b ? 1 : -1;

    // AO 采样：面外一层，两侧 + 角（相对偏移各分量 ∈ {-1,0,1}，n/U/V 各占一轴）
    const s1 = aoBlocked(data, sy, y, F.n[0] + F.U[0] * sa, F.n[1] + F.U[1] * sa, F.n[2] + F.U[2] * sa);
    const s2 = aoBlocked(data, sy, y, F.n[0] + F.V[0] * sb, F.n[1] + F.V[1] * sb, F.n[2] + F.V[2] * sb);
    const c = aoBlocked(
      data, sy, y,
      F.n[0] + F.U[0] * sa + F.V[0] * sb,
      F.n[1] + F.U[1] * sa + F.V[1] * sb,
      F.n[2] + F.U[2] * sa + F.V[2] * sb,
    );
    ao[k] = (s1 && s2) ? 0 : 3 - (s1 + s2 + c);

    const px = x + F.O[0] + F.U[0] * a + F.V[0] * b;
    const py = y + F.O[1] + F.U[1] * a + F.V[1] * b;
    const pz = z + F.O[2] + F.U[2] * a + F.V[2] * b;

    buf.pos.push(px, py, pz);
    buf.nor.push(F.n[0], F.n[1], F.n[2]);
    const br = AO_BRIGHT[ao[k]] * jitter;
    buf.col.push(br, br, br);
    buf.uv.push(
      tu + UV_EPS + a * (UV_TILE - 2 * UV_EPS),
      tv + UV_EPS + b * (UV_TILE - 2 * UV_EPS),
    );
  }

  // AO 四叉翻转：沿更亮的对角线剖分，避免插值瑕疵
  if (ao[0] + ao[2] >= ao[1] + ao[3]) {
    buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  } else {
    buf.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  }
}

function emitWater(world, x, y, z, buf) {
  const above = world.get(x, y + 1, z);
  const isSurface = above !== B.WATER;
  const topY = isSurface ? 0.875 : 1;

  for (let f = 0; f < 6; f++) {
    const F = FACES[f];
    const nb = world.get(x + F.n[0], y + F.n[1], z + F.n[2]);
    let visible;
    if (f === 2) visible = nb !== B.WATER;          // 顶面：上方非水即可见
    else if (f === 3) visible = nb === B.AIR;       // 底面：仅悬空时可见
    else visible = nb === B.AIR || nb === B.GLASS;  // 侧面：邻为空气/玻璃
    if (!visible) continue;

    const base = buf.pos.length / 3;
    for (let k = 0; k < 4; k++) {
      const a = (k === 1 || k === 2) ? 1 : 0;
      const b = (k === 2 || k === 3) ? 1 : 0;
      let py = y + F.O[1] + F.U[1] * a + F.V[1] * b;
      if (py === y + 1 && topY !== 1) py = y + topY;
      const px = x + F.O[0] + F.U[0] * a + F.V[0] * b;
      const pz = z + F.O[2] + F.U[2] * a + F.V[2] * b;
      buf.pos.push(px, py, pz);
      buf.nor.push(F.n[0], F.n[1], F.n[2]);
      buf.col.push(1, 1, 1);
      buf.uv.push(a, b);
      buf.wave.push(py !== Math.round(py) ? 1 : 0);
    }
    buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

// 十字植物几何（两片对角交叉面片，法线朝上获得柔和光照）
// color 属性全 1：配合 plantMat.vertexColors 使 InstancedMesh 的 instanceColor 生效
export function buildCrossGeometry(tileIdx, h) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const tu = (tileIdx % TILE_N) * UV_TILE;
  const tv = 1 - (Math.floor(tileIdx / TILE_N) + 1) * UV_TILE;
  const e = 0.146, E = 1 - 0.146;

  const quads = [
    [[e, e], [E, E]],
    [[e, E], [E, e]],
  ];
  for (const [[x1, z1], [x2, z2]] of quads) {
    const base = pos.length / 3;
    pos.push(x1, 0, z1, x2, 0, z2, x2, h, z2, x1, h, z1);
    for (let i = 0; i < 4; i++) { nor.push(0, 1, 0); col.push(1, 1, 1); }
    uv.push(tu + UV_EPS, tv + UV_EPS,
      tu + UV_TILE - UV_EPS, tv + UV_EPS,
      tu + UV_TILE - UV_EPS, tv + UV_TILE - UV_EPS,
      tu + UV_EPS, tv + UV_TILE - UV_EPS);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}
