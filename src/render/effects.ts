import type { Camera } from './camera';

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  color: string;
  size: number;
  gravity: number;
}

/** Lightweight world-space particle pool. Capped so mobile never chokes. */
export class Effects {
  private parts: Particle[] = [];
  private readonly cap = 260;
  /** Full-screen flash, 0..1. */
  flash = 0;
  flashColor = '#ffffff';

  clear(): void {
    this.parts.length = 0;
    this.flash = 0;
  }

  private add(p: Particle): void {
    if (this.parts.length >= this.cap) this.parts.shift();
    this.parts.push(p);
  }

  burst(x: number, y: number, count: number, colors: string[], power = 6, gravity = 12): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = power * (0.35 + Math.random() * 0.9);
      this.add({
        x, y, z: 0.6 + Math.random() * 0.8,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 2 + Math.random() * 5,
        life: 0.5 + Math.random() * 0.7, maxLife: 1.2,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 1 + (Math.random() < 0.3 ? 1 : 0),
        gravity,
      });
    }
  }

  confetti(x: number, y: number, count: number, colors: string[]): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      this.add({
        x: x + Math.cos(a) * Math.random() * 4,
        y: y + Math.sin(a) * Math.random() * 4,
        z: 5 + Math.random() * 5,
        vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, vz: 1 + Math.random() * 3,
        life: 1.2 + Math.random() * 1.2, maxLife: 2.4,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 1 + (Math.random() < 0.5 ? 1 : 0),
        gravity: 5,
      });
    }
  }

  dust(x: number, y: number): void {
    this.add({
      x, y, z: 0.1,
      vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5, vz: 0.4,
      life: 0.28, maxLife: 0.28, color: '#cfe0d2', size: 1, gravity: 2,
    });
  }

  screenFlash(color: string, amount = 0.5): void {
    this.flash = Math.min(1, this.flash + amount);
    this.flashColor = color;
  }

  update(dt: number): void {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vz -= p.gravity * dt;
      if (p.z < 0) { p.z = 0; p.vz *= -0.35; p.vx *= 0.7; p.vy *= 0.7; }
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.6);
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera): void {
    for (const p of this.parts) {
      if (!cam.visible(p.x, p.y, 2)) continue;
      const sx = cam.projectX(p.x, p.y);
      const sy = cam.projectY(p.x, p.y) - p.z * cam.ppy * 0.55;
      ctx.globalAlpha = Math.min(1, p.life / (p.maxLife * 0.5));
      ctx.fillStyle = p.color;
      const s = Math.max(1, Math.round(p.size * cam.ppy * 0.2));
      ctx.fillRect(Math.round(sx), Math.round(sy), s, s);
    }
    ctx.globalAlpha = 1;
  }

  drawFlash(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.flash <= 0.01) return;
    ctx.globalAlpha = this.flash * 0.55;
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  get count(): number {
    return this.parts.length;
  }
}
