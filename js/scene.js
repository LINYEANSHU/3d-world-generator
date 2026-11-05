// ============================================================
// scene.js — 渲染器 / 场景 / 光照阴影 / 天空云朵 / 相机控制 / 飞行模式
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from '../lib/OrbitControls.js';
import { buildCrossGeometry } from './mesher.js';
import { PLANTS } from './blocks.js';
import { seededRandom } from './noise.js';

const SUN_DIR = new THREE.Vector3(0.52, 0.72, 0.34).normalize();

// 天空氛围预设：day 与初始状态逐字段相同（默认零变化）
// · dusk：暖阳黄昏——暖橙地平线 + 暮蓝天顶 + 偏暖低强度阳光
// · overcast：烟雨迷蒙——青灰天空 + 弱漫射 + 浓近雾
const ATMOSPHERES = {
  day: {
    zenith: 0x3f86d2, horizon: 0xd8eaf8, below: 0x647486, sunGlow: 0xfff0c4,
    sun: 0xfff1d8, sunIntensity: 2.6,
    hemiSky: 0xcfe4ff, hemiGround: 0x9c8a6c, hemiIntensity: 1.05,
    fog: 0xd8eaf8, exposure: 1.18,
  },
  dusk: {
    zenith: 0x2f4a78, horizon: 0xf0b080, below: 0x50424e, sunGlow: 0xffd9a8,
    sun: 0xffb877, sunIntensity: 2.1,
    hemiSky: 0xd9b494, hemiGround: 0x6e5c50, hemiIntensity: 0.95,
    fog: 0xf0b080, exposure: 1.08,
  },
  overcast: {
    zenith: 0x8296a8, horizon: 0xd4dde2, below: 0x707a84, sunGlow: 0xf0f4f8,
    sun: 0xe8edf2, sunIntensity: 1.15,
    hemiSky: 0xc8d4de, hemiGround: 0x807a72, hemiIntensity: 1.2,
    fog: 0xd4dde2, exposure: 1.0,
  },
};

export class Viewer {
  constructor(canvas, atlasTex, waterTex) {
    this.canvas = canvas;
    this.atlasTex = atlasTex;
    this.waterTex = waterTex;

    // ---------- 渲染器 ----------
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false; // 静态世界：阴影只在世界生成后渲染一次
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;

    // ---------- 场景与相机 ----------
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xd8eaf8, 150, 460);
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 1500);
    this.camera.position.set(180, 120, 180);

    // ---------- 天空（渐变 + 太阳光晕，跟随相机） ----------
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        uZenith: { value: new THREE.Color(0x3f86d2) },
        uHorizon: { value: new THREE.Color(0xd8eaf8) },
        uBelow: { value: new THREE.Color(0x647486) },
        uSunDir: { value: SUN_DIR.clone() },
        uSunColor: { value: new THREE.Color(0xfff0c4) },
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position.z = gl_Position.w; // 推到远平面
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vDir;
        uniform vec3 uZenith, uHorizon, uBelow, uSunColor, uSunDir;
        void main() {
          vec3 d = normalize(vDir);
          vec3 col = mix(uHorizon, uZenith, pow(clamp(d.y, 0.0, 1.0), 0.62));
          col = mix(col, uBelow, clamp(-d.y * 2.6, 0.0, 1.0));
          float s = clamp(dot(d, normalize(uSunDir)), 0.0, 1.0);
          col += uSunColor * (pow(s, 240.0) * 1.2 + pow(s, 7.0) * 0.14);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 20), this.skyMat);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // ---------- 光照 ----------
    this.hemi = new THREE.HemisphereLight(0xcfe4ff, 0x9c8a6c, 1.05);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff1d8, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 20;
    this.sun.shadow.camera.far = 700;
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // ---------- 材质 ----------
    this.solidMat = new THREE.MeshLambertMaterial({
      map: atlasTex, vertexColors: true, alphaTest: 0.5,
    });
    this.plantMat = new THREE.MeshLambertMaterial({
      map: atlasTex, alphaTest: 0.5, side: THREE.DoubleSide,
      vertexColors: true, // 配合十字几何的 color(全1) 属性，使 instanceColor 生效
    });
    this.waterMat = new THREE.MeshPhongMaterial({
      map: waterTex, transparent: true, opacity: 0.72, depthWrite: false,
      shininess: 130, specular: new THREE.Color(0x9dbede),
    });
    this._waterShader = null;
    const self = this;
    this.waterMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aWave;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed.y += aWave * ( sin( uTime * 1.7 + position.x * 0.9 + position.z * 0.7 ) * 0.05 - 0.028 );`);
      self._waterShader = shader;
    };

    // ---------- 世界容器 ----------
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);
    this.clouds = null;

    // ---------- 控制器 ----------
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 420;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.autoRotateSpeed = 0.55;

    // ---------- 飞行模式 ----------
    this.fly = { on: false, yaw: 0, pitch: 0, vel: new THREE.Vector3(), keys: {} };
    this.onFlyChange = null;
    this._bindFly();

    // ---------- 事件 ----------
    this._onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this._onResize);

    // ---------- 主循环 ----------
    this._clock = new THREE.Clock();
    this.onStats = null;
    this._frames = 0;
    this._statTime = 0;
    this._running = true;
    this._lastRafAt = performance.now();
    this._lastFrameAt = performance.now();
    this._loop = this._loop.bind(this);
    this._scheduleNext();
    // 看门狗：rAF 失联（窗口被遮挡/隐藏）时接管帧调度
    this._watchdog = setInterval(() => {
      if (!this._running) return;
      if (performance.now() - this._lastFrameAt > 500) {
        this._lastRafAt = 0; // 强制走定时器分支
        this._loop();
      }
    }, 400);
  }

  // ============ 世界尺寸变化：雾/阴影范围/相机距离 ============
  setWorldSize(size, center) {
    const d = size * 0.78;
    const sc = this.sun.shadow.camera;
    sc.left = -d; sc.right = d; sc.top = d; sc.bottom = -d;
    sc.updateProjectionMatrix();

    this.sun.position.copy(center).addScaledVector(SUN_DIR, size * 1.35 + 40);
    this.sun.target.position.copy(center);

    this.scene.fog.near = size * 1.15;
    this.scene.fog.far = size * 3.4;
    this.controls.maxDistance = size * 3.2;

    this.buildClouds(size);
    this._shadowDirty = true;
  }

  buildClouds(size) {
    if (this.clouds) {
      this.worldGroup.remove(this.clouds);
      this.clouds.geometry.dispose();
      this.clouds.material.dispose();
      this.clouds = null;
    }
    const rand = seededRandom('clouds', 'global');
    const items = [];
    const nCluster = Math.round(size / 4.5);
    const spread = size * 2.4;
    for (let i = 0; i < nCluster; i++) {
      const cx = (rand() - 0.5) * spread;
      const cz = (rand() - 0.5) * spread;
      const cy = size * 0.52 + 26 + rand() * 10;
      const puffs = 2 + ((rand() * 4) | 0);
      for (let p = 0; p < puffs; p++) {
        items.push({
          x: cx + (rand() - 0.5) * 14,
          y: cy + (rand() - 0.5) * 2,
          z: cz + (rand() - 0.5) * 10,
          sx: 7 + rand() * 11,
          sy: 1.6 + rand() * 1.2,
          sz: 5 + rand() * 8,
        });
      }
    }
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({
      color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    items.forEach((c, i) => {
      m.compose(new THREE.Vector3(c.x, c.y, c.z), q, new THREE.Vector3(c.sx, c.sy, c.sz));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    this.clouds = mesh;
    this.scene.add(mesh); // 云不随世界重建，挂在场景上
  }

  // ============ 世界网格构建 ============
  clearWorld() {
    const kill = [];
    this.worldGroup.traverse((o) => { if (o.isMesh || o.isInstancedMesh) kill.push(o); });
    for (const o of kill) {
      o.geometry.dispose();
      o.parent.remove(o);
    }
  }

  addChunk(chunkData) {
    const solid = geomFromBuf(chunkData.solid, false);
    if (solid) {
      const mesh = new THREE.Mesh(solid, this.solidMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.worldGroup.add(mesh);
    }
    const water = geomFromBuf(chunkData.water, true);
    if (water) {
      const mesh = new THREE.Mesh(water, this.waterMat);
      mesh.receiveShadow = true;
      mesh.renderOrder = 1;
      this.worldGroup.add(mesh);
    }
  }

  addPlants(plants) {
    for (const [id, list] of plants) {
      const def = PLANTS[id];
      if (!def || !list.length) continue;
      const geo = buildCrossGeometry(def.tile, def.h);
      const mat = this.plantMat;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const col = new THREE.Color();
      const tint = def.tint !== undefined ? def.tint : 1;
      list.forEach((p, i) => {
        q.setFromAxisAngle(up, p.rot * Math.PI / 2);
        m.compose(
          new THREE.Vector3(p.x + 0.5, p.y, p.z + 0.5), q,
          new THREE.Vector3(1, 1, 1),
        );
        im.setMatrixAt(i, m);
        const t = (0.9 + ((i * 37) % 16) / 16 * 0.16) * tint;
        col.setRGB(t, t, t);
        im.setColorAt(i, col);
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.receiveShadow = true;
      this.worldGroup.add(im);
    }
  }

  // 世界生成完毕：更新一次静态阴影
  refreshShadow() {
    this.renderer.shadowMap.needsUpdate = true;
  }

  focusOn(x, y, z, size) {
    this.controls.target.set(x, y, z);
    this.camera.position.set(
      x + size * 0.58,
      y + size * 0.46,
      z + size * 0.66,
    );
    this.controls.update();
  }

  setAutoRotate(v) { this.controls.autoRotate = v; }

  // ============ 天空氛围预设（不改太阳方向与阴影贴图，切换即时生效） ============
  setAtmosphere(name) {
    const a = ATMOSPHERES[name] || ATMOSPHERES.day;
    this.skyMat.uniforms.uZenith.value.setHex(a.zenith);
    this.skyMat.uniforms.uHorizon.value.setHex(a.horizon);
    this.skyMat.uniforms.uBelow.value.setHex(a.below);
    this.skyMat.uniforms.uSunColor.value.setHex(a.sunGlow);
    this.sun.color.setHex(a.sun);
    this.sun.intensity = a.sunIntensity;
    this.hemi.color.setHex(a.hemiSky);
    this.hemi.groundColor.setHex(a.hemiGround);
    this.hemi.intensity = a.hemiIntensity;
    this.scene.fog.color.setHex(a.fog);
    this.renderer.toneMappingExposure = a.exposure;
  }

  // ============ 飞行模式 ============
  _bindFly() {
    const canvas = this.canvas;
    const fly = this.fly;

    // 具名句柄：dispose() 时可成对移除，避免泄漏
    this._onPointerLockChange = () => {
      if (!document.pointerLockElement && fly.on) {
        this.toggleFly(false);
      }
    };
    this._onMouseMove = (e) => {
      if (!fly.on || !document.pointerLockElement) return;
      fly.yaw -= e.movementX * 0.0023;
      fly.pitch -= e.movementY * 0.0023;
      fly.pitch = Math.max(-1.55, Math.min(1.55, fly.pitch));
    };
    this._onKeyDown = (e) => {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return;
      fly.keys[e.code] = true;
      if (e.code === 'KeyF') this.toggleFly(!fly.on);
    };
    this._onKeyUp = (e) => { fly.keys[e.code] = false; };

    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    document.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  toggleFly(on) {
    const fly = this.fly;
    if (on === fly.on) return;
    fly.on = on;
    if (on) {
      this.controls.enabled = false;
      const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
      fly.yaw = e.y; fly.pitch = e.x;
      fly.vel.set(0, 0, 0);
      this.canvas.requestPointerLock();
    } else {
      this.controls.enabled = true;
      if (document.pointerLockElement) document.exitPointerLock();
      // 把轨道目标移到视线前方，衔接自然
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.controls.target.copy(this.camera.position).addScaledVector(fwd, 14);
    }
    if (this.onFlyChange) this.onFlyChange(on);
  }

  _updateFly(dt) {
    const fly = this.fly;
    const k = fly.keys;
    const fwdAmt = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
    const rightAmt = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    const upAmt = (k.Space ? 1 : 0) - (k.ShiftLeft ? 1 : 0);

    const speed = 17;
    const dir = new THREE.Vector3();
    if (fwdAmt || rightAmt || upAmt) {
      const sinY = Math.sin(fly.yaw), cosY = Math.cos(fly.yaw);
      const cosP = Math.cos(fly.pitch);
      dir.set(
        -sinY * fwdAmt * cosP + cosY * rightAmt,
        Math.sin(fly.pitch) * fwdAmt + upAmt,
        -cosY * fwdAmt * cosP - sinY * rightAmt,
      ).normalize().multiplyScalar(speed);
    }
    fly.vel.lerp(dir, Math.min(1, dt * 9));
    this.camera.position.addScaledVector(fly.vel, dt);
    this.camera.position.y = Math.max(0.6, this.camera.position.y);

    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(fly.pitch, fly.yaw, 0, 'YXZ'));
    this.camera.quaternion.copy(q);
  }

  // ============ 主循环 ============
  // rAF 因窗口不可见被节流时，自动退化为定时器驱动，保证渲染与生成流程不卡死
  _scheduleNext() {
    if (!this._running) return;
    const rafHealthy = (performance.now() - this._lastRafAt) < 600;
    if (rafHealthy) {
      requestAnimationFrame(() => {
        this._lastRafAt = performance.now();
        this._loop();
      });
    } else {
      setTimeout(() => this._loop(), 16);
      requestAnimationFrame(() => { this._lastRafAt = performance.now(); }); // 探测 rAF 恢复
    }
  }

  _loop() {
    if (!this._running) return;
    this._lastFrameAt = performance.now();
    this._scheduleNext();
    const dt = Math.min(this._clock.getDelta(), 0.05);
    const t = this._clock.elapsedTime;

    if (this.fly.on) this._updateFly(dt);
    else this.controls.update();

    // 水面动画
    if (this._waterShader) this._waterShader.uniforms.uTime.value = t;
    this.waterTex.offset.set((t * 0.006) % 1, (t * 0.004) % 1);

    // 云漂移
    if (this.clouds) {
      this.clouds.position.x = ((t * 1.1) % 240) - 120;
      this.clouds.position.z = Math.sin(t * 0.02) * 10;
    }

    this.sky.position.copy(this.camera.position);

    if (this._shadowDirty) {
      this.renderer.shadowMap.needsUpdate = true;
      this._shadowDirty = false;
    }

    this.renderer.render(this.scene, this.camera);

    // 统计
    this._frames++;
    this._statTime += dt;
    if (this._statTime >= 0.5 && this.onStats) {
      const info = this.renderer.info.render;
      this.onStats({
        fps: Math.round(this._frames / this._statTime),
        calls: info.calls,
        tris: info.triangles,
      });
      this._frames = 0;
      this._statTime = 0;
    }
  }

  dispose() {
    this._running = false;
    clearInterval(this._watchdog);
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    document.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.controls.dispose();
    this.clearWorld();
    if (this.clouds) {
      this.scene.remove(this.clouds);
      this.clouds.geometry.dispose();
      this.clouds.material.dispose();
      this.clouds = null;
    }
    this.sky.geometry.dispose();
    this.skyMat.dispose();
    this.solidMat.dispose();
    this.plantMat.dispose();
    this.waterMat.dispose();
    this.atlasTex.dispose();
    this.waterTex.dispose();
    this.renderer.dispose();
  }
}

function geomFromBuf(buf, hasWave) {
  if (!buf.idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
  if (hasWave) g.setAttribute('aWave', new THREE.Float32BufferAttribute(buf.wave, 1));
  g.setIndex(buf.idx);
  g.computeBoundingSphere();
  return g;
}
