/* ============================================================
   input.js — Entrada multiplataforma
   📱 Móvil:  arrastre para pilotar + botones FUEGO / TURBO
   🖥️ PC:    ratón o WASD/flechas · ESPACIO dispara · SHIFT turbo
   ============================================================ */
export class Input {
  constructor({ onFirstGesture, onPauseToggle }) {
    this.keys = Object.create(null);
    this.fireHeld = false;
    this.boostHeld = false;
    this.mouse = { x: 0, y: 0, has: false };
    this.dragDX = 0;
    this.dragDY = 0;
    this.dragging = false;
    this._id = null;
    this._lx = 0;
    this._ly = 0;

    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (e.code === 'Space') this.fireHeld = true;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.boostHeld = true;
      if (e.code === 'KeyP' || e.code === 'Escape') onPauseToggle();
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'Space') this.fireHeld = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.boostHeld = false;
    });
    window.addEventListener('blur', () => {
      this.keys = Object.create(null);
      this.fireHeld = false;
      this.boostHeld = false;
      this.dragging = false;
    });

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -((e.clientY / window.innerHeight) * 2 - 1);
        this.mouse.has = true;
      } else if (this.dragging && e.pointerId === this._id) {
        this.dragDX += e.clientX - this._lx;
        this.dragDY += e.clientY - this._ly;
        this._lx = e.clientX;
        this._ly = e.clientY;
      }
    }, { passive: true });

    window.addEventListener('pointerdown', (e) => {
      onFirstGesture();
      if (e.target.closest && e.target.closest('button, .panel')) return; // UI, no pilotar
      if (e.pointerType !== 'mouse') {
        this.dragging = true;
        this._id = e.pointerId;
        this._lx = e.clientX;
        this._ly = e.clientY;
      } else {
        this.fireHeld = true;
      }
    }, { passive: true });

    const up = (e) => {
      if (this.dragging && e.pointerId === this._id) {
        this.dragging = false;
        this._id = null;
      }
      if (e.pointerType === 'mouse') this.fireHeld = false;
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);

    this._bindHold(document.getElementById('btn-fire'), (v) => (this.fireHeld = v));
    this._bindHold(document.getElementById('btn-boost'), (v) => (this.boostHeld = v));
  }

  _bindHold(el, set) {
    if (!el) return;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); set(true); });
    el.addEventListener('pointerup', (e) => { e.stopPropagation(); set(false); });
    el.addEventListener('pointercancel', (e) => { e.stopPropagation(); set(false); });
    el.addEventListener('pointerleave', (e) => { e.stopPropagation(); set(false); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  keyVec() {
    let x = 0, y = 0;
    if (this.keys.ArrowLeft || this.keys.KeyA) x -= 1;
    if (this.keys.ArrowRight || this.keys.KeyD) x += 1;
    if (this.keys.ArrowUp || this.keys.KeyW) y += 1;
    if (this.keys.ArrowDown || this.keys.KeyS) y -= 1;
    return { x, y };
  }
}
