import { describe, it, expect } from 'vitest';
import { BufferGeometry, Group, Line, Mesh, MeshBasicMaterial, LineBasicMaterial } from 'three';
import { countDrawCalls, formatDrawCalls } from '@/dev/draw-calls';

function tagged(type: string): Group {
  const g = new Group();
  (g as Group & { __globeObjType?: string }).__globeObjType = type;
  return g;
}

describe('countDrawCalls', () => {
  it('counts meshes and lines per globe object type', () => {
    const root = new Group();
    const polygon = tagged('polygon');
    polygon.add(new Mesh(new BufferGeometry(), new MeshBasicMaterial()));
    polygon.add(new Line(new BufferGeometry(), new LineBasicMaterial()));
    root.add(polygon);
    root.add(new Mesh(new BufferGeometry(), new MeshBasicMaterial()));

    expect(countDrawCalls(root)).toEqual({ polygon: 2, other: 1 });
  });

  it('skips invisible objects and materials that three.js would not draw', () => {
    const root = new Group();
    const polygon = tagged('polygon');
    polygon.add(new Mesh(new BufferGeometry(), new MeshBasicMaterial({ visible: false })));
    const hidden = new Mesh(new BufferGeometry(), new MeshBasicMaterial());
    hidden.visible = false;
    polygon.add(hidden);
    root.add(polygon);

    expect(countDrawCalls(root)).toEqual({});
  });

  it('counts only visible material groups of multi-material meshes', () => {
    const geometry = new BufferGeometry();
    geometry.addGroup(0, 3, 0);
    geometry.addGroup(3, 3, 1);
    const mesh = new Mesh(geometry, [
      new MeshBasicMaterial(),
      new MeshBasicMaterial({ visible: false }),
    ]);
    const root = new Group();
    root.add(mesh);

    expect(countDrawCalls(root)).toEqual({ other: 1 });
  });
});

describe('formatDrawCalls', () => {
  it('sorts by size', () => {
    expect(formatDrawCalls({ path: 3, polygon: 10, other: 1 })).toBe(
      'polygon 10 · path 3 · other 1',
    );
  });
});
