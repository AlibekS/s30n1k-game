/** Клавиатура и экранные кнопки; наружу — единый снимок управления. */
import type { Controls } from './sim/bike';

type Action = 'gas' | 'brake' | 'back' | 'fwd' | 'hop';

const KEYS: Record<string, Action> = {
  ArrowUp: 'gas', KeyW: 'gas',
  ArrowDown: 'brake', KeyS: 'brake',
  ArrowLeft: 'back', KeyA: 'back',
  ArrowRight: 'fwd', KeyD: 'fwd',
  Space: 'hop', ShiftLeft: 'hop', ShiftRight: 'hop',
};

export class Input {
  private held: Record<Action, boolean> = { gas: false, brake: false, back: false, fwd: false, hop: false };
  private touch: Record<Action, number> = { gas: 0, brake: 0, back: 0, fwd: 0, hop: 0 };
  private pressed = new Set<string>();
  readonly controls: Controls = { throttle: 0, brake: 0, lean: 0, crouch: false };
  onFirstGesture: (() => void) | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.onFirstGesture?.();
      if (e.repeat) { if (KEYS[e.code]) e.preventDefault(); return; }
      const a = KEYS[e.code];
      if (a) { this.held[a] = true; e.preventDefault(); }
      this.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYS[e.code];
      if (a) this.held[a] = false;
    });
    const reset = (): void => this.reset();
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', reset);
  }

  /** Привязывает экранную кнопку к действию (мультитач). */
  bindButton(el: HTMLElement, action: Action): void {
    const down = (e: Event): void => {
      e.preventDefault();
      this.onFirstGesture?.();
      this.touch[action]++;
      el.classList.add('on');
    };
    const up = (e: Event): void => {
      e.preventDefault();
      this.touch[action] = Math.max(0, this.touch[action] - 1);
      if (!this.touch[action]) el.classList.remove('on');
    };
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); down(e); });
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  reset(): void {
    for (const k of Object.keys(this.held) as Action[]) { this.held[k] = false; this.touch[k] = 0; }
    document.querySelectorAll('.tbtn.on').forEach((el) => el.classList.remove('on'));
    this.pressed.clear();
  }

  private on(a: Action): boolean { return this.held[a] || this.touch[a] > 0; }

  /** Нажата ли клавиша с прошлого вызова (одноразово). */
  consume(code: string): boolean {
    return this.pressed.delete(code);
  }

  endFrame(): void { this.pressed.clear(); }

  sample(): Controls {
    const c = this.controls;
    c.throttle = this.on('gas') ? 1 : 0;
    c.brake = this.on('brake') ? 1 : 0;
    c.lean = (this.on('fwd') ? 1 : 0) - (this.on('back') ? 1 : 0);
    c.crouch = this.on('hop');
    return c;
  }
}
