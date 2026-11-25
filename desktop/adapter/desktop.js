(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const seed = byId('seedInput');
  const share = byId('btnShareLink');
  const language = byId('btnLang');
  const paramsByKey = {
    amp: 'paramAmp',
    water: 'paramWater',
    veg: 'paramVeg',
    vill: 'paramVillage',
    size: 'paramSize',
  };
  const prefix = 'blockworld:#';
  const icons = new Map([
    [byId('btnCopySeed'), ['📋', '<rect x="8" y="8" width="10" height="11" rx="1.5"/><path d="M14 8V5.5A1.5 1.5 0 0 0 12.5 4h-7A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15H8"/>']],
    [share, ['🔗', '<path d="M9 14.5 14.5 9m-5 8-.8.8a3.4 3.4 0 0 1-4.8-4.8l3.4-3.4a3.4 3.4 0 0 1 4.8 0m-.6 4.4a3.4 3.4 0 0 0 4.8 0l3.4-3.4a3.4 3.4 0 0 0-4.8-4.8l-.8.8"/>']],
    [byId('btnRandom'), ['🎲', '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 8h.01M12 12h.01M16 16h.01"/>']],
  ]);

  function updateButtons() {
    for (const [button, [original, path]] of icons) {
      if (button.textContent.trim() === original) {
        button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
      }
      if (button.title) button.setAttribute('aria-label', button.title);
    }
    const label = language.textContent.replace('🌐', '').trim();
    if (language.textContent !== label) language.textContent = label;
    if (language.title) language.setAttribute('aria-label', language.title);
  }

  function setShareTitle() {
    share.title = document.documentElement.lang.startsWith('zh')
      ? '复制世界代码（粘贴到种子栏即可打开）'
      : 'Copy world code (paste into the seed field to open)';
  }

  async function copy(code) {
    try {
      await navigator.clipboard.writeText(code);
      return true;
    } catch {
      const field = document.createElement('textarea');
      const focused = document.activeElement;
      field.value = code;
      field.style.cssText = 'position:fixed; opacity:0; pointer-events:none';
      document.body.append(field);
      field.select();
      try {
        return document.execCommand('copy');
      } finally {
        field.remove();
        focused?.focus({ preventScroll: true });
      }
    }
  }

  function openCode(code) {
    const value = code.trim();
    if (!value.startsWith(prefix)) return false;
    const params = new URLSearchParams(value.slice(prefix.length));
    const worldSeed = params.get('seed')?.trim();
    if (!worldSeed || !window.__app || byId('btnGenerate').disabled) return false;
    seed.value = worldSeed.slice(0, 64);
    for (const [key, id] of Object.entries(paramsByKey)) {
      const raw = params.get(key);
      if (raw === null || raw.trim() === '' || !Number.isFinite(Number(raw))) continue;
      const input = byId(id);
      input.value = raw;
      input.dispatchEvent(new Event('input'));
    }
    window.__app.regenerate();
    return true;
  }

  function configureShare() {
    setShareTitle();
    let feedbackTimer;
    share.addEventListener('click', async (event) => {
      event.stopImmediatePropagation();
      if (!location.hash.includes('seed=')) return;
      let copied = false;
      try {
        copied = await copy(prefix + location.hash.slice(1));
      } catch {
        // Keep the interactive feedback when clipboard access is unavailable.
      }
      clearTimeout(feedbackTimer);
      share.textContent = copied ? '✓' : '×';
      share.title = document.documentElement.lang.startsWith('zh')
        ? (copied ? '世界代码已复制' : '无法复制世界代码')
        : (copied ? 'World code copied' : 'Could not copy the world code');
      feedbackTimer = setTimeout(() => {
        share.textContent = icons.get(share)[0];
        setShareTitle();
      }, 1200);
    }, { capture: true });

    seed.addEventListener('paste', (event) => {
      if (openCode(event.clipboardData?.getData('text') || '')) event.preventDefault();
    });
    seed.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !openCode(seed.value)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, { capture: true });

    new MutationObserver(setShareTitle).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang'],
    });
  }

  function fitViewer() {
    const viewer = window.__app?.viewer;
    if (!viewer) return;
    const canvas = byId('scene');
    window.removeEventListener('resize', viewer._onResize);
    viewer._onResize = () => {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      viewer.camera.aspect = width / height;
      viewer.camera.updateProjectionMatrix();
      viewer.renderer.setSize(width, height, false);
    };
    window.addEventListener('resize', viewer._onResize);
    viewer._onResize();
  }

  for (const button of [...icons.keys(), language]) {
    new MutationObserver(updateButtons).observe(button, {
      childList: true,
      attributes: true,
      attributeFilter: ['title'],
    });
  }
  updateButtons();
  document.addEventListener('DOMContentLoaded', () => {
    configureShare();
    fitViewer();
  }, { once: true });
})();
