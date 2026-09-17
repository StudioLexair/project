/* Smoke test: simula 120 s de juego a 60 fps con un piloto virtual
   (sin navegador ni WebGL) para detectar errores de lógica/runtime. */
const gradientStub = { addColorStop() {} };
const ctxStub = new Proxy({}, {
  get: (t, p) => {
    if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => gradientStub;
    if (p === 'measureText') return () => ({ width: 0 });
    if (p === 'canvas') return {};
    return typeof p === 'string' ? () => {} : undefined;
  },
  set: () => true,
});
globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {} };
globalThis.document = {
  createElement: (tag) => {
    if (tag === 'canvas') return { width: 256, height: 256, getContext: () => ctxStub, style: {} };
    return { style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {} };
  },
  addEventListener() {},
  getElementById: () => null,
  fonts: { ready: Promise.resolve() },
  hidden: false,
};
globalThis.localStorage = { getItem: () => null, setItem() {} };

const THREE = await import('../libs/three.module.js');
const { Game } = await import('../js/game.js');
const { createEnvironment } = await import('../js/world.js');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 1500);
createEnvironment(scene);
const game = new Game(scene, camera);
let hudFrames = 0;
game.onHud = () => hudFrames++;
game.onToast = () => {};
game.onGameOver = (s) => console.log(`GAMEOVER → score ${Math.floor(s)}`);
game.start();

const input = {
  fireHeld: true,
  boostHeld: false,
  mouse: { x: 0, y: 0, has: true },
  dragging: false,
  dragDX: 0,
  dragDY: 0,
  keyVec: () => ({ x: 0, y: 0 }),
};

const dt = 1 / 60;
let frames = 0;
let aimedShot = false;
let enemyAhead = false;
let enemyBehind = false;
for (let f = 0; f < 120 * 60; f++) {
  input.mouse.x = Math.sin(f * 0.011) * 0.9 + Math.sin(f * 0.0037) * 0.3;
  input.mouse.y = Math.cos(f * 0.0071) * 0.7;
  input.boostHeld = (f / 60) % 4 < 1;
  input.dragDX = (f % 7 === 0) ? 12 : 0;
  input.dragDY = (f % 11 === 0) ? -9 : 0;
  game.addDistanceScore(dt);
  game.update(dt, input);
  if (game.bullets.some((b) => Math.abs(b.vx) > 1 || Math.abs(b.vy) > 1)) aimedShot = true;
  for (const e of game.enemies) {
    const rel = new THREE.Vector3(e.x, e.y, e.z).sub(game.position);
    if (rel.dot(game.forward) > 10) enemyAhead = true;
    if (rel.dot(game.forward) < -10) enemyBehind = true;
  }
  frames++;
  if (game.state === 'gameover') {
    console.log(`Game over en el segundo ${(f / 60).toFixed(1)}`);
    // seguir simulando 5 s en estado game over
    for (let g = 0; g < 300; g++) game.update(dt, input);
    break;
  }
}
if (!aimedShot) throw new Error('El disparo no siguió la dirección de la mira');
if (game.distanceTravelled < 500) throw new Error('La nave no recorrió el mundo libre');
if (!enemyAhead || !enemyBehind) throw new Error('Las oleadas no rodearon al jugador');
console.log('frames simuladas:', frames);
console.log('vuelo libre:', Math.round(game.distanceTravelled), 'unidades');
console.log('oleada 360°:', enemyAhead && enemyBehind ? 'OK' : 'ERROR');
console.log('disparo direccional:', aimedShot ? 'OK' : 'ERROR');
console.log('score final:', Math.floor(game.score));
console.log('HUD frames:', hudFrames);
console.log(
  'entidades vivas → asteroides:', game.asteroids.length,
  '| enemigos:', game.enemies.length,
  '| balas:', game.bullets.length,
  '| rayos:', game.bolts.length,
  '| powerups:', game.powerups.length
);
console.log('OK — sin excepciones');
