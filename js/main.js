// ============================================================
// main.js — 应用编排：UI 绑定 / 世界生成流程 / 统计
// ============================================================
import * as THREE from 'three';
import { buildAtlas, buildWaterTexture } from './atlas.js';
import { generateTerrain } from './generator.js';
import { decorateWorld } from './structures.js';
import { meshChunk, CHUNK } from './mesher.js';
import { Viewer } from './scene.js';
import { seededRandom } from './noise.js';
import { t, getLang, onLangChange } from './i18n.js';

async function boot() {

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const seedInput = $('seedInput');
const btnGenerate = $('btnGenerate');
const btnRandom = $('btnRandom');
const btnCopySeed = $('btnCopySeed');
const btnShareLink = $('btnShareLink');
const btnFly = $('btnFly');
const chkRotate = $('chkRotate');
const selAtmo = $('paramAtmo');
const overlay = $('overlay');
const overlayText = $('overlayText');
const overlayBar = $('overlayBar');

const sliderBindings = [
  { input: $('paramAmp'), label: $('valAmp'), fmt: v => v.toFixed(1) },
  { input: $('paramWater'), label: $('valWater'), fmt: v => (v > 0 ? '+' + v : '' + v) },
  { input: $('paramVeg'), label: $('valVeg'), fmt: v => v.toFixed(1) },
  { input: $('paramVillage'), label: $('valVillage'), fmt: v => '' + v },
  { input: $('paramSize'), label: $('valSize'), fmt: v => '' + v },
];

// ---------- 纹理（与种子无关，固定视觉风格） ----------
const atlasTex = buildAtlas('block-world-v1');
const waterTex = buildWaterTexture('block-water-v1');

// ---------- 场景 ----------
const viewer = new Viewer(canvas, atlasTex, waterTex);
viewer.onStats = ({ fps, calls, tris }) => {
  $('statFps').textContent = fps;
  $('statCalls').textContent = calls;
  $('statTris').textContent = tris >= 1000 ? (tris / 1000).toFixed(0) + 'k' : tris;
};
viewer.onFlyChange = (on) => {
  btnFly.classList.toggle('active', on);
  btnFly.textContent = on ? t('btn.fly.exit') : t('btn.fly');
};

btnFly.addEventListener('click', () => viewer.toggleFly(!viewer.fly.on));
chkRotate.addEventListener('change', () => viewer.setAutoRotate(chkRotate.checked));

// 天空氛围（默认「清爽白昼」与初始状态完全一致）
const applyAtmo = () => {
  viewer.setAtmosphere(selAtmo.value);
  // 去掉选项里的「（默认）/(default)」括注，仅保留氛围名
  $('valAtmo').textContent = selAtmo.options[selAtmo.selectedIndex].text.replace(/\s*[（(].*?[）)]\s*/, '');
};
selAtmo.addEventListener('change', applyAtmo);
applyAtmo();

// 语言切换：刷新所有运行时拼装的文案
onLangChange(() => {
  btnFly.textContent = viewer.fly.on ? t('btn.fly.exit') : t('btn.fly');
  applyAtmo();
  if (_lastSeedUsed) $('worldName').textContent = worldName(_lastSeedUsed);
  if (!overlay.classList.contains('hidden') && _lastProgressKey) {
    overlayText.textContent = t(_lastProgressKey);
  }
});

// ---------- 世界名称（由种子派生，小彩蛋） ----------
const SYL = ['lo', 'ri', 'an', 'tha', 'mel', 'dor', 'win', 'gal', 'fen', 'bel', 'nor', 'sil', 'ar', 'eth'];

function worldName(seedStr) {
  const r = seededRandom(seedStr, 'name');
  const pick = (arr) => arr[(r() * arr.length) | 0];
  const syl = pick(SYL) + pick(SYL) + (r() < 0.5 ? pick(SYL) : '');
  const a = t('name.a');
  const b = t('name.b');
  const land = getLang() === 'en'
    ? `${pick(a)} ${pick(b)}`
    : `${pick(a)}${pick(b)}`;
  return `${land} · ${syl[0].toUpperCase() + syl.slice(1)}`;
}

// ---------- 参数 ----------
function readParams() {
  return {
    seedStr: seedInput.value.trim() || String((Math.random() * 1e9) | 0),
    size: parseInt($('paramSize').value, 10),
    mountainAmp: parseFloat($('paramAmp').value),
    waterDelta: parseInt($('paramWater').value, 10),
    vegetation: parseFloat($('paramVeg').value),
    villageCount: parseInt($('paramVillage').value, 10),
  };
}

// 滑块填充色与数值联动
function refreshSliders() {
  for (const { input, label, fmt } of sliderBindings) {
    const min = parseFloat(input.min), max = parseFloat(input.max);
    const v = parseFloat(input.value);
    input.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`);
    label.textContent = fmt(v);
  }
}
sliderBindings.forEach(b => b.input.addEventListener('input', refreshSliders));
refreshSliders();

// ---------- 生成流程 ----------
let generating = false;
let _lastTerra = null;
let _lastDeco = null;

// MessageChannel 让出主线程：在后台标签页中也不会被节流（rAF 在隐藏页会永久停摆）
const nextFrame = () => new Promise((resolve) => {
  const ch = new MessageChannel();
  ch.port1.onmessage = () => { ch.port1.close(); ch.port2.close(); resolve(); };
  ch.port2.postMessage(0);
});
let _lastProgressKey = 'overlay.init';
function setProgress(key, pct) {
  _lastProgressKey = key;
  overlayText.textContent = t(key);
  overlayBar.style.width = `${Math.round(pct * 100)}%`;
}

async function regenerate() {
  if (generating) return;
  generating = true;
  btnGenerate.disabled = true;
  overlay.classList.remove('hidden');
  setProgress('overlay.seed', 0.02);
  await nextFrame();
  await nextFrame();

  const t0 = performance.now();
  try {
    const p = readParams();
    seedInput.value = p.seedStr;
    _lastSeedUsed = p.seedStr;
    $('worldName').textContent = worldName(p.seedStr);

    // 1) 地形
    setProgress('overlay.terrain', 0.08);
    await nextFrame();
    const terra = generateTerrain(p);
    _lastTerra = terra;

    // 2) 结构
    setProgress('overlay.structures', 0.22);
    await nextFrame();
    const deco = decorateWorld(terra, p);
    _lastDeco = deco;

    // 3) 网格
    setProgress('overlay.mesh', 0.3);
    await nextFrame();
    viewer.clearWorld();
    const center = new THREE.Vector3(p.size / 2, 10, p.size / 2);
    viewer.setWorldSize(p.size, center);

    const n = p.size / CHUNK;
    let done = 0;
    for (let cx = 0; cx < n; cx++) {
      for (let cz = 0; cz < n; cz++) {
        viewer.addChunk(meshChunk(terra.world, cx, cz, terra.seedHash));
        done++;
      }
      setProgress('overlay.mesh', 0.3 + 0.6 * (done / (n * n)));
      await nextFrame();
    }

    // 4) 植被实例
    setProgress('overlay.plants', 0.94);
    await nextFrame();
    viewer.addPlants(deco.plants);
    viewer.refreshShadow();

    // 5) 相机聚焦
    const focus = deco.villages[0] || { x: p.size / 2, z: p.size / 2 };
    viewer.focusOn(focus.x, 15, focus.z, p.size);

    // 统计
    let blocks = 0;
    for (let i = 0; i < terra.world.data.length; i++) {
      if (terra.world.data[i] !== 0) blocks++;
    }
    const ms = Math.round(performance.now() - t0);
    $('statBlocks').textContent = blocks >= 1000 ? (blocks / 1000).toFixed(0) + 'k' : blocks;
    $('statTime').textContent = ms + 'ms';
    $('statHash').textContent = terra.world.checksum();
    _lastParams = p;
    try { history.replaceState(null, '', '#' + encodeShareHash(p)); } catch { /* file:// 某些环境不允许，忽略 */ }
    console.log(`[世界] seed="${p.seedStr}" size=${p.size} blocks=${blocks} checksum=${terra.world.checksum()} time=${ms}ms villages=${deco.villages.length} towers=${deco.towers.length} ruins=${deco.ruins.length}`);
  } catch (err) {
    console.error('世界生成失败：', err);
    _lastProgressKey = null;
    overlayText.textContent = t('error.generate') + err.message;
    await new Promise(r => setTimeout(r, 1800));
  }

  overlay.classList.add('hidden');
  btnGenerate.disabled = false;
  generating = false;
}

// ---------- 事件 ----------
btnGenerate.addEventListener('click', regenerate);
btnRandom.addEventListener('click', () => {
  seedInput.value = String((Math.random() * 1e9) | 0);
  regenerate();
});
seedInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') regenerate();
});

// 复制文本：优先 Clipboard API，非安全上下文（file:// / http:）退回 execCommand
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand && document.execCommand('copy');
      ta.remove();
      return !!ok;
    } catch { return false; }
  }
}

// 按钮 ✓/✕ 短暂反馈（结束后按当前语言恢复标题）
function flashBtn(btn, ok, origText, titleKey) {
  btn.textContent = ok ? '✓' : '✕';
  btn.title = ok ? t('copy.ok') : t('copy.fail');
  clearTimeout(btn._flashTimer);
  btn._flashTimer = setTimeout(() => {
    btn.textContent = origText;
    btn.title = t(titleKey);
  }, 1200);
}

btnCopySeed.addEventListener('click', async () => {
  const text = seedInput.value.trim();
  if (!text) return;
  flashBtn(btnCopySeed, await copyText(text), '📋', 'tip.copySeed');
});

// ---------- 分享链接（URL hash 编码种子 + 全部生成参数） ----------
let _lastParams = null;
let _lastSeedUsed = null;
function encodeShareHash(p) {
  const q = new URLSearchParams();
  q.set('seed', p.seedStr);
  q.set('amp', String(p.mountainAmp));
  q.set('water', String(p.waterDelta));
  q.set('veg', String(p.vegetation));
  q.set('vill', String(p.villageCount));
  q.set('size', String(p.size));
  return q.toString();
}
function decodeShareHash() {
  if (!location.hash || location.hash.length < 2) return null;
  try {
    const q = new URLSearchParams(location.hash.slice(1));
    if (!q.has('seed')) return null;
    const num = (k, def, lo, hi) => {
      const v = parseFloat(q.get(k));
      return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;
    };
    const sizes = [96, 128, 160, 192];
    const sizeRaw = num('size', 128, 32, 4096);
    return {
      seedStr: q.get('seed').slice(0, 64),
      mountainAmp: num('amp', 1, 0, 2),
      waterDelta: num('water', 0, -3, 4),
      vegetation: num('veg', 1, 0, 2),
      villageCount: Math.round(num('vill', 2, 0, 3)),
      size: sizes.includes(sizeRaw) ? sizeRaw : 128,
    };
  } catch { return null; }
}

btnShareLink.addEventListener('click', async () => {
  const p = _lastParams || readParams();
  const url = location.origin === 'null' || !location.origin
    ? location.href.split('#')[0] + '#' + encodeShareHash(p)
    : location.origin + location.pathname + '#' + encodeShareHash(p);
  flashBtn(btnShareLink, await copyText(url), '🔗', 'tip.share');
});

// ---------- 启动 ----------
{
  const shared = decodeShareHash();
  if (shared) {
    seedInput.value = shared.seedStr;
    $('paramAmp').value = shared.mountainAmp;
    $('paramWater').value = shared.waterDelta;
    $('paramVeg').value = shared.vegetation;
    $('paramVillage').value = shared.villageCount;
    $('paramSize').value = shared.size;
  }
}
refreshSliders();
seedInput.value = seedInput.value.trim() || '2026';
regenerate();

// 调试句柄（自动化测试 / 控制台调试用）
window.__app = {
  viewer, regenerate, readParams,
  get terra() { return _lastTerra; },
  get deco() { return _lastDeco; },
  get villages() { return _lastDeco ? _lastDeco.villages : []; },
};
}

boot().catch((error) => {
  document.getElementById('overlay').classList.add('hidden');
  const message = document.createElement('p');
  message.className = 'startup-error';
  message.setAttribute('role', 'alert');
  const update = () => { message.textContent = getLang() === 'en'
    ? 'The 3D view could not start. WebGL may be unavailable. Your saved links are unchanged; try reopening in a compatible browser.'
    : '三维视图未能启动，可能是 WebGL 不可用。分享链接未受影响，可使用支持 WebGL 的浏览器重新打开。'; };
  update(); onLangChange(update);
  document.querySelector('.panel-head').after(message);
  document.querySelectorAll('#panel button:not(#btnLang), #panel input, #panel select').forEach(el => { el.disabled = true; });
  console.warn('World view unavailable:', error.message);
});
