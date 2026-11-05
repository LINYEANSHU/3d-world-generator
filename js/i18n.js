// ============================================================
// i18n.js — 界面多语言（中文 / English）
// 默认跟随浏览器语言，选择持久化到 localStorage。
// 静态文本：DOM 节点带 data-i18n / data-i18n-title / data-i18n-placeholder
// 动态文本：模块消费方调用 t(key)，并在 onLangChange 回调里刷新
// ============================================================

const LS_KEY = 'block-world.lang';

const DICT = {
  zh: {
    'app.title': '方块世界生成器',

    'label.seed': '世界种子（Seed）',
    'ph.seed': '输入任意种子…',
    'tip.copySeed': '复制种子',
    'tip.share': '复制分享链接（含全部参数）',
    'tip.random': '随机种子',
    'btn.generate': '✦ 生成世界',

    'label.amp': '地形起伏',
    'label.water': '水位',
    'label.veg': '植被密度',
    'label.village': '村庄数量',
    'label.size': '世界大小',
    'label.atmo': '天空氛围',

    'atmo.day': '清爽白昼（默认）',
    'atmo.dusk': '暖阳黄昏',
    'atmo.overcast': '烟雨迷蒙',

    'chk.rotate': '自动环绕',
    'btn.fly': '✈ 飞行模式（F）',
    'btn.fly.exit': '✈ 退出飞行（F / ESC）',

    'stat.fps': 'FPS',
    'stat.tris': '三角面',
    'stat.calls': 'Draw Call',
    'stat.blocks': '方块数',
    'stat.time': '生成耗时',
    'stat.hash': '校验和',

    'help.orbit': '左键旋转 · 右键平移 · 滚轮缩放',
    'help.fly': '飞行模式：WASD 移动 · 空格/Shift 升降 · ESC 退出',

    'overlay.init': '正在塑造大陆…',
    'overlay.seed': '正在读取种子…',
    'overlay.terrain': '正在塑造大陆与海洋…',
    'overlay.structures': '正在种植森林、规划村庄…',
    'overlay.mesh': '正在构建区块网格…',
    'overlay.plants': '正在栽种花草…',

    'error.generate': '生成失败：',
    'copy.ok': '已复制',
    'copy.fail': '复制失败，请手动复制',
    'tip.lang': '切换语言',

    // 世界名彩蛋（顺序与 zh 数组一一对应，保证同种子同名）
    'name.a': ['苍翠', '微风', '晨雾', '远山', '碧波', '金穗', '星落', '松涛', '白桦', '云影', '鹿鸣', '湖光', '赤霞', '青苔'],
    'name.b': ['平原', '山谷', '林地', '湖畔', '丘陵', '河湾', '高地', '草甸', '群峰', '半岛', '溪谷', '海岸'],
  },

  en: {
    'app.title': 'Block World Generator',

    'label.seed': 'World Seed',
    'ph.seed': 'Enter any seed…',
    'tip.copySeed': 'Copy seed',
    'tip.share': 'Copy share link (includes all parameters)',
    'tip.random': 'Random seed',
    'btn.generate': '✦ Generate World',

    'label.amp': 'Terrain Relief',
    'label.water': 'Water Level',
    'label.veg': 'Vegetation Density',
    'label.village': 'Villages',
    'label.size': 'World Size',
    'label.atmo': 'Atmosphere',

    'atmo.day': 'Crisp Day (default)',
    'atmo.dusk': 'Golden Dusk',
    'atmo.overcast': 'Misty Rain',

    'chk.rotate': 'Auto-orbit',
    'btn.fly': '✈ Fly Mode (F)',
    'btn.fly.exit': '✈ Exit Fly (F / ESC)',

    'stat.fps': 'FPS',
    'stat.tris': 'Tris',
    'stat.calls': 'Draw Calls',
    'stat.blocks': 'Blocks',
    'stat.time': 'Gen Time',
    'stat.hash': 'Checksum',

    'help.orbit': 'Left-drag rotate · Right-drag pan · Scroll to zoom',
    'help.fly': 'Fly mode: WASD to move · Space/Shift up & down · ESC to exit',

    'overlay.init': 'Shaping the continent…',
    'overlay.seed': 'Reading the seed…',
    'overlay.terrain': 'Shaping continents and oceans…',
    'overlay.structures': 'Growing forests, laying out villages…',
    'overlay.mesh': 'Building chunk meshes…',
    'overlay.plants': 'Planting flowers and grass…',

    'error.generate': 'Generation failed: ',
    'copy.ok': 'Copied',
    'copy.fail': 'Copy failed — please copy manually',
    'tip.lang': 'Switch language',

    // World-name easter egg (same order/length as zh so a seed picks the same slot)
    'name.a': ['Verdant', 'Breeze', 'Mistveil', 'Farpeak', 'Azure', 'Golden', 'Starfall', 'Pinecrest', 'Birch', 'Cloudshadow', 'Elkhollow', 'Lakelight', 'Emberfall', 'Moss'],
    'name.b': ['Plains', 'Vale', 'Woods', 'Lakeside', 'Downs', 'Riverbend', 'Highlands', 'Meadow', 'Peaks', 'Peninsula', 'Glen', 'Coast'],
  },
};

let current = detect();
const listeners = [];

function detect() {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch { /* 隐私模式等场景下 localStorage 不可用，忽略 */ }
  const list = (navigator.languages && navigator.languages.length)
    ? navigator.languages
    : [navigator.language || 'en'];
  for (const tag of list) {
    if (/^zh/i.test(tag)) return 'zh';
  }
  return 'en';
}

/** 取当前语言的文案；缺失时回退到中文，再回退到 key 本身 */
export function t(key) {
  const v = DICT[current][key];
  if (v !== undefined) return v;
  const fb = DICT.zh[key];
  return fb !== undefined ? fb : key;
}

export function getLang() {
  return current;
}

export function onLangChange(fn) {
  listeners.push(fn);
}

/** 应用到带 data-i18n* 属性的静态 DOM 节点 */
export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
}

function updateLangButton() {
  const btn = document.getElementById('btnLang');
  if (!btn) return;
  // 按钮展示「可切换到的语言」
  btn.textContent = current === 'zh' ? '🌐 EN' : '🌐 中文';
}

export function setLang(lang) {
  if (!DICT[lang] || lang === current) return;
  current = lang;
  try { localStorage.setItem(LS_KEY, lang); } catch { /* 忽略 */ }
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  updateLangButton();
  applyStatic();
  for (const fn of listeners) {
    try { fn(current); } catch (e) { console.error(e); }
  }
}

// ---------- 模块初始化 ----------
document.documentElement.lang = current === 'zh' ? 'zh-CN' : 'en';
updateLangButton();
applyStatic();

const btnLang = document.getElementById('btnLang');
if (btnLang) {
  btnLang.addEventListener('click', () => {
    setLang(current === 'zh' ? 'en' : 'zh');
  });
}

// 调试句柄（自动化测试 / 控制台调试用）
window.__i18n = { t, setLang, getLang };
