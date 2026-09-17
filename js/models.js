/* ============================================================
   models.js — Modelos 3D procedurales (sin archivos externos)
   Nave del jugador, cazas enemigos, asteroides, power-ups y
   balas. Las texturas de brillo se generan en <canvas>.
   ============================================================ */
import * as THREE from '../libs/three.module.js';

const glowCache = new Map();
export function makeGlowTexture(hex) {
  if (glowCache.has(hex)) return glowCache.get(hex);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, gr = (n >> 8) & 255, b = n & 255;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, `rgba(${r},${gr},${b},0.9)`);
  grad.addColorStop(0.6, `rgba(${r},${gr},${b},0.28)`);
  grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  glowCache.set(hex, t);
  return t;
}

function glowSprite(hex, scale) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(hex), transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sp.scale.setScalar(scale);
  return sp;
}

/* -----------------------------------------------------------
   Nave del jugador (mira hacia -Z)
   ----------------------------------------------------------- */
export function createShip() {
  const g = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({ color: 0x9fb0c8, metalness: 0.75, roughness: 0.3 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b3040, metalness: 0.6, roughness: 0.5 });
  const noseMat = new THREE.MeshStandardMaterial({ color: 0xd7e2f2, metalness: 0.8, roughness: 0.25 });
  const neonMat = new THREE.MeshStandardMaterial({ color: 0x0a2a33, emissive: 0x22e0ff, emissiveIntensity: 2.2 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x062033, emissive: 0x1296ff, emissiveIntensity: 1.4, metalness: 0.2, roughness: 0.1,
  });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 1.0, 4, 12), hullMat);
  body.rotation.x = Math.PI / 2;
  g.add(body);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.75, 12), noseMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -1.02;
  g.add(nose);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), glassMat);
  cockpit.scale.set(1, 0.75, 1.5);
  cockpit.position.set(0, 0.24, -0.42);
  g.add(cockpit);

  const wingGeo = new THREE.BoxGeometry(1.55, 0.08, 0.9);
  const tipGeo = new THREE.BoxGeometry(0.06, 0.1, 0.5);
  [1, -1].forEach((side) => {
    const wing = new THREE.Group();
    const w = new THREE.Mesh(wingGeo, side > 0 ? hullMat : hullMat);
    wing.add(w);
    const tip = new THREE.Mesh(tipGeo, neonMat);
    tip.position.set(0.74, 0.02, 0.08);
    wing.add(tip);
    wing.position.set(side * 0.82, 0, 0.38);
    wing.rotation.z = side * 0.1;
    wing.rotation.y = -side * 0.18;
    g.add(wing);
  });

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.5), darkMat);
  fin.position.set(0, 0.35, 0.75);
  fin.rotation.x = 0.15;
  g.add(fin);
  const finLight = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.3), neonMat);
  finLight.position.set(0, 0.58, 0.8);
  g.add(finLight);

  const engGeo = new THREE.CylinderGeometry(0.15, 0.2, 0.55, 10);
  const engA = new THREE.Mesh(engGeo, darkMat);
  engA.rotation.x = Math.PI / 2;
  engA.position.set(0.3, -0.02, 0.85);
  const engB = engA.clone();
  engB.position.x = -0.3;
  g.add(engA, engB);

  const glowA = glowSprite('#5ce8ff', 0.8);
  glowA.position.set(0.3, -0.02, 1.15);
  const glowB = glowSprite('#5ce8ff', 0.8);
  glowB.position.set(-0.3, -0.02, 1.15);
  g.add(glowA, glowB);

  function update(t, speed01, boost) {
    const s = (0.85 + 0.2 * Math.sin(t * 38) + Math.random() * 0.1) * (1 + speed01 * 0.7 + (boost ? 1.0 : 0));
    glowA.scale.setScalar(0.8 * s);
    glowB.scale.setScalar(0.8 * s);
    neonMat.emissiveIntensity = 1.9 + 0.6 * Math.sin(t * 6);
  }

  return { group: g, update };
}

/* -----------------------------------------------------------
   Caza enemigo (mira hacia +Z, hacia el jugador)
   ----------------------------------------------------------- */
export function createEnemy() {
  const g = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({ color: 0x8a3a4a, metalness: 0.7, roughness: 0.35 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x241016, metalness: 0.5, roughness: 0.55 });
  const noseMat = new THREE.MeshStandardMaterial({ color: 0xc25062, emissive: 0xff3344, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.3 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x2a0a05, emissive: 0xff7733, emissiveIntensity: 1.2, roughness: 0.15 });
  const neonMat = new THREE.MeshStandardMaterial({ color: 0x1a0508, emissive: 0xff2244, emissiveIntensity: 2.0 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.75, 4, 10), hullMat);
  body.rotation.x = Math.PI / 2;
  g.add(body);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.6, 10), noseMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 0.72;
  g.add(nose);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), glassMat);
  cockpit.scale.set(1, 0.7, 1.4);
  cockpit.position.set(0, 0.16, 0.32);
  g.add(cockpit);

  const wingGeo = new THREE.BoxGeometry(1.15, 0.06, 0.7);
  const tipGeo = new THREE.BoxGeometry(0.05, 0.09, 0.4);
  [1, -1].forEach((side) => {
    const wing = new THREE.Group();
    wing.add(new THREE.Mesh(wingGeo, hullMat));
    const tip = new THREE.Mesh(tipGeo, neonMat);
    tip.position.set(0.54, 0.02, -0.06);
    wing.add(tip);
    wing.position.set(side * 0.62, 0, 0.1);
    wing.rotation.z = side * 0.12;
    wing.rotation.y = side * 0.22;
    g.add(wing);
  });

  const glow = glowSprite('#ff7744', 0.7);
  glow.position.set(0, -0.02, -0.62);
  g.add(glow);

  function update(t) {
    glow.scale.setScalar(0.7 * (0.8 + 0.25 * Math.sin(t * 30 + g.id)));
  }

  return { group: g, update };
}

/* -----------------------------------------------------------
   Geometría de asteroide (icosaedro deformado, determinista)
   ----------------------------------------------------------- */
export function makeAsteroidGeometry(r, seed) {
  const geo = new THREE.IcosahedronGeometry(r, 1);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  let s = (seed * 9301 + 49297) % 233280 || 1;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s % 10000) / 10000;
  };
  const cache = new Map();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let o = cache.get(key);
    if (o === undefined) {
      o = 0.72 + rand() * 0.55;
      cache.set(key, o);
    }
    v.multiplyScalar(o);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/* -----------------------------------------------------------
   Power-ups
   ----------------------------------------------------------- */
const POWER_DEFS = {
  shield: { shape: () => new THREE.SphereGeometry(0.42, 24, 16), color: 0x38b6ff, glow: '#38b6ff', label: '¡ESCUDO +60!' },
  rapid: { shape: () => new THREE.BoxGeometry(0.55, 0.55, 0.55), color: 0xffa028, glow: '#ffa028', label: '¡TIRO RÁPIDO!' },
  double: { shape: () => new THREE.OctahedronGeometry(0.5), color: 0x4dff9a, glow: '#4dff9a', label: '¡DISPARO DOBLE!' },
};

export function createPowerup(type) {
  const def = POWER_DEFS[type];
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x081018, emissive: def.color, emissiveIntensity: 1.7, metalness: 0.3, roughness: 0.2,
  });
  const mesh = new THREE.Mesh(def.shape(), mat);
  g.add(mesh);
  const halo = glowSprite(def.glow, 2.0);
  g.add(halo);

  function update(t) {
    mesh.rotation.y = t * 2.2;
    mesh.rotation.x = t * 1.4;
    mat.emissiveIntensity = 1.4 + 0.7 * Math.sin(t * 5);
  }

  return { group: g, update, label: def.label };
}

/* -----------------------------------------------------------
   Balas
   ----------------------------------------------------------- */
export function createPlayerBullet() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 1.7),
    new THREE.MeshBasicMaterial({ color: 0x7df6ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  g.add(core);
  g.add(glowSprite('#46e6ff', 1.05));
  return g;
}

export function createEnemyBolt() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xff6a40, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  g.add(core);
  g.add(glowSprite('#ff5a30', 1.0));
  return g;
}

export function disposeObject(o) {
  o.traverse((c) => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      mats.forEach((m) => m.dispose());
    }
  });
}
