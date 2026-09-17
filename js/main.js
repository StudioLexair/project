/* ============================================================
   main.js — Arranque, máquina de estados y HUD
   ============================================================ */
import * as THREE from '../libs/three.module.js';
import { createEnvironment } from './world.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { audio } from './audio.js';

const $ = (id) => document.getElementById(id);

/* ---------------- renderer / escena / cámara ---------------- */
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04060f);
scene.fog = new THREE.FogExp2(0x060a18, 0.0052);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1500);
camera.position.set(0, 2.1, 8.6);

const env = createEnvironment(scene);
const game = new Game(scene, camera);

/* ---------------- HUD ---------------- */
const LIFE_SVG =
  '<svg viewBox="0 0 24 24" width="17" height="17"><path d="M12 2 L19.5 20 L12 15.6 L4.5 20 Z" fill="#7fd8ff"/></svg>';

const hud = {
  scoreEl: $('hud-score'),
  bestEl: $('hud-best'),
  speedEl: $('hud-speed'),
  comboEl: $('hud-combo'),
  shieldEl: $('hud-shield'),
  livesEl: $('hud-lives'),
  powersEl: $('hud-powers'),
  sectorEl: $('hud-sector'),
  missionEl: $('hud-mission'),
  missionFillEl: $('hud-mission-fill'),
  levelEl: $('hud-level'),
  radarEl: $('combat-radar'),
  _lives: -1,
  drawRadar(threats = []) {
    const c = this.radarEl;
    const g = c.getContext('2d');
    const mid = 60;
    g.clearRect(0, 0, 120, 120);
    g.strokeStyle = 'rgba(46,230,255,.38)'; g.lineWidth = 1;
    for (const r of [18, 36, 55]) { g.beginPath(); g.arc(mid, mid, r, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(mid, 5); g.lineTo(mid, 115); g.moveTo(5, mid); g.lineTo(115, mid); g.stroke();
    g.fillStyle = '#8ff5ff'; g.beginPath(); g.moveTo(mid, 51); g.lineTo(55, 66); g.lineTo(60, 63); g.lineTo(65, 66); g.closePath(); g.fill();
    for (const t of threats) {
      const scale = 52 / Math.max(110, t.distance);
      let x = t.side * scale, y = -t.forward * scale;
      const len = Math.hypot(x, y);
      if (len > 52) { x *= 52 / len; y *= 52 / len; }
      g.fillStyle = t.locked ? '#ffd34d' : t.altitude > 8 ? '#ff7890' : t.altitude < -8 ? '#b62545' : '#ff304d';
      g.shadowColor = g.fillStyle; g.shadowBlur = t.locked ? 9 : 5;
      g.beginPath(); g.arc(mid + x, mid + y, t.locked ? 3.8 : 2.6, 0, Math.PI * 2); g.fill();
    }
    g.shadowBlur = 0;
  },
  update(d, best) {
    if (this.scoreEl._v !== d.score) {
      this.scoreEl._v = d.score;
      this.scoreEl.textContent = d.score.toLocaleString('es');
    }
    if (this.bestEl._v !== best) {
      this.bestEl._v = best;
      this.bestEl.textContent = best.toLocaleString('es');
    }
    this.speedEl.textContent = d.speed.toFixed(1) + '×';
    const sh = Math.max(0, Math.round(d.shield));
    const shieldPct = Math.min(100, (sh / (d.maxShield || 100)) * 100);
    this.shieldEl.style.width = shieldPct + '%';
    this.shieldEl.classList.toggle('low', shieldPct < 35);
    this.sectorEl.textContent = d.sectorName;
    this.missionEl.textContent = `${d.contract} · ${d.missionKills}/${d.missionGoal} · OLEADA ${d.wave} · RUMBO ${Math.round(d.heading)}°`;
    this.missionFillEl.style.width = `${Math.min(100, d.missionKills / d.missionGoal * 100)}%`;
    this.levelEl.textContent = `PILOTO NV. ${d.level} · XP ${Math.floor(d.xp)}/${d.nextXp}`;
    this.drawRadar(d.threats);
    if (this._lives !== d.lives) {
      this._lives = d.lives;
      let html = '';
      for (let i = 0; i < 3; i++) html += `<span class="${i < d.lives ? '' : 'off'}">${LIFE_SVG}</span>`;
      this.livesEl.innerHTML = html;
    }
    const m = d.mult;
    if (m > 1) {
      this.comboEl.classList.remove('hidden');
      if (this.comboEl._v !== m) {
        this.comboEl._v = m;
        this.comboEl.textContent = '×' + m + ' COMBO';
      }
    } else {
      this.comboEl.classList.add('hidden');
      this.comboEl._v = 1;
    }
    let powers = '';
    if (d.rapid > 0) powers += `<div class="power-chip rapid"><span>TIRO RÁPIDO</span><i style="width:${(d.rapid / 8) * 100}%"></i></div>`;
    if (d.double > 0) powers += `<div class="power-chip double"><span>DISPARO DOBLE</span><i style="width:${(d.double / 8) * 100}%"></i></div>`;
    if (this.powersEl._html !== powers) {
      this.powersEl._html = powers;
      this.powersEl.innerHTML = powers;
    }
  },
};

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1500);
}

/* ---------------- récord ---------------- */
let best = parseInt(localStorage.getItem('nebulaStrikeBest') || '0', 10) || 0;

/* ---------------- estados ---------------- */
const menuEl = $('menu');
const goEl = $('gameover');
const pauseEl = $('paused');
const hudEl = $('hud');
const btnPause = $('btn-pause');
const btnFire = $('btn-fire');
const btnBoost = $('btn-boost');

let state = 'menu'; // 'menu' | 'playing' | 'paused' | 'gameover'

function setClass(el, on) { el.classList.toggle('hidden', !on); }

function showMenu() {
  state = 'menu';
  document.body.classList.remove('aiming');
  $('aim-reticle').classList.add('hidden');
  $('target-lock').classList.add('hidden');
  game.reset(true);
  audio.engine(false);
  setClass(menuEl, true);
  setClass(goEl, false);
  setClass(pauseEl, false);
  setClass(hudEl, false);
  setClass(btnPause, false);
  setClass(btnFire, false);
  setClass(btnBoost, false);
}

function startGame() {
  audio.unlock();
  audio.click();
  game.start();
  state = 'playing';
  document.body.classList.add('aiming');
  setClass(menuEl, false);
  setClass(goEl, false);
  setClass(pauseEl, false);
  setClass(hudEl, true);
  setClass(btnPause, true);
  setClass(btnFire, true);
  setClass(btnBoost, true);
  toast('¡A VOLAR!');
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    document.body.classList.remove('aiming');
    $('aim-reticle').classList.add('hidden');
    $('target-lock').classList.add('hidden');
    audio.suspend();
    setClass(pauseEl, true);
  } else if (state === 'paused') {
    resume();
  }
}

function resume() {
  state = 'playing';
  document.body.classList.add('aiming');
  audio.resume();
  setClass(pauseEl, false);
}

function toMenu() {
  audio.resume();
  audio.click();
  showMenu();
}

/* ---------------- callbacks del juego ---------------- */
game.onHud = (d) => {
  if (d.score > best) best = d.score;
  hud.update(d, best);
};
game.onToast = toast;
game.onTarget = (d) => {
  const reticle = $('aim-reticle');
  const lock = $('target-lock');
  reticle.classList.toggle('hidden', !d.visible || state !== 'playing');
  if (d.visible) {
    reticle.style.left = `${d.x}px`;
    reticle.style.top = `${d.y}px`;
    reticle.classList.toggle('locked', d.locked);
  }
  const showLock = !!d.target && state === 'playing';
  lock.classList.toggle('hidden', !showLock);
  if (showLock) {
    lock.style.left = `${d.target.x}px`;
    lock.style.top = `${d.target.y}px`;
    $('target-distance').textContent = `HOSTIL · ${d.target.distance}u · ${Math.ceil(d.target.hp)}/${d.target.maxHp}`;
  }
};
game.onGameOver = (score) => {
  state = 'gameover';
  document.body.classList.remove('aiming');
  $('aim-reticle').classList.add('hidden');
  $('target-lock').classList.add('hidden');
  audio.resume();
  setClass(pauseEl, false);
  localStorage.setItem('nebulaStrikeBest', String(best));
  $('go-score').textContent = score.toLocaleString('es');
  $('go-best').textContent = 'RÉCORD: ' + best.toLocaleString('es') + (score >= best && score > 0 ? '  ·  ¡NUEVO!' : '');
  setClass(goEl, true);
  setClass(hudEl, false);
  setClass(btnPause, false);
  setClass(btnFire, false);
  setClass(btnBoost, false);
};

/* ---------------- botones ---------------- */
function bindSoundButtons() {
  const sfx = () => $('btn-sfx');
  const mus = () => $('btn-music');
  const sfxP = () => $('btn-pause-sfx');
  const musP = () => $('btn-pause-music');
  const refresh = () => {
    sfx().textContent = 'SONIDO: ' + (audio.sfxOn ? 'SÍ' : 'NO');
    mus().textContent = 'MÚSICA: ' + (audio.musicOn ? 'SÍ' : 'NO');
    sfxP().textContent = 'SONIDO: ' + (audio.sfxOn ? 'SÍ' : 'NO');
    musP().textContent = 'MÚSICA: ' + (audio.musicOn ? 'SÍ' : 'NO');
  };
  const wire = (btn, key) => btn.addEventListener('click', () => {
    audio.unlock();
    audio[key] = !audio[key];
    audio.click();
    refresh();
  });
  wire($('btn-sfx'), 'sfxOn');
  wire($('btn-music'), 'musicOn');
  wire(sfxP(), 'sfxOn');
  wire(musP(), 'musicOn');
  refresh();
}
bindSoundButtons();

$('btn-play').addEventListener('click', startGame);
$('btn-retry').addEventListener('click', startGame);
$('btn-menu').addEventListener('click', toMenu);
$('btn-quit').addEventListener('click', toMenu);
$('btn-resume').addEventListener('click', resume);
btnPause.addEventListener('click', (e) => { e.stopPropagation(); togglePause(); });

/* ---------------- input ---------------- */
const input = new Input({
  onFirstGesture: () => audio.unlock(),
  onPauseToggle: () => { if (state === 'playing' || state === 'paused') togglePause(); },
});

/* ---------------- bucle principal ---------------- */
let last = performance.now();
let firstFrame = true;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;

  if (state !== 'paused') {
    game.addDistanceScore(dt);
    game.update(dt, input);
    env.setSector(game.sector);
    env.update(dt, game.speed, game.t, game.position);
  }
  renderer.render(scene, camera);

  if (firstFrame) {
    firstFrame = false;
    const loader = $('loading');
    const hide = () => loader.classList.add('hidden');
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(hide).catch(hide);
    setTimeout(hide, 2500);
    if (state === 'menu') setClass(menuEl, true);
  }
}
requestAnimationFrame(frame);

/* ---------------- ajuste de ventana ---------------- */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') togglePause();
});
window.addEventListener('beforeunload', () => {
  localStorage.setItem('nebulaStrikeBest', String(best));
});

/* ---------------- PWA (Android) ---------------- */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
