/**
 * Pure FPS measurement: consumes frame deltas and produces rolling stats.
 * No DOM dependencies — testable in isolation.
 */

export interface FpsStats {
  /** Smoothed current FPS (last ~5 frames). */
  current: number;
  /** Rolling mean FPS over the window. */
  average: number;
  /** Session minimum FPS, excluding the warmup frames. */
  min: number;
  /** Session maximum FPS. */
  max: number;
  /** Last frame delta in milliseconds. */
  frameTimeMs: number;
}

export interface FrameMeterOptions {
  /** Rolling window size in frames; defaults to 60. */
  windowSize?: number;
  /** Warmup frame count excluded from min/max; defaults to 60 (~1s at 60fps). */
  warmupFrames?: number;
  /** Smoothing sample count for current FPS; defaults to 5. */
  smoothing?: number;
}

const defaults = {
  windowSize: 60,
  warmupFrames: 60,
  smoothing: 5
};

export class FrameMeter {
  private readonly windowSize: number;
  private readonly warmupFrames: number;
  private readonly smoothing: number;
  private frames: number[] = [];
  private recent: number[] = [];
  private minFps = Infinity;
  private maxFps = 0;
  private pushed = 0;
  private lastDelta = 0;

  constructor(options: FrameMeterOptions = {}) {
    this.windowSize = options.windowSize ?? defaults.windowSize;
    this.warmupFrames = options.warmupFrames ?? defaults.warmupFrames;
    this.smoothing = options.smoothing ?? defaults.smoothing;
  }

  pushFrame(deltaMs: number): void {
    this.lastDelta = deltaMs;
    this.pushed++;
    this.frames.push(deltaMs);
    if (this.frames.length > this.windowSize) this.frames.shift();
    this.recent.push(deltaMs);
    if (this.recent.length > this.smoothing) this.recent.shift();

    // Skip min/max during warmup so the first long delta doesn't poison stats.
    if (this.pushed <= this.warmupFrames) return;
    if (deltaMs <= 0) return;
    const fps = 1000 / deltaMs;
    if (fps < this.minFps) this.minFps = fps;
    if (fps > this.maxFps) this.maxFps = fps;
  }

  getStats(): FpsStats {
    const current = this.recent.length
      ? 1000 / (this.recent.reduce((sum, d) => sum + d, 0) / this.recent.length)
      : 0;
    const average = this.frames.length
      ? 1000 / (this.frames.reduce((sum, d) => sum + d, 0) / this.frames.length)
      : 0;
    return {
      current: this.recent.length ? current : 0,
      average: this.frames.length ? average : 0,
      min: this.minFps,
      max: this.maxFps,
      frameTimeMs: this.lastDelta
    };
  }

  reset(): void {
    this.frames = [];
    this.recent = [];
    this.minFps = Infinity;
    this.maxFps = 0;
    this.pushed = 0;
    this.lastDelta = 0;
  }
}
