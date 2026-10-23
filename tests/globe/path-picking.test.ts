import { describe, it, expect, beforeEach } from 'vitest';
import { Group, PerspectiveCamera, Raycaster, Vector2, type Intersection } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { MIN_PATH_HIT_WIDTH_PX, installPathHitTolerance } from '@/globe/path-picking';

const SIZE = 1000;
const DRAWN_WIDTH = 1.5;

function makeLine(asGlobePath: boolean): { root: Group; line: Line2 } {
  const geometry = new LineGeometry();
  geometry.setPositions([-50, 0, 100, 50, 0, 100]);
  const material = new LineMaterial({ linewidth: DRAWN_WIDTH });
  material.resolution.set(SIZE, SIZE);
  const line = new Line2(geometry, material);
  const root = new Group();
  if (asGlobePath) {
    // globe.gl tags the top-level object of every path
    (root as Group & { __globeObjType?: string }).__globeObjType = 'path';
  }
  root.add(line);
  root.updateMatrixWorld(true);
  return { root, line };
}

/** Casts a ray through a pixel offset (px) above the line and returns the hits. */
function pickAt(root: Group, offsetPx: number): Intersection[] {
  const camera = new PerspectiveCamera(50, 1, 1, 1000);
  camera.position.set(0, 0, 300);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const raycaster = new Raycaster();
  raycaster.setFromCamera(new Vector2(0, offsetPx / (SIZE / 2)), camera);
  return raycaster.intersectObject(root, true);
}

describe('installPathHitTolerance', () => {
  beforeEach(() => installPathHitTolerance());

  // Regression: rivers were drawn ~1.5 px wide and picked with the same tolerance, so they
  // could practically never be hovered or clicked.
  it('lets a pointer a few pixels off a path still hit it', () => {
    const { root } = makeLine(true);
    expect(pickAt(root, 0)).toHaveLength(1);
    expect(pickAt(root, 4)).toHaveLength(1);
  });

  it('keeps a bounded hit area', () => {
    const { root } = makeLine(true);
    expect(pickAt(root, MIN_PATH_HIT_WIDTH_PX)).toHaveLength(0);
  });

  it('does not widen fat lines that are not globe paths', () => {
    const { root } = makeLine(false);
    expect(pickAt(root, 0)).toHaveLength(1);
    expect(pickAt(root, 4)).toHaveLength(0);
  });

  it('restores the drawn line width after raycasting', () => {
    const { root, line } = makeLine(true);
    pickAt(root, 4);
    expect((line.material as LineMaterial).linewidth).toBe(DRAWN_WIDTH);
  });

  it('is idempotent and lets the width be retuned', () => {
    installPathHitTolerance(30);
    installPathHitTolerance(30);
    const { root } = makeLine(true);
    expect(pickAt(root, 12)).toHaveLength(1);
    expect(pickAt(root, 40)).toHaveLength(0);
  });
});
