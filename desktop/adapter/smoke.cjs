const assert = require('node:assert/strict');

module.exports = async ({ evaluate, send, wait, waitUntil }) => {
  await wait("window.__app && document.querySelector('#overlay.hidden') && document.querySelector('#statHash').textContent !== '--------'");
  assert.ok(await evaluate("document.querySelector('#scene').width > 0"));
  const oldHash = await evaluate("document.querySelector('#statHash').textContent");
  await evaluate("(() => { const seed = document.querySelector('#seedInput'); seed.value = 'desktop-check'; seed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()");
  await wait("document.querySelector('#overlay.hidden') && document.querySelector('#statHash').textContent !== " + JSON.stringify(oldHash));

  const pose = `(() => {
    const { camera } = window.__app.viewer;
    return { position: camera.position.toArray(), direction: camera.getWorldDirection(camera.position.clone()).toArray() };
  })()`;
  const expected = await evaluate(`(() => {
    const viewer = window.__app.viewer;
    viewer.fly.on = true;
    viewer.controls.enabled = false;
    viewer.fly.pitch = Math.PI / 4;
    viewer.fly.yaw = 0.8;
    viewer._updateFly(0);
    document.getElementById('btnSaveWorld').click();
    return ${pose};
  })()`);
  await evaluate('window.worldReloadMarker = true');
  await send('Page.reload');
  await waitUntil(
    () => evaluate("!window.worldReloadMarker && window.__app && !document.getElementById('btnSaveWorld').disabled").catch(() => false),
    'the generated world reloads',
  );
  await evaluate("document.getElementById('btnLoadWorld').click()");
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const actual = await evaluate(pose);
  const distance = (a, b) => Math.hypot(...a.map((n, i) => n - b[i]));
  assert.ok(expected.direction[1] > 0.7, 'The saved flight view looks up');
  assert.ok(distance(actual.position, expected.position) < 1e-6, 'Restore preserves the flight camera position');
  assert.ok(distance(actual.direction, expected.direction) < 1e-6, 'Restore preserves the upward view after OrbitControls updates');
  await evaluate("document.getElementById('btnLandmark').click()");
  assert.ok(await evaluate('window.__app.viewer.controls.maxPolarAngle < Math.PI / 2'), 'Landmark navigation uses the regular orbit limit');
  return { upwardViewRestored: true };
};
