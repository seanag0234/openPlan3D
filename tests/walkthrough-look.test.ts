import { describe, expect, it } from 'vitest';
import { Euler, PerspectiveCamera } from 'three';
import { LOOK_RADIANS_PER_PX, WalkthroughMotion } from '../src/lib/utils/walkthroughMotion';

const angles = (camera: PerspectiveCamera) => new Euler().setFromQuaternion(camera.quaternion, 'YXZ');

describe('walk-through look by finger', () => {
  it('turns the view about the up axis by the finger travel and does not move the camera', () => {
    const camera = new PerspectiveCamera(); camera.position.set(100, 160, 200);
    new WalkthroughMotion().look(100, 0, camera);
    expect(LOOK_RADIANS_PER_PX).toBe(0.005);
    expect(angles(camera).y).toBeCloseTo(0.5);
    expect(angles(camera).x).toBeCloseTo(0);
    expect(camera.position.toArray()).toEqual([100, 160, 200]);
  });

  it('stops looking up or down at 1.4 rad', () => {
    const camera = new PerspectiveCamera(), motion = new WalkthroughMotion();
    motion.look(0, 10_000, camera);
    expect(angles(camera).x).toBeCloseTo(1.4);
    motion.look(0, -20_000, camera);
    expect(angles(camera).x).toBeCloseTo(-1.4);
  });

  it('adds two drags together', () => {
    const camera = new PerspectiveCamera(), motion = new WalkthroughMotion();
    motion.look(40, 20, camera);
    motion.look(60, 30, camera);
    expect(angles(camera).y).toBeCloseTo(0.5);
    expect(angles(camera).x).toBeCloseTo(0.25);
  });
});
