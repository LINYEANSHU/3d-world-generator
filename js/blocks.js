// ============================================================
// blocks.js — 方块注册表：ID、图集贴图槽位、渲染属性
// ============================================================

// 图集槽位（16×16 格图集中的索引）
export const T = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, SAND: 4,
  LOG_SIDE: 5, LOG_TOP: 6, BIRCH_SIDE: 7, SPRUCE_SIDE: 8, LEAVES: 9,
  LEAVES_SPRUCE: 10, PLANK: 11, PLANK_DARK: 12, COBBLE: 13, BRICK: 14,
  SNOW: 15, SNOW_SIDE: 16, GLASS: 17, GLOW: 18, GRAVEL: 19,
  PATH_TOP: 20, PATH_SIDE: 21, FARMLAND: 22, PUMPKIN_SIDE: 23, PUMPKIN_TOP: 24,
  WATER: 25, TALLGRASS: 26, FLOWER_RED: 27, FLOWER_YELLOW: 28, WHEAT: 29,
  MUSHROOM_RED: 30, MUSHROOM_BROWN: 31, REED: 32, LEAVES_CHERRY: 33,
  MOSSY: 34, HAY_SIDE: 35, HAY_TOP: 36,
};

// 方块 ID
export const B = {
  AIR: 0,
  GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5,
  LOG: 6, LEAVES: 7, SNOWGRASS: 8, SNOW: 9, PLANK: 10,
  COBBLE: 11, LOG_BIRCH: 12, LEAVES_SPRUCE: 13, GLASS: 14, GLOW: 15,
  GRAVEL: 16, PATH: 17, FARMLAND: 18, BRICK: 19, PLANK_DARK: 20,
  PUMPKIN: 21, LOG_SPRUCE: 22, LEAVES_CHERRY: 23,
  MOSSY: 24, HAY: 25,
  // 十字植物（不进体素网格，见 plants）
  TALLGRASS: 30, FLOWER_RED: 31, FLOWER_YELLOW: 32, WHEAT: 33,
  MUSHROOM_RED: 34, MUSHROOM_BROWN: 35, REED: 36,
};

// 方块元数据：six tiles 顺序 [+X, -X, +Y(顶), -Y(底), +Z, -Z]
// solid: 参与碰撞/支撑判断；opaque: 完全遮挡邻面（用于面剔除与 AO）
const DEF = [];
function def(id, name, opts) {
  DEF[id] = { name, solid: true, opaque: true, castShadow: true, ...opts };
}

def(B.AIR, '空气', { solid: false, opaque: false });
def(B.GRASS, '草方块', { top: T.GRASS_TOP, side: T.GRASS_SIDE, bottom: T.DIRT });
def(B.DIRT, '泥土', { all: T.DIRT });
def(B.STONE, '石头', { all: T.STONE });
def(B.SAND, '沙子', { all: T.SAND });
def(B.WATER, '水', { solid: false, opaque: false, castShadow: false });
def(B.LOG, '橡木', { top: T.LOG_TOP, side: T.LOG_SIDE, bottom: T.LOG_TOP });
def(B.LEAVES, '橡树叶', { all: T.LEAVES });
def(B.SNOWGRASS, '雪草方块', { top: T.SNOW, side: T.SNOW_SIDE, bottom: T.DIRT });
def(B.SNOW, '雪块', { all: T.SNOW });
def(B.PLANK, '木板', { all: T.PLANK });
def(B.COBBLE, '圆石', { all: T.COBBLE });
def(B.LOG_BIRCH, '白桦木', { top: T.LOG_TOP, side: T.BIRCH_SIDE, bottom: T.LOG_TOP });
def(B.LEAVES_SPRUCE, '云杉叶', { all: T.LEAVES_SPRUCE });
def(B.GLASS, '玻璃', { all: T.GLASS, opaque: false });
def(B.GLOW, '萤石', { all: T.GLOW });
def(B.GRAVEL, '砂砾', { all: T.GRAVEL });
def(B.PATH, '土径', { top: T.PATH_TOP, side: T.PATH_SIDE, bottom: T.DIRT });
def(B.FARMLAND, '耕地', { top: T.FARMLAND, side: T.DIRT, bottom: T.DIRT });
def(B.BRICK, '红砖', { all: T.BRICK });
def(B.PLANK_DARK, '深色木板', { all: T.PLANK_DARK });
def(B.PUMPKIN, '南瓜', { top: T.PUMPKIN_TOP, side: T.PUMPKIN_SIDE, bottom: T.PUMPKIN_TOP });
def(B.LOG_SPRUCE, '云杉木', { top: T.LOG_TOP, side: T.SPRUCE_SIDE, bottom: T.LOG_TOP });
def(B.LEAVES_CHERRY, '樱花叶', { all: T.LEAVES_CHERRY });
def(B.MOSSY, '苔石', { all: T.MOSSY });
def(B.HAY, '干草块', { top: T.HAY_TOP, side: T.HAY_SIDE, bottom: T.HAY_TOP });

export const BLOCKS = DEF;

// 预计算的 6 面贴图查找表：TILES_LUT[id] = [+X,-X,+Y(顶),-Y(底),+Z,-Z] 的槽位
// 网格化时每方块直接查表返回同一份只读数组，避免每次调用都分配新数组
const TILES_LUT = [];
for (let id = 0; id < DEF.length; id++) {
  const d = DEF[id];
  if (!d) continue;
  TILES_LUT[id] = d.all !== undefined
    ? [d.all, d.all, d.all, d.all, d.all, d.all]
    : [d.side, d.side, d.top, d.bottom, d.side, d.side];
}

// 该方块是否完全遮挡（用于剔除邻面 / AO）
export function isOccluder(id) {
  const d = DEF[id];
  return d !== undefined && d.opaque;
}

// 遮挡查找表：OPAQUE[id] = 1/0（未注册 ID 为 0，与 isOccluder 的 undefined→false 一致）。
// 网格化热路径用它代替 isOccluder() 的对象属性访问，零分支直读。
export const OPAQUE = new Uint8Array(DEF.length);
for (let id = 0; id < DEF.length; id++) {
  const d = DEF[id];
  OPAQUE[id] = d && d.opaque ? 1 : 0;
}
export function isSolid(id) {
  const d = DEF[id];
  return d !== undefined && d.solid;
}

// 方块 → 6 面贴图槽位（查预计算表，返回值只读、共享，勿修改）
export function tilesOf(id) {
  const t = TILES_LUT[id];
  if (t) return t;
  // 兜底：未注册 ID（与旧逻辑一致，逐次构造）
  const d = DEF[id];
  if (d.all !== undefined) {
    const v = d.all;
    return [v, v, v, v, v, v];
  }
  const { top, side, bottom } = d;
  return [side, side, top, bottom, side, side];
}

// 植物类型定义（十字交叉面片，实例化渲染）
export const PLANTS = {
  [B.TALLGRASS]: { tile: T.TALLGRASS, h: 0.85, tint: 1.0 },
  [B.FLOWER_RED]: { tile: T.FLOWER_RED, h: 0.72, tint: 1.0 },
  [B.FLOWER_YELLOW]: { tile: T.FLOWER_YELLOW, h: 0.72, tint: 1.0 },
  [B.WHEAT]: { tile: T.WHEAT, h: 0.95, tint: 1.0 },
  [B.MUSHROOM_RED]: { tile: T.MUSHROOM_RED, h: 0.45, tint: 1.0 },
  [B.MUSHROOM_BROWN]: { tile: T.MUSHROOM_BROWN, h: 0.45, tint: 1.0 },
  [B.REED]: { tile: T.REED, h: 1.0, tint: 1.05 },
};
