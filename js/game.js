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

const PLAYER_RADIUS = 0.95;
const SECTORS = [
  { name: 'CINTURÓN ORIÓN', goal: 5, contract: 'LIMPIA LA RUTA COMERCIAL' },
  { name: 'FRONTERA CYGNUS', goal: 8, contract: 'DEFIENDE LA ESTACIÓN' },
  { name: 'NEBULOSA CARMESÍ', goal: 10, contract: 'CAZA A LOS CORSARIOS' },
  { name: 'VACÍO DE TITÁN', goal: 12, contract: 'ROMPE EL BLOQUEO' },
];

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
    this.onTarget = null;
    this._seed = 1;
    this.aimPoint = new THREE.Vector3(0, 0, -100);
    this._aimNdc = new THREE.Vector2(0, 0);
    this.lockedEnemy = null;
    this.sector = 0;
    this.missionKills = 0;
    this.level = 1;
    this.xp = 0;
    this.nextXp = 400;
    this.maxShield = 100;
    this.weaponDamage = 1;

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
    this.position = new THREE.Vector3(0, 0, 0);
    this.forward = new THREE.Vector3(0, 0, -1);
    this.right = new THREE.Vector3(1, 0, 0);
    this.up = new THREE.Vector3(0, 1, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.distanceTravelled = 0;
    this.wave = 0;
    this.waveTimer = 1.5;
    this.waveActive = false;
    this.maxShield = 100;
    this.shield = this.maxShield;
    this.lives = 3;
    this.invuln = 0;
    this.score = 0;
    this.elapsed = 0;
    this.sector = 0;
    this.missionKills = 0;
    this.level = 1;
    this.xp = 0;
    this.nextXp = 400;
    this.weaponDamage = 1;
    this.lockedEnemy = null;
    this.streak = 0;
    this.streakT = 0;
    this.rapid = 0;
    this.double = 0;
    this.fireCd = 0;
    this.astT = 0.5;
    this.enT = 2.5;
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
    const playing = this.state === 'playing';
    const boosting = playing && input.boostHeld;

    if (playing) {
      this.elapsed += dt;
      const cruise = 27 + Math.min(15, this.level * 1.25);
      this.speed += (cruise * (boosting ? 2.15 : 1) - this.speed) * Math.min(1, dt * 3.5);
    } else if (this.state === 'menu') {
      this.speed = 12;
    } else {
      this.speed += (0 - this.speed) * Math.min(1, dt * 1.4);
    }
    audio.engineUpdate(Math.min(1.4, this.speed / 65), boosting);

    /* ---------- vuelo libre 3D ---------- */
    let steerX = 0, steerY = 0;
    if (this.state === 'menu') {
      this.yaw = Math.sin(this.t * 0.22) * 0.42;
      this.pitch = Math.sin(this.t * 0.31) * 0.13;
    } else if (playing) {
      const keys = input.keyVec();
      steerX = keys.x;
      steerY = keys.y;
      if (input.mouse?.has && !input.dragging) {
        // El cursor funciona como palanca de vuelo: lejos del centro = giro más fuerte.
        const mx = Math.abs(input.mouse.x) < 0.07 ? 0 : input.mouse.x;
        const my = Math.abs(input.mouse.y) < 0.07 ? 0 : input.mouse.y;
        steerX += mx * 0.92;
        steerY += my * 0.78;
      }
      if (input.dragDX || input.dragDY) {
        this.yaw -= input.dragDX * 0.0044;
        this.pitch -= input.dragDY * 0.0038;
        input.dragDX = 0;
        input.dragDY = 0;
      }
      steerX = THREE.MathUtils.clamp(steerX, -1.35, 1.35);
      steerY = THREE.MathUtils.clamp(steerY, -1.2, 1.2);
      this.yaw -= steerX * 1.18 * dt;
      this.pitch += steerY * 0.92 * dt;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.42, 1.42);
      if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
      if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
    }

    const cp = Math.cos(this.pitch);
    this.forward.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp).normalize();
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
    this.up.crossVectors(this.right, this.forward).normalize();

    if (playing) {
      this.position.addScaledVector(this.forward, this.speed * dt);
      this.distanceTravelled += this.speed * dt;
    }
    this.px = this.position.x;
    this.py = this.position.y;

    if (this.state !== 'gameover') {
      this.roll += ((steerX * 0.72) - this.roll) * Math.min(1, dt * 5.5);
      this.ship.group.position.copy(this.position);
      this.ship.group.rotation.order = 'YXZ';
      this.ship.group.rotation.set(this.pitch, this.yaw, this.roll);
      this.ship.update(this.t, Math.min(1.4, this.speed / 65), boosting);
      if (this.invuln > 0) {
        this.invuln -= dt;
        this.ship.group.visible = Math.floor(this.t * 18) % 2 === 0;
      } else this.ship.group.visible = true;
    }

    /* Cámara perseguidora: gira y mira en el mismo rumbo que la nave. */
    this.camShake *= Math.exp(-4.5 * dt);
    const desiredCam = this.position.clone().addScaledVector(this.forward, -9.5).addScaledVector(this.up, 3.2);
    desiredCam.x += (Math.random() - 0.5) * this.camShake;
    desiredCam.y += (Math.random() - 0.5) * this.camShake;
    desiredCam.z += (Math.random() - 0.5) * this.camShake;
    this.camera.position.lerp(desiredCam, 1 - Math.exp(-7 * dt));
    const look = this.position.clone().addScaledVector(this.forward, 28).addScaledVector(this.up, 0.8);
    this.camera.up.lerp(this.up, Math.min(1, dt * 4)).normalize();
    this.camera.lookAt(look);
    this.camera.updateMatrixWorld(true);

    if (playing) this.updateAim(input);

    /* ---------- armas ---------- */
    if (playing) {
      this.fireCd -= dt;
      this.rapid = Math.max(0, this.rapid - dt);
      this.double = Math.max(0, this.double - dt);
      this.streakT -= dt;
      if (this.streakT <= 0) this.streak = 0;
      if (input.fireHeld && this.fireCd <= 0) {
        this.fire();
        this.fireCd = this.rapid > 0 ? 0.07 : Math.max(0.105, 0.16 - (this.level - 1) * 0.008);
        audio.shoot();
      }
    }

    /* ---------- oleadas y mundo vivo ---------- */
    if (playing) {
      this.astT -= dt;
      if (this.astT <= 0 && this.asteroids.length < 22) {
        this.spawnAsteroid();
        this.astT = 1.1 + Math.random() * 1.2;
      }
      if (this.enemies.length === 0) {
        this.waveTimer -= dt;
        if (this.waveTimer <= 0) this.spawnWave();
      }
      this.pwT -= dt;
      if (this.pwT <= 0) {
        this.spawnPowerup();
        this.pwT = 16 + Math.random() * 9;
      }
    } else if (this.state === 'menu') {
      this.astT -= dt;
      if (this.astT <= 0 && this.asteroids.length < 8) {
        this.spawnAsteroid();
        this.astT = 1.4;
      }
    }

    /* ---------- asteroides libres ---------- */
    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const a = this.asteroids[i];
      a.px = a.x; a.py = a.y; a.pz = a.z;
      a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
      a.mesh.rotation.x += a.rotSpeed * dt;
      a.mesh.rotation.y += a.rotSpeed * 0.7 * dt;
      a.mesh.position.set(a.x, a.y, a.z);
      const dist = a.mesh.position.distanceTo(this.position);
      if (dist > 240) {
        this.scene.remove(a.mesh); a.mesh.geometry.dispose(); this.asteroids.splice(i, 1);
      }
    }

    /* ---------- IA de caza: persecución + órbita ---------- */
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.px = e.x; e.py = e.y; e.pz = e.z;
      const toPlayer = new THREE.Vector3(this.position.x - e.x, this.position.y - e.y, this.position.z - e.z);
      const dist = toPlayer.length() || 1;
      const radial = toPlayer.normalize();
      const tangent = new THREE.Vector3().crossVectors(radial, e.orbitAxis).normalize();
      const radialSpeed = dist > 44 ? 22 + this.sector * 1.6 : dist < 20 ? -16 : 2;
      const desired = radial.multiplyScalar(radialSpeed).addScaledVector(tangent, e.orbitSpeed);
      const turn = Math.min(1, dt * 1.8);
      e.vx += (desired.x - e.vx) * turn;
      e.vy += (desired.y - e.vy) * turn;
      e.vz += (desired.z - e.vz) * turn;
      e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt;
      e.mesh.position.set(e.x, e.y, e.z);
      e.mesh.lookAt(this.position);
      e.mesh.rotateZ(Math.sin(this.t * 2 + e.ph) * 0.18);
      e.update(this.t);
      if (playing) {
        e.cd -= dt;
        if (e.cd <= 0 && dist < 105) {
          this.enemyFire(e);
          e.cd = 1.55 + Math.random() * 1.25;
        }
      }
      if (dist > 310) {
        this.scene.remove(e.mesh); disposeObject(e.mesh); this.enemies.splice(i, 1);
      }
    }

    /* ---------- proyectiles ---------- */
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.px = b.x; b.py = b.y; b.pz = b.z;
      if (b.target && this.enemies.includes(b.target)) {
        const desired = new THREE.Vector3(b.target.x - b.x, b.target.y - b.y, b.target.z - b.z).normalize().multiplyScalar(195);
        const steer = Math.min(1, dt * 5.5);
        b.vx += (desired.x - b.vx) * steer; b.vy += (desired.y - b.vy) * steer; b.vz += (desired.z - b.vz) * steer;
      }
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.age += dt;
      b.mesh.position.set(b.x, b.y, b.z);
      b.mesh.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
      if (b.age > 2.1 || b.mesh.position.distanceTo(this.position) > 260) {
        this.scene.remove(b.mesh); disposeObject(b.mesh); this.bullets.splice(i, 1);
      }
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.px = b.x; b.py = b.y; b.pz = b.z;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.age += dt;
      b.mesh.position.set(b.x, b.y, b.z);
      if (b.age > 5 || b.mesh.position.distanceTo(this.position) > 260) {
        this.scene.remove(b.mesh); disposeObject(b.mesh); this.bolts.splice(i, 1);
      }
    }
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      p.px = p.x; p.py = p.y; p.pz = p.z; p.age += dt;
      p.mesh.position.set(p.x, p.y + Math.sin(this.t * 3 + p.x) * 0.3, p.z);
      p.update(this.t);
      if (p.age > 24 || p.mesh.position.distanceTo(this.position) > 230) {
        this.scene.remove(p.mesh); disposeObject(p.mesh); this.powerups.splice(i, 1);
      }
    }

    if (playing) {
      this.updateTargetHud(input);
      this.collisions();
    }
    this.particles.update(dt);

    const fovT = 68 + (boosting ? 10 : 0);
    if (Math.abs(fovT - this.fov) > 0.02) {
      this.fov += (fovT - this.fov) * Math.min(1, 6 * dt);
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    if (this.state === 'gameover' && !this._goFired) {
      this.goTimer += dt;
      if (this.goTimer > 1 && this.onGameOver) { this._goFired = true; this.onGameOver(this.score); }
    }

    if (playing && this.onHud) {
      const mission = SECTORS[this.sector % SECTORS.length];
      this.onHud({
        score: Math.floor(this.score), shield: this.shield, maxShield: this.maxShield,
        lives: this.lives, speed: this.speed / 27, mult: this.mult,
        rapid: this.rapid, double: this.double, sector: this.sector,
        sectorName: mission.name, contract: mission.contract,
        missionKills: this.missionKills, missionGoal: mission.goal,
        level: this.level, xp: this.xp, nextXp: this.nextXp,
        wave: this.wave, heading: ((THREE.MathUtils.radToDeg(this.yaw) % 360) + 360) % 360,
        threats: this.enemies.map((e) => {
          const rel = new THREE.Vector3(e.x, e.y, e.z).sub(this.position);
          return {
            side: rel.dot(this.right), forward: rel.dot(this.forward), altitude: rel.dot(this.up),
            distance: rel.length(), locked: e === this.lockedEnemy,
          };
        }),
      });
    }
  }

  /* ================= acciones ================= */
  updateAim(input) {
    const mouseAim = input.mouse && input.mouse.has;
    this._aimNdc.set(mouseAim ? input.mouse.x : 0, mouseAim ? input.mouse.y : 0);

    const probe = new THREE.Vector3(this._aimNdc.x, this._aimNdc.y, 0.2).unproject(this.camera);
    const direction = probe.sub(this.camera.position).normalize();
    this.aimPoint.copy(this.camera.position).addScaledVector(direction, 180);

    let best = null;
    let bestD = mouseAim ? 0.2 : 0.42;
    const projected = new THREE.Vector3();
    for (const e of this.enemies) {
      projected.set(e.x, e.y, e.z).project(this.camera);
      if (projected.z < -1 || projected.z > 1) continue;
      const dx = projected.x - this._aimNdc.x;
      const dy = projected.y - this._aimNdc.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { bestD = d; best = e; }
    }
    this.lockedEnemy = best;
    for (const e of this.enemies) {
      const targetScale = e === best ? 1.22 : 1;
      e.mesh.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.28);
    }
    if (best) this.aimPoint.set(best.x, best.y, best.z);
  }

  updateTargetHud(input) {
    if (!this.onTarget) return;
    let target = null;
    if (this.lockedEnemy && this.enemies.includes(this.lockedEnemy)) {
      const p = new THREE.Vector3(this.lockedEnemy.x, this.lockedEnemy.y, this.lockedEnemy.z).project(this.camera);
      target = {
        x: (p.x * 0.5 + 0.5) * window.innerWidth,
        y: (-p.y * 0.5 + 0.5) * window.innerHeight,
        distance: Math.round(new THREE.Vector3(this.lockedEnemy.x, this.lockedEnemy.y, this.lockedEnemy.z).distanceTo(this.position)),
        hp: this.lockedEnemy.hp,
        maxHp: this.lockedEnemy.maxHp,
      };
    }
    this.onTarget({
      visible: !!(input.mouse && input.mouse.has),
      x: input.mouse?.clientX || window.innerWidth * 0.5,
      y: input.mouse?.clientY || window.innerHeight * 0.5,
      locked: !!target,
      target,
    });
  }

  fire() {
    const offsets = (this.double > 0 || this.level >= 4) ? [-0.48, 0.48] : [0];
    for (const off of offsets) {
      const origin = this.position.clone().addScaledVector(this.right, off * 1.7).addScaledVector(this.forward, 1.4);
      const dir = new THREE.Vector3().subVectors(this.aimPoint, origin).normalize();
      const mesh = createPlayerBullet();
      mesh.position.copy(origin);
      mesh.lookAt(this.aimPoint);
      this.scene.add(mesh);
      this.bullets.push({
        x: origin.x, y: origin.y, z: origin.z, px: origin.x, py: origin.y, pz: origin.z,
        vx: dir.x * 195, vy: dir.y * 195, vz: dir.z * 195, age: 0,
        damage: this.weaponDamage, target: this.lockedEnemy, mesh,
      });
      this.particles.spawn(origin.x, origin.y, origin.z, 0x66f2ff, 2, 5, 0.22, 0.5);
    }
  }

  randomDirection() {
    const y = Math.random() * 2 - 1;
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    return new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r);
  }

  spawnAsteroid() {
    this._seed++;
    const r = 0.8 + Math.pow(Math.random(), 1.6) * 2.2;
    const mesh = new THREE.Mesh(makeAsteroidGeometry(r, this._seed), asteroidMat);
    const pos = this.position.clone().addScaledVector(this.randomDirection(), 75 + Math.random() * 135);
    const drift = this.randomDirection().multiplyScalar(1 + Math.random() * 5);
    const a = {
      x: pos.x, y: pos.y, z: pos.z,
      vx: drift.x, vy: drift.y, vz: drift.z, r,
      rotSpeed: 0.35 + Math.random() * 1.2,
      score: r < 1.4 ? 25 : r < 2.2 ? 50 : 100, mesh,
    };
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.asteroids.push(a);
  }

  spawnWave() {
    this.wave++;
    const count = Math.min(10, 3 + Math.ceil(this.wave * 0.55) + Math.min(3, this.sector));
    for (let i = 0; i < count; i++) this.spawnEnemy(i, count);
    this.waveTimer = 3.5;
    if (this.onToast) this.onToast(`¡OLEADA ${this.wave} · ${count} HOSTILES!`);
  }

  spawnEnemy(index = 0, count = 1) {
    const model = createEnemy();
    // Distribución circular con profundidad alterna: frente, flancos, arriba, abajo y retaguardia.
    const angle = (index / Math.max(1, count)) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const flank = this.right.clone().multiplyScalar(Math.cos(angle));
    flank.addScaledVector(this.up, Math.sin(angle));
    flank.addScaledVector(this.forward, ((index % 3) - 1) * 0.9 + (Math.random() - 0.5) * 0.35).normalize();
    const pos = this.position.clone().addScaledVector(flank, 68 + Math.random() * 50);
    const hp = 1 + Math.floor(this.sector / 2) + (Math.random() < 0.18 ? 1 : 0);
    const axis = this.randomDirection();
    const ent = {
      x: pos.x, y: pos.y, z: pos.z,
      vx: 0, vy: 0, vz: 0,
      hp, maxHp: hp,
      ph: Math.random() * Math.PI * 2,
      orbitAxis: axis,
      orbitSpeed: (Math.random() < 0.5 ? -1 : 1) * (9 + Math.random() * 8),
      cd: 0.8 + Math.random() * 1.3,
      mesh: model.group, update: model.update,
    };
    model.group.position.copy(pos);
    model.group.lookAt(this.position);
    this.scene.add(model.group);
    this.enemies.push(ent);
  }

  spawnPowerup() {
    const types = ['shield', 'rapid', 'double'];
    const type = types[(Math.random() * types.length) | 0];
    const p = createPowerup(type);
    const pos = this.position.clone().addScaledVector(this.forward, 24 + Math.random() * 20)
      .addScaledVector(this.right, (Math.random() - 0.5) * 24)
      .addScaledVector(this.up, (Math.random() - 0.5) * 16);
    const ent = {
      type, x: pos.x, y: pos.y, z: pos.z, age: 0,
      mesh: p.group, update: p.update, label: p.label,
    };
    p.group.position.copy(pos);
    this.scene.add(p.group);
    this.powerups.push(ent);
  }

  enemyFire(e) {
    const mesh = createEnemyBolt();
    const dx = this.position.x - e.x, dy = this.position.y - e.y, dz = this.position.z - e.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const sp = 48 + Math.min(18, this.sector * 2);
    const bolt = {
      x: e.x, y: e.y, z: e.z, age: 0,
      vx: (dx / d) * sp, vy: (dy / d) * sp, vz: (dz / d) * sp, mesh,
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
          if (segSphere(b.px, b.py, b.pz, b.x, b.y, b.z, e.x, e.y, e.z, 1.15)) {
            e.hp -= b.damage || 1;
            this.particles.spawn(e.x, e.y, e.z, 0xff4055, 8, 8, 0.35);
            if (e.hp <= 0) this.destroyEnemy(j, true);
            else audio.hitShield();
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
      if (segSphere(b.px, b.py, b.pz, b.x, b.y, b.z, this.position.x, this.position.y, this.position.z, 0.85)) {
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
      if (segSphere(a.px, a.py, a.pz, a.x, a.y, a.z, this.position.x, this.position.y, this.position.z, a.r * 0.85 + PLAYER_RADIUS)) {
        this.destroyAsteroid(j, false);
        this.damage(45);
        return;
      }
    }
    // enemigos vs jugador
    for (let j = this.enemies.length - 1; j >= 0; j--) {
      const e = this.enemies[j];
      if (segSphere(e.px, e.py, e.pz, e.x, e.y, e.z, this.position.x, this.position.y, this.position.z, 0.9 + PLAYER_RADIUS)) {
        this.destroyEnemy(j, false);
        this.damage(40);
        return;
      }
    }
    // power-ups vs jugador
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      if (segSphere(p.px, p.py, p.pz, p.x, p.y, p.z, this.position.x, this.position.y, this.position.z, 0.9 + 1.15)) {
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
      this.gainXp(Math.max(8, Math.floor(a.score * 0.18)));
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
            vx: a.vx + (Math.random() - 0.5) * 12,
            vy: a.vy + (Math.random() - 0.5) * 12,
            vz: a.vz + (Math.random() - 0.5) * 12,
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
      this.scoreAdd(150 + this.sector * 35);
      this.addStreak();
      this.gainXp(120 + this.sector * 20);
      this.missionKills++;
      this.checkMission();
      if (Math.random() < 0.18) {
        const dropType = ['shield', 'rapid', 'double'][(Math.random() * 3) | 0];
        const p = createPowerup(dropType);
        const ent = {
          type: dropType,
          x: e.x, y: e.y, z: e.z, age: 0,
          mesh: p.group, update: p.update, label: p.label,
        };
        p.group.position.set(e.x, e.y, e.z);
        this.scene.add(p.group);
        this.powerups.push(ent);
      }
    }
  }

  gainXp(amount) {
    this.xp += amount;
    while (this.xp >= this.nextXp) {
      this.xp -= this.nextXp;
      this.level++;
      this.nextXp = Math.floor(this.nextXp * 1.38);
      if (this.level === 3) {
        this.maxShield = 125;
        this.shield = this.maxShield;
      }
      if (this.level % 3 === 0) this.weaponDamage += 0.5;
      if (this.onToast) {
        const unlock = this.level === 3 ? ' · ESCUDO +25' : this.level === 4 ? ' · CAÑÓN DOBLE' : '';
        this.onToast(`¡NIVEL ${this.level}${unlock}!`);
      }
      audio.power();
    }
  }

  checkMission() {
    const mission = SECTORS[this.sector % SECTORS.length];
    if (this.missionKills < mission.goal) return;
    this.scoreAdd(1000 + this.sector * 250);
    this.sector++;
    this.missionKills = 0;
    this.wave = 0;
    this.waveTimer = 4;
    this.shield = Math.min(this.maxShield, this.shield + 45);
    this.spawnPowerup();
    const next = SECTORS[this.sector % SECTORS.length];
    if (this.onToast) this.onToast(`SECTOR LIBERADO · ${next.name}`);
    audio.power();
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
    if (p.type === 'shield') this.shield = Math.min(this.maxShield, this.shield + 60);
    else if (p.type === 'rapid') this.rapid = 8;
    else if (p.type === 'double') this.double = 8;
    this.particles.spawn(this.position.x, this.position.y, this.position.z, p.type === 'shield' ? 0x38b6ff : p.type === 'rapid' ? 0xffa028 : 0x4dff9a, 24, 12, 0.7);
    if (this.onToast) this.onToast(p.label);
  }

  damage(amount) {
    if (this.state !== 'playing') return;
    this.shield -= amount;
    this.invuln = Math.max(this.invuln, 1.4);
    this.camShake = Math.min(2.6, this.camShake + 1.1);
    audio.hitShield();
    this.particles.spawn(this.position.x, this.position.y, this.position.z, 0x66ccff, 18, 13, 0.6);
    if (this.shield <= 0) {
      this.lives--;
      this.shield = this.maxShield;
      this.invuln = 2.6;
      this.camShake = 2.6;
      audio.boom(true);
      this.particles.spawn(this.position.x, this.position.y, this.position.z, 0x66f2ff, 40, 20, 1.1);
      this.particles.spawn(this.position.x, this.position.y, this.position.z, 0xff7733, 34, 16, 0.9);
      if (this.lives <= 0) {
        this.state = 'gameover';
        this.goTimer = 0;
        this.ship.group.visible = false;
        this.particles.spawn(this.position.x, this.position.y, this.position.z, 0xffffff, 50, 24, 1.4);
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
