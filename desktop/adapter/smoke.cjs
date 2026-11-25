const assert = require('node:assert/strict');

module.exports = async ({ evaluate, wait }) => {
  await wait("window.__app && document.querySelector('#overlay.hidden') && document.querySelector('#statHash').textContent !== '--------'");
  assert.ok(await evaluate("document.querySelector('#scene').width > 0"));
  const oldHash = await evaluate("document.querySelector('#statHash').textContent");
  await evaluate("(() => { const seed = document.querySelector('#seedInput'); seed.value = 'desktop-check'; seed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()");
  await wait("document.querySelector('#overlay.hidden') && document.querySelector('#statHash').textContent !== " + JSON.stringify(oldHash));
};
