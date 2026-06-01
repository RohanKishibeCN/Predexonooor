export class RateLimiter {
  private last = 0;
  constructor(private minIntervalMs: number) {}

  async wait(): Promise<void> {
    const now = Date.now();
    const delta = now - this.last;
    if (delta < this.minIntervalMs) {
      await new Promise((r) => setTimeout(r, this.minIntervalMs - delta));
    }
    this.last = Date.now();
  }
}

