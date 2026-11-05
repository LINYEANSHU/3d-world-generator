// ============================================================
// world.js — 体素世界数据结构（列主序 Uint8Array，垂直访问连续）
// ============================================================
import { B } from './blocks.js';

export class World {
  constructor(sx, sz, sy) {
    this.sx = sx;   // x 方向方块数
    this.sz = sz;   // z 方向方块数
    this.sy = sy;   // 高度
    this.data = new Uint8Array(sx * sz * sy);
    // 占用掩码：村庄/道路/树干等保护标记，防止植被覆盖
    this.flags = new Uint8Array(sx * sz);
  }

  idx(x, y, z) { return (x * this.sz + z) * this.sy + y; }

  // 越界规则：y<0 视为实心（避免渲染世界底面），
  // 水平越界与 y>=sy 视为空气（露出微缩世界的立体断面）
  get(x, y, z) {
    if (y < 0) return B.STONE;
    if (x < 0 || x >= this.sx || z < 0 || z >= this.sz || y >= this.sy) return B.AIR;
    return this.data[(x * this.sz + z) * this.sy + y];
  }

  set(x, y, z, id) {
    if (x < 0 || x >= this.sx || z < 0 || z >= this.sz || y < 0 || y >= this.sy) return;
    this.data[(x * this.sz + z) * this.sy + y] = id;
  }

  // 列最高非空气方块高度（不含水）-1 表示空列
  columnTop(x, z) {
    if (x < 0 || x >= this.sx || z < 0 || z >= this.sz) return -1;
    const base = (x * this.sz + z) * this.sy;
    for (let y = this.sy - 1; y >= 0; y--) {
      const b = this.data[base + y];
      if (b !== B.AIR && b !== B.WATER) return y;
    }
    return -1;
  }

  flag(x, z, v) {
    if (x < 0 || x >= this.sx || z < 0 || z >= this.sz) return;
    this.flags[x * this.sz + z] = v;
  }
  getFlag(x, z) {
    if (x < 0 || x >= this.sx || z < 0 || z >= this.sz) return 0;
    return this.flags[x * this.sz + z];
  }

  // 世界数据校验和（用于验证相同 seed 可复现）
  checksum() {
    let h = 2166136261 >>> 0;
    const d = this.data;
    for (let i = 0; i < d.length; i++) {
      h ^= d[i];
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }
}
