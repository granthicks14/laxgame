import { clamp } from '../core/math';
import {
  MOVE_ACTIONS, PAUSE_ACTION, SPRINT_ACTION,
  type ControlScheme, type Keybinds,
} from '../state/keybinds';

/** Pixel radius of full stick deflection. */
const STICK_RADIUS = 58;
/** Below this fraction of the radius the stick reads as centred. */
const STICK_DEADZONE = 0.16;
/** At or beyond this fraction, the player sprints. */
const STICK_SPRINT = 0.82;

export interface StickState {
  active: boolean;
  /** Where the finger went down, in client coordinates. */
  originX: number;
  originY: number;
  /** Nub offset from the origin in pixels, already clamped to the radius. */
  dx: number;
  dy: number;
  /** Normalised direction after the dead zone, magnitude 0..1. */
  x: number;
  y: number;
}

/**
 * One frame of input, in the sport's own vocabulary.
 *
 * Movement is universal — every sport in the hub moves a player around a
 * surface — so it is read here. Everything else is the sport's own action set,
 * reported as three sets a game engine can ask questions of: what was pressed
 * this frame, what is being held, and what was released this frame. A sport
 * turns that into its own input type (see `laxInput`, `hoopsInput`) so its
 * engine never handles raw strings.
 */
export interface RawInput {
  moveX: number;
  moveY: number;
  sprint: boolean;
  /** Went down this frame. */
  pressed: ReadonlySet<string>;
  /** Down right now, however long it has been down. */
  held: ReadonlySet<string>;
  /** Came up this frame. */
  released: ReadonlySet<string>;
}

export const neutralRaw = (): RawInput => ({
  moveX: 0, moveY: 0, sprint: false,
  pressed: new Set(), held: new Set(), released: new Set(),
});

type PointerRole = 'stick' | { action: string };

/* ===========================================================================
 * INPUT
 *
 * One owner for every input channel, for every sport, built so movement can
 * never stick on:
 *
 *  - Pointer move/up/cancel are bound to the WINDOW, not the game element, so a
 *    finger released anywhere (or outside the viewport) still ends the gesture.
 *  - No setPointerCapture. Capture silently breaks when the capturing element is
 *    removed from the DOM, and the matching pointerup never arrives — which is
 *    exactly how a player ends up running in one direction forever.
 *  - Touch events run alongside as a reconciler: TouchEvent.touches is the
 *    authoritative list of fingers still down, so any pointer we think is held
 *    but which is not in that list gets released immediately.
 *  - visibilitychange, pagehide, blur and losing pointer capture all hard-reset.
 *  - The game loop calls sanityCheck() every frame as a final backstop.
 *
 * Every one of those paths funnels into releaseAll(), so there is a single
 * place where "nothing is held" is defined.
 *
 * What the manager knows about a SPORT is only what its control scheme
 * declares: the action ids, which keys drive them, which of them are on-screen
 * buttons, and which are held rather than tapped. Adding a sport adds no code
 * here.
 * ========================================================================= */
export class InputManager {
  private keys = new Set<string>();

  private scheme: ControlScheme;
  /** Live bindings. Rebinding while a game is running takes effect at once. */
  private binds: Keybinds;
  private moveKeys = new Map<string, [number, number]>();
  /** KeyboardEvent.code -> the actions it drives, from the live bindings. */
  private actionKeys = new Map<string, string[]>();
  private sprintKeys = new Set<string>();
  private pauseKeys = new Set<string>();

  /** Edge and held state, by action id. */
  private pending = new Set<string>();
  private pendingRelease = new Set<string>();
  private heldKeyboard = new Set<string>();

  /** Which pointer is driving each role. A role with no pointer is not held. */
  private pointerRoles = new Map<number, PointerRole>();
  private buttonPointer = new Map<string, number>();
  private stickPointer: number | null = null;

  readonly stick: StickState = {
    active: false, originX: 0, originY: 0, dx: 0, dy: 0, x: 0, y: 0,
  };

  /** True while the game is paused or otherwise not accepting play input. */
  suspended = false;
  onPause: (() => void) | null = null;
  /** Fired whenever the stick or a button changes, so the HUD can redraw. */
  onVisualChange: (() => void) | null = null;

  usedTouch = false;
  usedKeyboard = false;

  private surface: HTMLElement | null = null;
  private buttonEls = new Map<string, HTMLElement>();

  // --- bound handlers, kept so they can be removed again
  private hKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
  private hKeyUp = (e: KeyboardEvent) => this.onKeyUp(e);
  private hBlur = () => this.releaseAll();
  private hVisibility = () => { if (document.visibilityState !== 'visible') this.releaseAll(); };
  private hPointerMove = (e: PointerEvent) => this.onPointerMove(e);
  private hPointerEnd = (e: PointerEvent) => this.onPointerEnd(e);
  private hLostCapture = (e: PointerEvent) => this.onPointerEnd(e);
  private hTouchReconcile = (e: TouchEvent) => this.reconcileTouches(e);
  private hSurfaceDown = (e: PointerEvent) => this.onPointerDown(e);
  private hContextMenu = (e: Event) => e.preventDefault();

  constructor(scheme: ControlScheme) {
    this.scheme = scheme;
    this.binds = scheme.defaults;
    this.setBindings(scheme.defaults);
  }

  /* ------------------------------------------------------------- lifecycle */

  /** Point the manager at a binding set. Safe to call mid-game. */
  setBindings(binds: Keybinds): void {
    this.binds = binds;
    this.moveKeys.clear();
    this.actionKeys.clear();
    const [up, down, left, right] = MOVE_ACTIONS;
    for (const k of binds[up] ?? []) this.moveKeys.set(k, [0, -1]);
    for (const k of binds[down] ?? []) this.moveKeys.set(k, [0, 1]);
    for (const k of binds[left] ?? []) this.moveKeys.set(k, [-1, 0]);
    for (const k of binds[right] ?? []) this.moveKeys.set(k, [1, 0]);
    this.sprintKeys = new Set(binds[SPRINT_ACTION] ?? []);
    this.pauseKeys = new Set(binds[PAUSE_ACTION] ?? []);
    for (const a of this.scheme.actions) {
      if (a.group !== 'action') continue;
      for (const code of binds[a.id] ?? []) {
        const list = this.actionKeys.get(code);
        if (list) list.push(a.id);
        else this.actionKeys.set(code, [a.id]);
      }
    }
    // A key that has just been rebound must not stay logically held.
    this.keys.clear();
    this.heldKeyboard.clear();
  }

  get bindings(): Keybinds {
    return this.binds;
  }

  get controls(): ControlScheme {
    return this.scheme;
  }

  private isHoldAction(id: string): boolean {
    return this.scheme.hold.includes(id);
  }

  attach(surface?: HTMLElement): void {
    this.surface = surface ?? null;

    window.addEventListener('keydown', this.hKeyDown, { passive: false });
    window.addEventListener('keyup', this.hKeyUp);
    window.addEventListener('blur', this.hBlur);
    document.addEventListener('visibilitychange', this.hVisibility);
    window.addEventListener('pagehide', this.hBlur);

    // Window-level so a release outside the game surface always lands.
    window.addEventListener('pointermove', this.hPointerMove, { passive: false });
    window.addEventListener('pointerup', this.hPointerEnd);
    window.addEventListener('pointercancel', this.hPointerEnd);
    window.addEventListener('lostpointercapture', this.hLostCapture);

    // Touch events carry the authoritative live finger list; used only to
    // reconcile, never to drive movement directly.
    window.addEventListener('touchend', this.hTouchReconcile, { passive: true });
    window.addEventListener('touchcancel', this.hTouchReconcile, { passive: true });

    if (this.surface) {
      this.surface.addEventListener('pointerdown', this.hSurfaceDown, { passive: false });
      this.surface.addEventListener('contextmenu', this.hContextMenu);
    }
  }

  detach(): void {
    window.removeEventListener('keydown', this.hKeyDown);
    window.removeEventListener('keyup', this.hKeyUp);
    window.removeEventListener('blur', this.hBlur);
    document.removeEventListener('visibilitychange', this.hVisibility);
    window.removeEventListener('pagehide', this.hBlur);
    window.removeEventListener('pointermove', this.hPointerMove);
    window.removeEventListener('pointerup', this.hPointerEnd);
    window.removeEventListener('pointercancel', this.hPointerEnd);
    window.removeEventListener('lostpointercapture', this.hLostCapture);
    window.removeEventListener('touchend', this.hTouchReconcile);
    window.removeEventListener('touchcancel', this.hTouchReconcile);
    if (this.surface) {
      this.surface.removeEventListener('pointerdown', this.hSurfaceDown);
      this.surface.removeEventListener('contextmenu', this.hContextMenu);
    }
    this.surface = null;
    this.buttonEls.clear();
    this.releaseAll();
  }

  /** Register an on-screen button. The element only reports presses; all state
   *  lives here so a lost pointerup cannot leave it stuck down. */
  registerButton(id: string, el: HTMLElement): void {
    this.buttonEls.set(id, el);
    el.addEventListener('pointerdown', (e) => {
      const pe = e as PointerEvent;
      pe.preventDefault();
      if (this.suspended) return;
      this.usedTouch = pe.pointerType !== 'mouse';
      if (this.buttonPointer.has(id)) return;
      this.buttonPointer.set(id, pe.pointerId);
      this.pointerRoles.set(pe.pointerId, { action: id });
      this.pressAction(id);
      el.classList.add('is-down');
      this.onVisualChange?.();
    }, { passive: false });
    el.addEventListener('contextmenu', this.hContextMenu);
  }

  /** The single definition of "nothing is held". */
  releaseAll(): void {
    this.keys.clear();
    this.pending.clear();
    this.pendingRelease.clear();
    this.heldKeyboard.clear();

    this.pointerRoles.clear();
    this.stickPointer = null;
    this.stick.active = false;
    this.stick.dx = 0;
    this.stick.dy = 0;
    this.stick.x = 0;
    this.stick.y = 0;

    for (const [id, el] of this.buttonEls) {
      this.buttonPointer.delete(id);
      el.classList.remove('is-down');
    }
    this.buttonPointer.clear();
    this.onVisualChange?.();
  }

  /** Called once per frame from the game loop as a final backstop. */
  sanityCheck(): void {
    if (document.visibilityState !== 'visible' && (this.stick.active || this.anyButtonHeld())) {
      this.releaseAll();
    }
  }

  private anyButtonHeld(): boolean {
    return this.buttonPointer.size > 0;
  }

  /* --------------------------------------------------------------- pointer */

  private onPointerDown(e: PointerEvent): void {
    if (this.suspended) return;
    const target = e.target as HTMLElement | null;
    // Buttons and dialogs handle their own pointers.
    if (target?.closest('.tbtn, .pause-btn, .overlay, button, a, input')) return;
    if (this.stickPointer !== null) return;

    e.preventDefault();
    this.usedTouch = e.pointerType !== 'mouse';
    this.stickPointer = e.pointerId;
    this.pointerRoles.set(e.pointerId, 'stick');
    this.stick.active = true;
    this.stick.originX = e.clientX;
    this.stick.originY = e.clientY;
    this.updateStick(e.clientX, e.clientY);
    this.onVisualChange?.();
  }

  private onPointerMove(e: PointerEvent): void {
    if (e.pointerId !== this.stickPointer) return;
    if (e.cancelable) e.preventDefault();
    this.updateStick(e.clientX, e.clientY);
    this.onVisualChange?.();
  }

  private onPointerEnd(e: PointerEvent): void {
    const role = this.pointerRoles.get(e.pointerId);
    if (role === undefined) return;
    this.pointerRoles.delete(e.pointerId);
    if (role === 'stick') this.clearStick();
    else this.releaseButton(role.action);
    this.onVisualChange?.();
  }

  /** TouchEvent.touches is the live list of fingers; anything we think is held
   *  but which is not in that list is stale and gets released. */
  private reconcileTouches(e: TouchEvent): void {
    if (this.pointerRoles.size === 0) return;
    const live = new Set<number>();
    for (let i = 0; i < e.touches.length; i++) live.add(e.touches[i].identifier);

    // Pointer ids and touch identifiers are not the same number, so the only
    // safe inference is the total-absence case: no fingers left on the screen
    // means nothing driven by touch can still be held.
    if (live.size === 0 && this.usedTouch) this.releaseAll();
  }

  private clearStick(): void {
    this.stickPointer = null;
    this.stick.active = false;
    this.stick.dx = 0;
    this.stick.dy = 0;
    this.stick.x = 0;
    this.stick.y = 0;
  }

  private updateStick(cx: number, cy: number): void {
    let dx = cx - this.stick.originX;
    let dy = cy - this.stick.originY;
    const mag = Math.hypot(dx, dy);

    if (mag > STICK_RADIUS) {
      // Drag the origin along so the stick never runs out of travel: the player
      // can keep swinging in a full circle without lifting a finger.
      this.stick.originX = cx - (dx / mag) * STICK_RADIUS;
      this.stick.originY = cy - (dy / mag) * STICK_RADIUS;
      dx = (dx / mag) * STICK_RADIUS;
      dy = (dy / mag) * STICK_RADIUS;
    }
    this.stick.dx = dx;
    this.stick.dy = dy;

    const norm = Math.min(1, Math.hypot(dx, dy) / STICK_RADIUS);
    if (norm < STICK_DEADZONE) {
      this.stick.x = 0;
      this.stick.y = 0;
      return;
    }
    // Rescale past the dead zone so the first millimetre of real travel is not
    // wasted, and the full range still maps to 0..1.
    const scaled = (norm - STICK_DEADZONE) / (1 - STICK_DEADZONE);
    const inv = 1 / Math.max(1e-6, Math.hypot(dx, dy));
    this.stick.x = dx * inv * scaled;
    this.stick.y = dy * inv * scaled;
  }

  /** A tap or a button press. Hold actions report their release edge instead. */
  private pressAction(id: string): void {
    if (!this.isHoldAction(id)) this.pending.add(id);
  }

  private releaseButton(id: string): void {
    if (!this.buttonPointer.has(id)) return;
    this.buttonPointer.delete(id);
    this.buttonEls.get(id)?.classList.remove('is-down');
    if (this.isHoldAction(id)) this.pendingRelease.add(id);
  }

  /* -------------------------------------------------------------- keyboard */

  private isTypingTarget(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.isTypingTarget(e)) return;
    if (this.pauseKeys.has(e.code)) {
      e.preventDefault();
      this.onPause?.();
      return;
    }
    const known = this.moveKeys.has(e.code) || this.actionKeys.has(e.code)
      || this.sprintKeys.has(e.code);
    if (known) {
      e.preventDefault();
      this.usedKeyboard = true;
    }
    if (e.repeat || this.suspended) return;

    this.keys.add(e.code);
    for (const id of this.actionKeys.get(e.code) ?? []) {
      if (this.isHoldAction(id)) this.heldKeyboard.add(id);
      else this.pending.add(id);
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.code);
    for (const id of this.actionKeys.get(e.code) ?? []) {
      if (!this.isHoldAction(id)) continue;
      const stillHeld = (this.binds[id] ?? []).some((k) => this.keys.has(k));
      if (!stillHeld && this.heldKeyboard.has(id)) {
        this.heldKeyboard.delete(id);
        this.pendingRelease.add(id);
      }
    }
  }

  /* ----------------------------------------------------------------- state */

  private keyboardMove(): { x: number; y: number } {
    let mx = 0;
    let my = 0;
    for (const code of this.keys) {
      const v = this.moveKeys.get(code);
      if (v) { mx += v[0]; my += v[1]; }
    }
    const mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; }
    return { x: mx, y: my };
  }

  /** Movement vector without consuming edge-triggered flags. */
  peekMove(): { x: number; y: number } {
    if (this.stick.active && (this.stick.x !== 0 || this.stick.y !== 0)) {
      return { x: this.stick.x, y: this.stick.y };
    }
    return this.keyboardMove();
  }

  /** Read and clear one frame of input. */
  consume(): RawInput {
    if (this.suspended) {
      this.pending.clear();
      this.pendingRelease.clear();
      return neutralRaw();
    }

    const kb = this.keyboardMove();
    let mx = kb.x;
    let my = kb.y;
    let sprint = [...this.sprintKeys].some((k) => this.keys.has(k));

    if (this.stick.active) {
      const mag = Math.hypot(this.stick.x, this.stick.y);
      if (mag > 0) {
        mx = this.stick.x;
        my = this.stick.y;
        // Push the stick to the edge to sprint — no extra button needed.
        if (Math.hypot(this.stick.dx, this.stick.dy) / STICK_RADIUS >= STICK_SPRINT) sprint = true;
      } else {
        mx = 0;
        my = 0;
      }
    }

    const state: RawInput = {
      moveX: clamp(mx, -1, 1),
      moveY: clamp(my, -1, 1),
      sprint,
      pressed: new Set(this.pending),
      held: this.heldNow(),
      released: new Set(this.pendingRelease),
    };

    this.pending.clear();
    this.pendingRelease.clear();
    return state;
  }

  private heldNow(): Set<string> {
    const out = new Set(this.heldKeyboard);
    for (const id of this.buttonPointer.keys()) out.add(id);
    return out;
  }

  /** Is this action being held right now? */
  isDown(id: string): boolean {
    return this.heldKeyboard.has(id) || this.buttonPointer.has(id);
  }
}
