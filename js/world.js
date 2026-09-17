/* ============================================================
   world.js — El mundo 3D
   Campos de estrellas con parallax, nebulosas, sol lejano,
   planeta anillado, luna, suelo-rejilla synthwave y rieles.
   Todo procedural (texturas generadas en <canvas>).
   ============================================================ */
import * as THREE from '../libs/three.module.js';

function starTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function glowTexture(r, g, b, inner = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, `rgba(255,255,255,${inner})`);
  grad.addColorStop(0.25, `rgba(${r},${g},${b},0.85)`);
  grad.addColorStop(0.6, `rgba(${r},${g},${b},0.25)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function makeStars(count, spread, size, color, opacity) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * spread * 2;
    pos[i * 3 + 1] = (Math.random() - 0.5) * spread * 1.25;
    pos[i * 3 + 2] = -260 + Math.random() * 300;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size, map: starTexture(), color, transparent: true, opacity,
    depthWrite: false, blending: THREE.AdditiveBlending,
    sizeAttenuation: true, fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

function makeNebula(color, x, y, z, scale, opacity) {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(...color, 0.9), color: 0xffffff,
    transparent: true, opacity, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false,
  });
  const sp = new THREE.Sprite(mat);
  sp.position.set(x, y, z);
  sp.scale.setScalar(scale);
  return sp;
}

function makePlanetTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const palette = ['#4a3f8a', '#6a55b8', '#3a3170', '#7d68cf', '#52459c', '#8f79e0', '#463a82'];
  let y = 0;
  while (y < 128) {
    const h = 6 + Math.random() * 16;
    const grad = g.createLinearGradient(0, y, 0, y + h);
    const a = palette[(Math.random() * palette.length) | 0];
    const b = palette[(Math.random() * palette.length) | 0];
    grad.addColorStop(0, a);
    grad.addColorStop(1, b);
    g.fillStyle = grad;
    g.fillRect(0, y - 1, 256, h + 1);
    y += h;
  }
  // turbulencias
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(20,14,50,${0.08 + Math.random() * 0.12})`;
    const yy = Math.random() * 128;
    g.beginPath();
    g.ellipse(Math.random() * 256, yy, 20 + Math.random() * 50, 1.5 + Math.random() * 3, 0, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function makeGridTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 512);
  g.strokeStyle = 'rgba(46,200,255,0.5)';
  g.lineWidth = 2;
  for (let y = 0; y <= 512; y += 64) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke();
  }
  g.lineWidth = 3;
  for (let x = 0; x <= 256; x += 128) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 16);
  return t;
}

export function createEnvironment(scene) {
  scene.add(new THREE.HemisphereLight(0x8ab4ff, 0x0a0c18, 0.55));
  const dir = new THREE.DirectionalLight(0xfff0dd, 1.15);
  dir.position.set(30, 40, 60);
  scene.add(dir);

  /* ----- estrellas (3 capas con parallax) ----- */
  const stars1 = makeStars(1100, 90, 0.85, 0x9fd8ff, 0.9);
  const stars2 = makeStars(700, 90, 1.5, 0xffffff, 1);
  const dust = makeStars(450, 70, 0.4, 0x5f7fd4, 0.55);
  scene.add(stars1, stars2, dust);

  /* ----- nebulosas ----- */
  const nebulas = [
    makeNebula([122, 64, 220], -110, 40, -700, 420, 0.4),
    makeNebula([40, 90, 220], 90, -30, -780, 480, 0.34),
    makeNebula([210, 60, 180], 20, 60, -860, 380, 0.26),
    makeNebula([40, 180, 200], -40, -55, -820, 360, 0.22),
    makeNebula([90, 50, 200], 130, 55, -900, 460, 0.3),
  ];
  nebulas.forEach((n) => scene.add(n));

  /* ----- sol lejano ----- */
  const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(255, 244, 214, 1), transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  sunCore.position.set(6, 30, -950);
  sunCore.scale.setScalar(110);
  const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(255, 170, 80, 0.9), transparent: true, opacity: 0.5,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  sunHalo.position.copy(sunCore.position);
  sunHalo.scale.setScalar(340);
  scene.add(sunCore, sunHalo);

  /* ----- planeta anillado + luna ----- */
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(26, 48, 32),
    new THREE.MeshStandardMaterial({ map: makePlanetTexture(), roughness: 1, metalness: 0, fog: false })
  );
  planet.position.set(-75, 26, -430);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(33, 52, 72),
    new THREE.MeshBasicMaterial({ color: 0x8f7fd0, side: THREE.DoubleSide, transparent: true, opacity: 0.4, fog: false })
  );
  ring.position.copy(planet.position);
  ring.rotation.x = Math.PI / 2.25;
  ring.rotation.y = 0.35;
  const ring2 = new THREE.Mesh(
    new THREE.RingGeometry(28.5, 31, 72),
    new THREE.MeshBasicMaterial({ color: 0xbfa9ff, side: THREE.DoubleSide, transparent: true, opacity: 0.25, fog: false })
  );
  ring2.position.copy(planet.position);
  ring2.rotation.copy(ring.rotation);
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(4.5, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0x9aa0b8, roughness: 1, fog: false })
  );
  moon.position.set(60, -20, -380);
  scene.add(planet, ring, ring2, moon);

  /* ----- suelo-rejilla ----- */
  const gridTex = makeGridTexture();
  const grid = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 340),
    new THREE.MeshBasicMaterial({
      map: gridTex, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  grid.rotation.x = -Math.PI / 2;
  grid.position.set(0, -9.5, -150);
  scene.add(grid);

  /* ----- rieles laterales ----- */
  const railMat = new THREE.MeshBasicMaterial({ color: 0x1ec8ff });
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x1ec8ff, transparent: true, opacity: 0.18,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  [-17, 17].forEach((x) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 340), railMat);
    rail.position.set(x, -9.2, -150);
    const halo = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 340), glowMat);
    halo.position.set(x, -9.2, -150);
    scene.add(rail, halo);
  });

  const CELL = 340 / 16; // unidades por celda de la rejilla

  function wrapAttr(pts, factor, dt, speed) {
    const pos = pts.geometry.attributes.position;
    const arr = pos.array;
    for (let i = 0; i < pos.count; i++) {
      let z = arr[i * 3 + 2] + speed * factor * dt;
      if (z > 40) {
        z -= 300;
        arr[i * 3] = (Math.random() - 0.5) * 180;
        arr[i * 3 + 1] = (Math.random() - 0.5) * 115;
      }
      arr[i * 3 + 2] = z;
    }
    pos.needsUpdate = true;
  }

  return {
    update(dt, speed, t) {
      wrapAttr(stars1, 1.0, dt, speed);
      wrapAttr(stars2, 1.45, dt, speed);
      wrapAttr(dust, 0.6, dt, speed);
      planet.rotation.y += 0.03 * dt;
      ring.rotation.z += 0.01 * dt;
      moon.rotation.y += 0.1 * dt;
      gridTex.offset.y += (speed * dt) / CELL;
      nebulas.forEach((n, i) => {
        n.position.x += Math.sin(t * 0.05 + i * 2.1) * 0.02;
      });
    },
  };
}
