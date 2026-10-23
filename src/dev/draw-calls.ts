import type { Object3D } from 'three';

interface Renderable extends Object3D {
  geometry?: { groups?: Array<{ materialIndex?: number }> };
  material?: { visible?: boolean } | Array<{ visible?: boolean } | undefined>;
  isMesh?: boolean;
  isLine?: boolean;
  isPoints?: boolean;
}

function typeOf(object: Object3D, inherited: string): string {
  if (Object.prototype.hasOwnProperty.call(object, '__globeObjType')) {
    return (object as Object3D & { __globeObjType: string }).__globeObjType;
  }
  return inherited;
}

function drawCallsOf(object: Renderable): number {
  if (!(object.isMesh || object.isLine || object.isPoints)) return 0;
  const { material } = object;
  if (!material) return 0;
  if (Array.isArray(material)) {
    const groups = object.geometry?.groups ?? [];
    if (groups.length === 0) return material.some(m => m?.visible !== false) ? 1 : 0;
    return groups.filter(g => material[g.materialIndex ?? 0]?.visible !== false).length;
  }
  return material.visible === false ? 0 : 1;
}

/**
 * Estimates draw calls per globe object type (polygon, path, point, label, ...). Objects with
 * `visible === false` (or hidden materials) do not count, mirroring what three.js renders.
 * Anything not tagged by globe.gl (clouds, atmosphere, highlight overlay) is listed as "other".
 */
export function countDrawCalls(root: Object3D): Record<string, number> {
  const counts: Record<string, number> = {};
  const walk = (object: Object3D, inherited: string): void => {
    if (!object.visible) return;
    const type = typeOf(object, inherited);
    const calls = drawCallsOf(object as Renderable);
    if (calls > 0) counts[type] = (counts[type] ?? 0) + calls;
    for (const child of object.children) walk(child, type);
  };
  walk(root, 'other');
  return counts;
}

/** "polygon 912 · path 342 · other 6" sorted by size. */
export function formatDrawCalls(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, n]) => `${type} ${n}`)
    .join(' · ');
}
