import { clamp } from '../core/math';
import type { InputState } from '../match/types';

export type ButtonId = 'action' | 'shoot' | 'dodge' | 'switch';

const KEY_MOVE: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

const KEY_ACTION = new Set(['Space']);
const KEY_SHOOT = new Set(['KeyF', 'KeyK', 'KeyL']);
const KEY_DODGE = new Set(['KeyE', 'KeyJ']);
const KEY_SWITCH = new Set(['Tab', 'KeyQ']);
const KEY_SPRINT = new Set(['ShiftLeft', 'ShiftRight']);

/** Unified keyboard + touch input. Edge-triggered flags are cleared on consume(). */
export class InputManager {
  private keys = new Set<string>();
  private pendingAction = false;
  private pendingDodge = false;
  private pendingSwitch = false;
  private pendingShootRelease = false;
  private shootHeldKeyboard = false;

  /** Touch state, driven by TouchControls. */
  touchMove = { x: 0, y: 0 };
  touchActive = false;
  private touchButtons: Record<ButtonId, boolean> = {
    action: false, shoot: false, dodge: false, switch: false,
  };

  onPause: (() => void) | null = null;
  /** True once any touch input has been seen — used to show the right control hints. */
  usedTouch = false;
  usedKeyboard = false;

  private boundDown = (e: KeyboardEvent) => this.onKeyDown(e);
  private boundUp = (e: KeyboardEvent) => this.onKeyUp(e);
  private boundBlur = () => this.reset();

  attach(): void {
    window.addEventListener('keydown', this.boundDown, { passive: false });
    window.addEventListener('keyup', this.boundUp);
    window.addEventListener('blur', this.boundBlur);
  }

  detach(): void {
    window.removeEventListener('keydown', this.boundDown);
    window.removeEventListener('keyup', this.boundUp);
    window.removeEventListener('blur', this.boundBlur);
    this.reset();
  }

  reset(): void {
    this.keys.clear();
    this.pendingAction = false;
    this.pendingDodge = false;
    this.pendingSwitch = false;
    this.pendingShootRelease = false;
    this.shootHeldKeyboard = false;
    this.touchMove = { x: 0, y: 0 };
    this.touchActive = false;
    for (const k of Object.keys(this.touchButtons) as ButtonId[]) this.touchButtons[k] = false;
  }

  private isTypingTarget(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.isTypingTarget(e)) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      this.onPause?.();
      return;
    }
    if (e.repeat) {
      if (KEY_SHOOT.has(e.code)) e.preventDefault();
      return;
    }
    if (KEY_MOVE[e.code] || KEY_ACTION.has(e.code) || KEY_SHOOT.has(e.code)
      || KEY_DODGE.has(e.code) || KEY_SWITCH.has(e.code) || KEY_SPRINT.has(e.code)) {
      e.preventDefault();
      this.usedKeyboard = true;
    }
    this.keys.add(e.code);
    if (KEY_ACTION.has(e.code)) this.pendingAction = true;
    if (KEY_DODGE.has(e.code)) this.pendingDodge = true;
    if (KEY_SWITCH.has(e.code)) this.pendingSwitch = true;
    if (KEY_SHOOT.has(e.code)) this.shootHeldKeyboard = true;
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.code);
    if (KEY_SHOOT.has(e.code)) {
      const stillHeld = [...KEY_SHOOT].some((k) => this.keys.has(k));
      if (!stillHeld && this.shootHeldKeyboard) {
        this.shootHeldKeyboard = false;
        this.pendingShootRelease = true;
      }
    }
  }

  // ---- touch bridge -------------------------------------------------------

  setTouchMove(x: number, y: number, active: boolean): void {
    this.touchMove = { x, y };
    this.touchActive = active;
    if (active) this.usedTouch = true;
  }

  setTouchButton(id: ButtonId, down: boolean): void {
    this.usedTouch = true;
    if (down && !this.touchButtons[id]) {
      if (id === 'action') this.pendingAction = true;
      if (id === 'dodge') this.pendingDodge = true;
      if (id === 'switch') this.pendingSwitch = true;
    }
    if (id === 'shoot' && !down && this.touchButtons.shoot) {
      this.pendingShootRelease = true;
    }
    this.touchButtons[id] = down;
  }

  /** Current movement vector without consuming edge-triggered flags. */
  peekMove(): { x: number; y: number } {
    let mx = 0;
    let my = 0;
    for (const code of this.keys) {
      const v = KEY_MOVE[code];
      if (v) { mx += v[0]; my += v[1]; }
    }
    const mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; }
    if (this.touchActive && Math.hypot(this.touchMove.x, this.touchMove.y) > 0.05) {
      mx = this.touchMove.x;
      my = this.touchMove.y;
    }
    return { x: mx, y: my };
  }

  /** Read and clear one frame of input. */
  consume(): InputState {
    let mx = 0;
    let my = 0;
    for (const code of this.keys) {
      const v = KEY_MOVE[code];
      if (v) { mx += v[0]; my += v[1]; }
    }
    const mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; }

    let sprint = [...KEY_SPRINT].some((k) => this.keys.has(k));

    if (this.touchActive) {
      const tmag = Math.hypot(this.touchMove.x, this.touchMove.y);
      if (tmag > 0.05) {
        mx = this.touchMove.x;
        my = this.touchMove.y;
        // Push the stick to the edge to sprint — no extra button needed.
        if (tmag > 0.86) sprint = true;
      }
    }

    const state: InputState = {
      moveX: clamp(mx, -1, 1),
      moveY: clamp(my, -1, 1),
      sprint,
      actionPressed: this.pendingAction,
      shootHeld: this.shootHeldKeyboard || this.touchButtons.shoot,
      shootReleased: this.pendingShootRelease,
      dodgePressed: this.pendingDodge,
      switchPressed: this.pendingSwitch,
    };

    this.pendingAction = false;
    this.pendingDodge = false;
    this.pendingSwitch = false;
    this.pendingShootRelease = false;
    return state;
  }

  /** Live (non-consuming) look at whether the shoot button is down. */
  get shootDown(): boolean {
    return this.shootHeldKeyboard || this.touchButtons.shoot;
  }
}
