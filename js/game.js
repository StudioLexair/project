/* ============================================================
   game.js — Núcleo del juego
   Entidades (asteroides, enemigos, balas, power-ups),
   sistema de partículas, colisiones, puntuación, dificultad,
   cámara cinematográfica con sacudida y FOV dinámico.
   ============================================================ */
import * as THREE from '../libs/three.module.js';
import {
  createShip, createEnemy, makeAsteroidGeometry,
  createPowerup, createPlayerBullet, createEnemyBolt,
  disposeObject, makeGlowTexture,
} from './models.js';
import { audio } from './audio.js';

export const BOUNDS = { x: 13.5, y: 7.5 };
const SPAWN_Z = -150;
const PLAYER_RADIUS = 0.95;

const asteroidMat = new THREE.MeshStandardMaterial({
  color: 0x8d8275, roughness: 0.95, metalness: 0.08, flatShading: true,
});

/** Colisión segmento-esfera (evita que proyectiles rápidos "atravesen" objetivos). */
function segSphere(ax, ay, az, bx, by, bz, cx, cy, cz, r) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const fx = ax - cx, fy = ay - cy, fz = az - cz;
  const l2 = dx * dx + dy * dy + dz * dz;
  let t = 0;
  if (l2 > 1e-8) t = Math.max(0, Math.min(1, -(fx * dx + fy * dy + fz * dz) / l2));
  const px = ax + dx * t - cx, py = ay + dy * t - cy, pz = az + dz * t - cz;
  return px * px + py * py + pz * pz < r * r;
}

/* -----------------------------------------------------------
   Sistema de partículas (un solo THREE.Points, CPU)
   ----------------------------------------------------------- */
class ParticleSystem {
  constructor(scene, max = 1400) {
    this.max = max;
    this.data = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.baseCol = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    for (let i = 0; i < max; i++) this.data[i * 3 + 1] = -9999;
    this.cursor = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.data, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.5, map: makeGlowTexture('#ffffff'), vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      sizeAttenuation: true, fog: false,
    });
    this.pts = new THREE.Points(geo, mat);
    this.pts.frustumCulled = false;
    scene.add(this.pts);
    this.geo = geo;
  }

  spawn(px, py, pz, color, count, speed, life, spread = 1) {
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const i3 = i * 3;
      this.data[i3] = px + (Math.random() - 0.5) * 0.5;
      this.data[i3 + 1] = py + (Math.random() - 0.5) * 0.5;
      this.data[i3 + 2] = pz + (Math.random() - 0.5) * 0.5;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const sp = speed * (0.25 + Math.random() * 0.95) * spread;
      this.vel[i3] = Math.sin(ph) * Math.cos(th) * sp;
      this.vel[i3 + 1] = Math.sin(ph) * Math.sin(th) * sp;
      this.vel[i3 + 2] = Math.cos(ph) * sp * 0.8;
      const l = life * (0.5 + Math.random() * 0.7);
      this.life[i] = l;
      this.maxLife[i] = l;
      const r = ((color >> 16) & 255) / 255;
      const g = ((color >> 8) & 255) / 255;
      const b = (color & 255) / 255;
      const w = Math.random() * 0.6;
      this.baseCol[i3] = Math.min(1, r + (1 - r) * w);
      this.baseCol[i3 + 1] = Math.min(1, g + (1 - g) * w);
      this.baseCol[i3 + 2] = Math.min(1, b + (1 - b) * w);
      this.col[i3] = this.baseCol[i3];
      this.col[i3 + 1] = this.baseCol[i3 + 1];
      this.col[i3 + 2] = this.baseCol[i3 + 2];
    }
  }

  update(dt) {
    const drag = 1 - Math.min(1, 2.2 * dt);
    for (let i = 0; i < this.max; i++) {
      const l = this.life[i];
      if (l <= 0) continue;
      const i3 = i * 3;
      const nl = l - dt;
      if (nl <= 0) {
        this.life[i] = 0;
        this.col[i3] = this.col[i3 + 1] = this.col[i3 + 2] = 0;
        continue;
      }
      this.life[i] = nl;
      this.data[i3] += this.vel[i3] * dt;
      this.data[i3 + 1] += this.vel[i3 + 1] * dt;
      this.data[i3 + 2] += this.vel[i3 + 2] * dt;
      this.vel[i3] *= drag;
      this.vel[i3 + 1] *= drag;
      this.vel[i3 + 2] *= drag;
      const f = nl / this.maxLife[i];
      this.col[i3] = this.baseCol[i3] * f;
      this.col[i3 + 1] = this.baseCol[i3 + 1] * f;
      this.col[i3 + 2] = this.baseCol[i3 + 2] * f;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

/* -----------------------------------------------------------
   Game
   ----------------------------------------------------------- */
export class Game {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.particles = new ParticleSystem(scene);
    this.ship = createShip();
    scene.add(this.ship.group);

    this.asteroids = [];
    this.enemies = [];
    this.bullets = [];
    this.bolts = [];
    this.powerups = [];

    this.state = 'menu'; // 'menu' | 'playing' | 'gameover'
    this.t = 0;
    this.speed = 46;
    this.camShake = 0;
    this.fov = 72;
    this.onGameOver = null;
    this.onHud = null;
    this.onToast = null;
    this._seed = 1;

    this.px = 0; this.py = 0;
    this.tx = 0; this.ty = 0;
    this.vx = 0; this.vy = 0;
    this.shield = 100;
    this.lives = 3;
    this.invuln = 0;
    this.score = 0;
    this.elapsed = 0;
    this.streak = 0;
    this.streakT = 0;
    this.rapid = 0;
    this.double = 0;
    this.fireCd = 0;
    this.astT = 0.5;
    this.enT = 5;
    this.pwT = 8;
    this.goTimer = 0;
    this._goFired = false;
    this.reset(true);
  }

  reset(demo = false) {
    // limpiar entidades
    for (const a of this.asteroids) { this.scene.remove(a.mesh); a.mesh.geometry.dispose(); }
    for (const e of this.enemies) { this.scene.remove(e.mesh); disposeObject(e.mesh); }
    for (const b of this.bullets) { this.scene.remove(b.mesh); disposeObject(b.mesh); }
    for (const b of this.bolts) { this.scene.remove(b.mesh); disposeObject(b.mesh); }
    for (const p of this.powerups) { this.scene.remove(p.mesh); disposeObject(p.mesh); }
    this.asteroids = [];
    this.enemies = [];
    this.bullets = [];
    this.bolts = [];
    this.powerups = [];

    this.px = 0; this.py = 0;
    this.tx = 0; this.ty = 0;
    this.vx = 0; this.vy = 0;
    this.shield = 100;
    this.lives = 3;
    this.invuln = 0;
    this.score = 0;
    this.elapsed = 0;
    this.streak = 0;
    this.streakT = 0;
    this.rapid = 0;
    this.double = 0;
    this.fireCd = 0;
    this.astT = 0.5;
    this.enT = 5;
    this.pwT = 9;
    this.camShake = 0;
    this._goFired = false;
    this.ship.group.visible = true;
    this.ship.group.position.set(0, 0, 0);
    this.ship.group.rotation.set(0, 0, 0);
    this.state = demo ? 'menu' : 'playing';
  }

  start() {
    this.reset(false);
    audio.engine(true);
  }

  get mult() { return 1 + Math.min(4, Math.floor(this.streak / 4)); }

  /* ================= actualización principal ================= */
  update(dt, input) {
    this.t += dt;

    const boosting = this.state === 'playing' && input.boostHeld;
    if (this.state === 'playing') {
      const base = 42 + Math.min(68, this.elapsed * 1.3);
      this.speed = base * (boosting ? 1.85 : 1);
    } else if (this.state === 'menu') {
      this.speed = 46 + Math.sin(this.t * 0.2) * 6;
    } else { // gameover: el mundo se frena
      this.speed += (6 - this.speed) * Math.min(1, dt * 1.2);
    }
    audio.engineUpdate(Math.min(1.4, this.speed / 110), boosting);

    /* ---------- pilotaje ---------- */
    if (this.state === 'menu') {
      this.tx = Math.sin(this.t * 0.55) * 7;
      this.ty = Math.sin(this.t * 0.37 + 1.3) * 3.4;
    } else if (this.state === 'playing') {
      this.elapsed += dt;
      const k = input.keyVec();
      if (k.x || k.y) {
        this.tx += k.x * 40 * dt;
        this.ty += k.y * 36 * dt;
      }
      if (!input.dragging && input.dragDX === 0 && input.dragDY === 0 && input.mouse.has) {
        this.tx = input.mouse.x * BOUNDS.x * 1.06;
        this.ty = input.mouse.y * BOUNDS.y * 1.06;
      }
      if (input.dragDX !== 0 || input.dragDY !== 0) {
        const kx = (BOUNDS.x * 2.4) / window.innerWidth;
        const ky = (BOUNDS.y * 2.4) / window.innerHeight;
        this.tx += input.dragDX * kx;
        this.ty -= input.dragDY * ky;
        input.dragDX = 0;
        input.dragDY = 0;
      }
      this.tx = THREE.MathUtils.clamp(this.tx, -BOUNDS.x, BOUNDS.x);
      this.ty = THREE.MathUtils.clamp(this.ty, -BOUNDS.y, BOUNDS.y);
    }

    const ease = 1 - Math.exp(-7 * dt);
    const nx = this.px + (this.tx - this.px) * ease;
    const ny = this.py + (this.ty - this.py) * ease;
    const ivx = dt > 0 ? (nx - this.px) / dt : 0;
    const ivy = dt > 0 ? (ny - this.py) / dt : 0;
    this.px = nx; this.py = ny;
    this.vx += (ivx - this.vx) * Math.min(1, 10 * dt);
    this.vy += (ivy - this.vy) * Math.min(1, 10 * dt);

    if (this.state !== 'gameover') {
      this.ship.group.position.set(this.px, this.py, 0);
      const bankT = THREE.MathUtils.clamp(-this.vx * 0.045, -0.9, 0.9);
      const pitchT = THREE.MathUtils.clamp(this.vy * 0.025, -0.5, 0.5);
      this.ship.group.rotation.z += (bankT - this.ship.group.rotation.z) * Math.min(1, 10 * dt);
      this.ship.group.rotation.x += (pitchT - this.ship.group.rotation.x) * Math.min(1, 10 * dt);
      this.ship.update(this.t, Math.min(1.4, this.speed / 110), boosting);
      if (this.invuln > 0) {
        this.invuln -= dt;
        this.ship.group.visible = Math.floor(this.t * 18) % 2 === 0;
      } else {
        this.ship.group.visible = true;
      }
    }

    /* ---------- disparo del jugador ---------- */
    if (this.state === 'playing') {
      this.fireCd -= dt;
      this.rapid = Math.max(0, this.rapid - dt);
      this.double = Math.max(0, this.double - dt);
      this.streakT -= dt;
      if (this.streakT <= 0) this.streak = 0;
      if (input.fireHeld && this.fireCd <= 0) {
        this.fire();
        this.fireCd = this.rapid > 0 ? 0.075 : 0.16;
        audio.shoot();
      }
    }

    /* ---------- spawners ---------- */
    if (this.state === 'playing') {
      this.astT -= dt;
      if (this.astT <= 0 && this.asteroids.length < 38) {
        this.spawnAsteroid();
        if (Math.random() < THREE.MathUtils.clamp(this.elapsed / 70, 0, 0.55)) this.spawnAsteroid();
        this.astT = THREE.MathUtils.clamp(1.5 * 42 / this.speed, 0.45, 1.5);
      }
      this.enT -= dt;
      if (this.enT <= 0 && this.elapsed > 4) {
        this.spawnEnemy();
        if (this.elapsed > 80 && Math.random() < 0.4) this.spawnEnemy();
        this.enT = THREE.MathUtils.clamp(4.6 - this.elapsed * 0.02, 1.5, 4.6);
      }
      this.pwT -= dt;
      if (this.pwT <= 0) {
        this.spawnPowerup();
        this.pwT = 11 + Math.random() * 7;
      }
    } else if (this.state === 'menu') {
      this.astT -= dt;
      if (this.astT <= 0 && this.asteroids.length < 10) {
        this.spawnAsteroid();
        this.astT = 1.1;
      }
    }

    /* ---------- mover entidades ---------- */
    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const a = this.asteroids[i];
      a.px = a.x; a.py = a.y; a.pz = a.z;
      a.z += (this.speed + a.vz) * dt;
      a.mesh.rotation.x += a.rotSpeed * dt;
      a.mesh.rotation.y += a.rotSpeed * 0.7 * dt;
      a.mesh.position.set(a.x, a.y, a.z);
      if (a.z > 26) {
        this.scene.remove(a.mesh);
        a.mesh.geometry.dispose();
        this.asteroids.splice(i, 1);
      }
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.px = e.x; e.py = e.y; e.pz = e.z;
      e.z += (this.speed * 0.55 + 16) * dt;
      e.x = THREE.MathUtils.clamp(e.x0 + Math.sin(this.t * e.fq + e.ph) * e.amp, -BOUNDS.x, BOUNDS.x);
      e.y = e.y0 + Math.sin(this.t * e.fq * 0.7 + e.ph * 2) * e.ampY;
      e.mesh.position.set(e.x, e.y, e.z);
      e.mesh.lookAt(e.x, e.y, e.z + 1);
      e.update(this.t);
      if (this.state === 'playing') {
        e.cd -= dt;
        if (e.cd <= 0 && e.z < -10) {
          this.enemyFire(e);
          e.cd = 1.4 + Math.random() * 1.1 - Math.min(0.5, this.elapsed * 0.008);
        }
      }
      if (e.z > 26) {
        this.scene.remove(e.mesh);
        disposeObject(e.mesh);
        this.enemies.splice(i, 1);
      }
    }
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.px = b.x; b.py = b.y; b.pz = b.z;
      b.z -= 195 * dt;
      b.mesh.position.set(b.x, b.y, b.z);
      if (b.z < SPAWN_Z - 25) {
        this.scene.remove(b.mesh);
        disposeObject(b.mesh);
        this.bullets.splice(i, 1);
      }
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.px = b.x; b.py = b.y; b.pz = b.z;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      b.mesh.position.set(b.x, b.y, b.z);
      if (b.z > 26 || b.z < SPAWN_Z - 30) {
        this.scene.remove(b.mesh);
        disposeObject(b.mesh);
        this.bolts.splice(i, 1);
      }
    }
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      p.px = p.x; p.py = p.y; p.pz = p.z;
      p.z += this.speed * dt;
      p.mesh.position.set(p.x, p.y + Math.sin(this.t * 3 + p.x) * 0.3, p.z);
      p.update(this.t);
      if (p.z > 26) {
        this.scene.remove(p.mesh);
        disposeObject(p.mesh);
        this.powerups.splice(i, 1);
      }
    }

    /* ---------- colisiones ---------- */
    if (this.state === 'playing') this.collisions();

    /* ---------- partículas / cámara ---------- */
    this.particles.update(dt);
    this.camShake *= Math.exp(-4.5 * dt);
    const sx = (Math.random() - 0.5) * this.camShake;
    const sy = (Math.random() - 0.5) * this.camShake;
    this.camera.position.set(this.px * 0.42 + sx, this.py * 0.42 + 2.1 + sy, 8.6);
    this.camera.lookAt(this.px * 0.75, this.py * 0.75, -40);
    const fovT = 70 + (boosting ? 9 : 0) + Math.min(10, this.speed * 0.05);
    if (Math.abs(fovT - this.fov) > 0.02) {
      this.fov += (fovT - this.fov) * Math.min(1, 6 * dt);
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    /* ---------- fin de partida ---------- */
    if (this.state === 'gameover' && !this._goFired) {
      this.goTimer += dt;
      if (this.goTimer > 1.0 && this.onGameOver) {
        this._goFired = true;
        this.onGameOver(this.score);
      }
    }

    /* ---------- HUD ---------- */
    if (this.state === 'playing' && this.onHud) {
      this.onHud({
        score: Math.floor(this.score),
        shield: this.shield,
        lives: this.lives,
        speed: this.speed / 42,
        mult: this.mult,
        rapid: this.rapid,
        double: this.double,
      });
    }
  }

  /* ================= acciones ================= */
  fire() {
    const offsets = this.double > 0 ? [-0.45, 0.45] : [0];
    for (const off of offsets) {
      const mesh = createPlayerBullet();
      mesh.position.set(this.px + off * 1.6, this.py - 0.05, -1.3);
      this.scene.add(mesh);
      this.bullets.push({ x: this.px + off * 1.6, y: this.py - 0.05, z: -1.3, mesh });
      this.particles.spawn(this.px + off * 1.6, this.py - 0.05, -1.5, 0x66f2ff, 2, 5, 0.22, 0.5);
    }
  }

  spawnAsteroid() {
    this._seed++;
    const r = 0.8 + Math.pow(Math.random(), 1.6) * 1.9;
    const mesh = new THREE.Mesh(makeAsteroidGeometry(r, this._seed), asteroidMat);
    const a = {
      x: (Math.random() - 0.5) * 2 * (BOUNDS.x + 3),
      y: (Math.random() - 0.5) * 2 * (BOUNDS.y + 2.5),
      z: SPAWN_Z - Math.random() * 20,
      r,
      vz: Math.random() * 9,
      rotSpeed: 0.4 + Math.random() * 1.4,
      score: r < 1.4 ? 25 : r < 2.2 ? 50 : 100,
      mesh,
    };
    mesh.position.set(a.x, a.y, a.z);
    this.scene.add(mesh);
    this.asteroids.push(a);
  }

  spawnEnemy() {
    const e = createEnemy();
    const x0 = (Math.random() - 0.5) * 2 * BOUNDS.x * 0.7;
    const y0 = (Math.random() - 0.5) * 2 * BOUNDS.y * 0.6;
    const ent = {
      x0, y0, x: x0, y: y0, z: SPAWN_Z,
      fq: 0.5 + Math.random() * 0.7,
      ph: Math.random() * Math.PI * 2,
      amp: 1.2 + Math.random() * 2.6,
      ampY: 0.8 + Math.random() * 1.6,
      cd: 0.35 + Math.random() * 0.6,
      mesh: e.group,
      update: e.update,
    };
    e.group.position.set(x0, y0, SPAWN_Z);
    this.scene.add(e.group);
    this.enemies.push(ent);
  }

  spawnPowerup() {
    const types = ['shield', 'rapid', 'double'];
    const type = types[(Math.random() * types.length) | 0];
    const p = createPowerup(type);
    const ent = {
      type,
      x: (Math.random() - 0.5) * 2 * BOUNDS.x * 0.7,
      y: (Math.random() - 0.5) * 2 * BOUNDS.y * 0.6,
      z: SPAWN_Z + 10,
      mesh: p.group,
      update: p.update,
      label: p.label,
    };
    p.group.position.set(ent.x, ent.y, ent.z);
    this.scene.add(p.group);
    this.powerups.push(ent);
  }

  enemyFire(e) {
    const mesh = createEnemyBolt();
    const dx = this.px - e.x;
    const dy = this.py - e.y;
    const dz = 0 - e.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const sp = 52;
    const bolt = {
      x: e.x, y: e.y, z: e.z,
      vx: (dx / d) * sp, vy: (dy / d) * sp, vz: (dz / d) * sp,
      mesh,
    };
    mesh.position.set(e.x, e.y, e.z);
    this.scene.add(mesh);
    this.bolts.push(bolt);
  }

  /* ================= colisiones ================= */
  collisions() {
    // balas vs asteroides
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      let hit = false;
      for (let j = this.asteroids.length - 1; j >= 0; j--) {
        const a = this.asteroids[j];
        if (segSphere(b.px, b.py, b.pz, b.x, b.y, b.z, a.x, a.y, a.z, a.r * 0.92 + 0.3)) {
          this.destroyAsteroid(j, true);
          hit = true;
          break;
        }
      }
      if (!hit) {
        for (let j = this.enemies.length - 1; j >= 0; j--) {
          const e = this.enemies[j];
          if (segSphere(b.px, b.py, b.pz, b.x, b.y, b.z, e.x, e.y, e.z, 0.95)) {
            this.destroyEnemy(j, true);
            hit = true;
            break;
          }
        }
      }
      if (hit) {
        this.scene.remove(b.mesh);
        disposeObject(b.mesh);
        this.bullets.splice(i, 1);
      }
    }
    if (this.invuln > 0) return;

    // rayos enemigos vs jugador
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      if (segSphere(b.px, b.py, b.pz, b.x, b.y, b.z, this.px, this.py, 0, 0.85)) {
        this.scene.remove(b.mesh);
        disposeObject(b.mesh);
        this.bolts.splice(i, 1);
        this.damage(18);
        return;
      }
    }
    // asteroides vs jugador
    for (let j = this.asteroids.length - 1; j >= 0; j--) {
      const a = this.asteroids[j];
      if (segSphere(a.px, a.py, a.pz, a.x, a.y, a.z, this.px, this.py, 0, a.r * 0.85 + PLAYER_RADIUS)) {
        this.destroyAsteroid(j, false);
        this.damage(45);
        return;
      }
    }
    // enemigos vs jugador
    for (let j = this.enemies.length - 1; j >= 0; j--) {
      const e = this.enemies[j];
      if (segSphere(e.px, e.py, e.pz, e.x, e.y, e.z, this.px, this.py, 0, 0.9 + PLAYER_RADIUS)) {
        this.destroyEnemy(j, false);
        this.damage(40);
        return;
      }
    }
    // power-ups vs jugador
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      if (segSphere(p.px, p.py, p.pz, p.x, p.y, p.z, this.px, this.py, 0, 0.9 + 1.15)) {
        this.scene.remove(p.mesh);
        disposeObject(p.mesh);
        this.powerups.splice(i, 1);
        this.applyPower(p);
      }
    }
  }

  destroyAsteroid(index, byBullet) {
    const a = this.asteroids[index];
    this.particles.spawn(a.x, a.y, a.z, 0xffa040, Math.floor(10 + a.r * 7), 14, 0.8);
    this.particles.spawn(a.x, a.y, a.z, 0x998877, Math.floor(6 + a.r * 4), 10, 0.6);
    this.scene.remove(a.mesh);
    a.mesh.geometry.dispose();
    this.asteroids.splice(index, 1);
    if (byBullet) {
      this.scoreAdd(a.score);
      this.addStreak();
      audio.boom(a.r > 2);
      // los grandes se parten
      if (a.r > 1.5) {
        const n = 2 + ((Math.random() < 0.4) ? 1 : 0);
        for (let k = 0; k < n; k++) {
          this._seed++;
          const r = a.r * 0.48;
          const mesh = new THREE.Mesh(makeAsteroidGeometry(r, this._seed), asteroidMat);
          const child = {
            x: a.x + (Math.random() - 0.5) * a.r,
            y: a.y + (Math.random() - 0.5) * a.r,
            z: a.z,
            r,
            vz: -8 - Math.random() * 10,
            rotSpeed: 1 + Math.random() * 2,
            score: Math.max(25, Math.floor(a.score / 2)),
            mesh,
          };
          mesh.position.set(child.x, child.y, child.z);
          this.scene.add(mesh);
          this.asteroids.push(child);
        }
      }
    } else {
      audio.boom(a.r > 2);
    }
  }

  destroyEnemy(index, byBullet) {
    const e = this.enemies[index];
    this.particles.spawn(e.x, e.y, e.z, 0xff5533, 26, 16, 0.9);
    this.particles.spawn(e.x, e.y, e.z, 0xffcc44, 14, 12, 0.6);
    this.scene.remove(e.mesh);
    disposeObject(e.mesh);
    this.enemies.splice(index, 1);
    audio.boom(true);
    if (byBullet) {
      this.scoreAdd(150);
      this.addStreak();
      if (Math.random() < 0.18) {
        const dropType = ['shield', 'rapid', 'double'][(Math.random() * 3) | 0];
        const p = createPowerup(dropType);
        const ent = {
          type: dropType,
          x: e.x, y: e.y, z: e.z,
          mesh: p.group, update: p.update, label: p.label,
        };
        p.group.position.set(e.x, e.y, e.z);
        this.scene.add(p.group);
        this.powerups.push(ent);
      }
    }
  }

  addStreak() {
    this.streak++;
    this.streakT = 2.2;
  }

  scoreAdd(v) {
    this.score += v * this.mult;
  }

  applyPower(p) {
    this.scoreAdd(100);
    audio.power();
    if (p.type === 'shield') this.shield = Math.min(100, this.shield + 60);
    else if (p.type === 'rapid') this.rapid = 8;
    else if (p.type === 'double') this.double = 8;
    this.particles.spawn(this.px, this.py, 0, p.type === 'shield' ? 0x38b6ff : p.type === 'rapid' ? 0xffa028 : 0x4dff9a, 24, 12, 0.7);
    if (this.onToast) this.onToast(p.label);
  }

  damage(amount) {
    if (this.state !== 'playing') return;
    this.shield -= amount;
    this.invuln = Math.max(this.invuln, 1.4);
    this.camShake = Math.min(2.6, this.camShake + 1.1);
    audio.hitShield();
    this.particles.spawn(this.px, this.py, 0, 0x66ccff, 18, 13, 0.6);
    if (this.shield <= 0) {
      this.lives--;
      this.shield = 100;
      this.invuln = 2.6;
      this.camShake = 2.6;
      audio.boom(true);
      this.particles.spawn(this.px, this.py, 0, 0x66f2ff, 40, 20, 1.1);
      this.particles.spawn(this.px, this.py, 0, 0xff7733, 34, 16, 0.9);
      if (this.lives <= 0) {
        this.state = 'gameover';
        this.goTimer = 0;
        this.ship.group.visible = false;
        this.particles.spawn(this.px, this.py, 0, 0xffffff, 50, 24, 1.4);
        audio.engine(false);
        audio.die();
      } else if (this.onToast) {
        this.onToast('¡NAVE DAÑADA!');
      }
    }
  }

  // Puntuación por distancia
  addDistanceScore(dt) {
    if (this.state === 'playing') this.score += this.speed * dt * 0.55;
  }
}
