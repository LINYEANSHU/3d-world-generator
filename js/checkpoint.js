export const CHECKPOINT_KEY = 'block-world.checkpoint';

const range = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const vector = value => Array.isArray(value) && value.length === 3 &&
  value.every(component => range(component, -100000, 100000));

export function decodeCheckpoint(text) {
  const { version, params, view } = JSON.parse(text) || {};
  if (version !== 1 || !params || !view ||
      typeof params.seedStr !== 'string' || !params.seedStr.trim() ||
      ![96, 128, 160, 192].includes(params.size) ||
      !range(params.mountainAmp, 0, 2) || !range(params.vegetation, 0, 2) ||
      !Number.isInteger(params.waterDelta) || !range(params.waterDelta, -3, 4) ||
      !Number.isInteger(params.villageCount) || !range(params.villageCount, 0, 3) ||
      !['day', 'dusk', 'overcast'].includes(view.atmosphere) ||
      typeof view.autoRotate !== 'boolean' ||
      !vector(view.position) || !vector(view.target) ||
      Math.hypot(...view.position.map((component, i) => component - view.target[i])) < 1 ||
      !Number.isSafeInteger(view.landmark) || view.landmark < -1) {
    throw new Error('Invalid world checkpoint');
  }
  return { params, view };
}

export function encodeCheckpoint(params, view) {
  const text = JSON.stringify({ version: 1, params, view });
  decodeCheckpoint(text);
  return text;
}
