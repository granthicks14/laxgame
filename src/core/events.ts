type Handler<T> = (payload: T) => void;

/** Minimal typed pub/sub used to decouple the match simulation from UI + audio. */
export class Emitter<Events extends object> {
  private map = new Map<keyof Events, Set<Handler<never>>>();

  /** While muted, emissions are dropped. Used when a match is fast-forwarded:
   *  the simulation still runs in full, but two minutes of crowd noise and
   *  confetti should not arrive in one frame. */
  muted = false;

  on<K extends keyof Events>(type: K, fn: Handler<Events[K]>): () => void {
    let set = this.map.get(type);
    if (!set) {
      set = new Set();
      this.map.set(type, set);
    }
    set.add(fn as Handler<never>);
    return () => this.off(type, fn);
  }

  off<K extends keyof Events>(type: K, fn: Handler<Events[K]>): void {
    this.map.get(type)?.delete(fn as Handler<never>);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    if (this.muted) return;
    const set = this.map.get(type);
    if (!set) return;
    for (const fn of set) {
      try {
        (fn as Handler<Events[K]>)(payload);
      } catch (err) {
        console.error(`[events] handler for "${String(type)}" threw`, err);
      }
    }
  }

  clear(): void {
    this.map.clear();
  }
}
