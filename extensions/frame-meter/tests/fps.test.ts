import { describe, expect, it } from "vitest";
import { FrameMeter } from "../src/core/fps";

describe("FrameMeter", () => {
  it("reports steady 60fps as ~60 average", () => {
    const meter = new FrameMeter();
    // 60fps deltas = ~16.67ms each; push 120 frames
    for (let i = 0; i < 120; i++) meter.pushFrame(16.67);
    const stats = meter.getStats();
    expect(stats.average).toBeGreaterThan(59);
    expect(stats.average).toBeLessThan(61);
    expect(stats.current).toBeGreaterThan(59);
    expect(stats.current).toBeLessThan(61);
  });

  it("tracks min and max across a session", () => {
    const meter = new FrameMeter();
    // warmup: 60fps for 72 frames (warmupFrames=60, so these are excluded)
    for (let i = 0; i < 72; i++) meter.pushFrame(16.67);
    // dip to 30fps
    for (let i = 0; i < 30; i++) meter.pushFrame(33.33);
    // spike to 120fps
    for (let i = 0; i < 30; i++) meter.pushFrame(8.33);
    const stats = meter.getStats();
    expect(stats.max).toBeGreaterThan(100);
    expect(stats.min).toBeLessThan(35);
  });

  it("drops old frames from the rolling window", () => {
    const meter = new FrameMeter();
    // push 200 frames at 60fps, then 30 frames at 30fps
    for (let i = 0; i < 200; i++) meter.pushFrame(16.67);
    for (let i = 0; i < 30; i++) meter.pushFrame(33.33);
    const stats = meter.getStats();
    // window=60 now holds 30@60fps + 30@30fps → mean 25ms → 40 FPS
    expect(stats.average).toBeLessThan(45);
  });

  it("excludes warmup (first 60 frames) from min", () => {
    const meter = new FrameMeter();
    // first frame is a huge stall (1000ms) — within warmup, excluded from min
    meter.pushFrame(1000);
    // steady 60fps for 120 more frames (well past warmup)
    for (let i = 0; i < 120; i++) meter.pushFrame(16.67);
    const stats = meter.getStats();
    expect(stats.min).toBeGreaterThan(50);
  });

  it("reset() clears all state", () => {
    const meter = new FrameMeter();
    for (let i = 0; i < 100; i++) meter.pushFrame(16.67);
    meter.reset();
    const stats = meter.getStats();
    expect(stats.current).toBe(0);
    expect(stats.average).toBe(0);
    expect(stats.min).toBe(Infinity);
    expect(stats.max).toBe(0);
  });

  it("reports frameTimeMs as the last delta", () => {
    const meter = new FrameMeter();
    for (let i = 0; i < 10; i++) meter.pushFrame(16.67);
    meter.pushFrame(25.5);
    expect(meter.getStats().frameTimeMs).toBeCloseTo(25.5, 1);
  });
});
