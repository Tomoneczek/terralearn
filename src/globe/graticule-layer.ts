import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Scene,
} from 'three';
import type { Store, AppState, GraticuleMode } from '@/state/types';
import { polarToCartesian } from './route-layer';
import { t } from '@/i18n';

export interface GlobeGraticuleDelegate {
  scene?(): Scene;
}

export type GraticuleSceneTarget = Scene | GlobeGraticuleDelegate | null;

export const TROPIC_LAT = 23.4365;
export const POLAR_CIRCLE_LAT = 66.5635;
export const INTERMEDIATE_STEP_DEG = 15;

/**
 * Generates array of 3D Cartesian coordinates for a parallel (line of constant latitude).
 */
export function generateParallelPoints(
  lat: number,
  stepDeg = 2,
  alt = 0.0035,
  globeRadius = 100,
): Vector3[] {
  const points: Vector3[] = [];
  for (let lng = -180; lng <= 180; lng += stepDeg) {
    points.push(polarToCartesian(lat, lng, alt, globeRadius));
  }
  return points;
}

/**
 * Generates array of 3D Cartesian coordinates for a meridian (line of constant longitude).
 */
export function generateMeridianPoints(
  lng: number,
  minLat = -88,
  maxLat = 88,
  stepDeg = 2,
  alt = 0.0035,
  globeRadius = 100,
): Vector3[] {
  const points: Vector3[] = [];
  for (let lat = minLat; lat <= maxLat; lat += stepDeg) {
    points.push(polarToCartesian(lat, lng, alt, globeRadius));
  }
  return points;
}

/**
 * Creates a canvas-backed Sprite label for cartographic markers on the globe.
 */
export function createCartographicBadge(
  text: string,
  strokeColor = '#00f0ff',
  fillColor = 'rgba(10, 20, 35, 0.88)',
): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, 256, 64);

    // Pill background
    const radius = 20;
    const x = 6;
    const y = 8;
    const w = 244;
    const h = 48;

    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();

    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);
  }

  const texture = new CanvasTexture(canvas);
  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });

  const sprite = new Sprite(material);
  sprite.scale.set(6.5, 1.6, 1);
  sprite.raycast = () => null;

  return sprite;
}

/**
 * Manages 3D visualization of cartographic graticule (parallels and meridians):
 * - Prominent lines: Equator (0°), Tropics of Cancer/Capricorn (±23.44°),
 *   Arctic/Antarctic Circles (±66.56°), Prime Meridian (0°) & 180°
 * - Optional full 15° geographic grid (parallels & meridians every 15°)
 * - Floating educational badges on key intersections
 * - Raycast bypass on all objects to preserve globe interaction
 */
export class GraticuleLayerController {
  private readonly target: GraticuleSceneTarget;
  private readonly store: Store<AppState>;
  private scene: Scene | null = null;
  private readonly group = new Group();
  private unsubscribe: (() => void) | null = null;

  constructor(target: GraticuleSceneTarget, store: Store<AppState>) {
    this.target = target;
    this.store = store;

    this.group.name = 'TL_GraticuleLayer';
    this.group.raycast = () => null;

    if (this.target) {
      if ('scene' in this.target && typeof this.target.scene === 'function') {
        try {
          this.scene = this.target.scene() ?? null;
        } catch {
          this.scene = null;
        }
      } else if ('add' in this.target) {
        this.scene = this.target as Scene;
      }

      if (this.scene) {
        this.scene.add(this.group);
      }
    }

    this.bindStore();
    this.sync(this.store.get().graticule);
  }

  public getGroup(): Group {
    return this.group;
  }

  public sync(mode: GraticuleMode): void {
    this.clear();

    if (mode === 'off') {
      return;
    }

    // 1. Build Major Parallels & Meridians
    this.buildMajorLines();

    // 2. Build Intermediate 15° Grid if mode is '15deg'
    if (mode === '15deg') {
      this.buildIntermediateGrid();
    }
  }

  private buildMajorLines(): void {
    // 1. Equator (0°) – Bright cyan line
    this.addParallelLine(0, 0x00f0ff, 0.95, 0.0038);

    // 2. Tropic of Cancer (+23.4365°) – Warm amber
    this.addParallelLine(TROPIC_LAT, 0xfbbf24, 0.85, 0.0035);

    // 3. Tropic of Capricorn (-23.4365°) – Warm amber
    this.addParallelLine(-TROPIC_LAT, 0xfbbf24, 0.85, 0.0035);

    // 4. Arctic Circle (+66.5635°) – Frost blue
    this.addParallelLine(POLAR_CIRCLE_LAT, 0x93c5fd, 0.85, 0.0035);

    // 5. Antarctic Circle (-66.5635°) – Frost blue
    this.addParallelLine(-POLAR_CIRCLE_LAT, 0x93c5fd, 0.85, 0.0035);

    // 6. Prime Meridian (0°) – Emerald / Mint
    this.addMeridianLine(0, 0x34d399, 0.9, 0.0036);

    // 7. Antimeridian (180°) – Cool cyan
    this.addMeridianLine(180, 0x38bdf8, 0.75, 0.0035);

    // 8. Badges / Markers along key intersections
    this.addBadges();
  }

  private addParallelLine(lat: number, color: number, opacity: number, alt: number): void {
    const points = generateParallelPoints(lat, 2, alt);
    const geom = new BufferGeometry().setFromPoints(points);
    const mat = new LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    const line = new Line(geom, mat);
    line.renderOrder = 3;
    line.raycast = () => null;
    this.group.add(line);
  }

  private addMeridianLine(lng: number, color: number, opacity: number, alt: number): void {
    const points = generateMeridianPoints(lng, -88, 88, 2, alt);
    const geom = new BufferGeometry().setFromPoints(points);
    const mat = new LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    const line = new Line(geom, mat);
    line.renderOrder = 3;
    line.raycast = () => null;
    this.group.add(line);
  }

  private addIntermediateSegments(segmentPoints: Vector3[]): void {
    if (segmentPoints.length === 0) return;

    const positions = new Float32Array(segmentPoints.length * 3);
    for (let i = 0; i < segmentPoints.length; i++) {
      const p = segmentPoints[i];
      if (!p) continue;
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    }

    const geom = new BufferGeometry();
    geom.setAttribute('position', new Float32BufferAttribute(positions, 3));

    const mat = new LineBasicMaterial({
      color: 0x477099,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });

    const segments = new LineSegments(geom, mat);
    segments.renderOrder = 2;
    segments.raycast = () => null;
    this.group.add(segments);
  }

  private buildIntermediateGrid(): void {
    const segmentPoints: Vector3[] = [];
    const alt = 0.003;

    // Intermediate parallels: ±15°, ±30°, ±45°, ±60°, ±75°
    for (let lat = -75; lat <= 75; lat += INTERMEDIATE_STEP_DEG) {
      if (lat === 0) continue; // Equator already drawn as major
      for (let lng = -180; lng < 180; lng += 3) {
        const p1 = polarToCartesian(lat, lng, alt);
        const p2 = polarToCartesian(lat, lng + 3, alt);
        segmentPoints.push(p1, p2);
      }
    }

    // Intermediate meridians every 15°
    for (let lng = -165; lng <= 165; lng += INTERMEDIATE_STEP_DEG) {
      if (lng === 0) continue; // Prime meridian already drawn as major
      for (let lat = -87; lat < 87; lat += 3) {
        const p1 = polarToCartesian(lat, lng, alt);
        const p2 = polarToCartesian(lat + 3, lng, alt);
        segmentPoints.push(p1, p2);
      }
    }

    this.addIntermediateSegments(segmentPoints);
  }

  private addBadges(): void {
    const badgeConfigs: {
      lat: number;
      lng: number;
      text: string;
      color: string;
    }[] = [
      { lat: 0, lng: 0, text: t('graticule.equator'), color: '#00f0ff' },
      { lat: TROPIC_LAT, lng: 0, text: t('graticule.tropicCancer'), color: '#fbbf24' },
      { lat: -TROPIC_LAT, lng: 0, text: t('graticule.tropicCapricorn'), color: '#fbbf24' },
      { lat: POLAR_CIRCLE_LAT, lng: 0, text: t('graticule.arcticCircle'), color: '#93c5fd' },
      { lat: -POLAR_CIRCLE_LAT, lng: 0, text: t('graticule.antarcticCircle'), color: '#93c5fd' },
      { lat: 45, lng: 0, text: t('graticule.primeMeridian'), color: '#34d399' },
      { lat: 45, lng: 180, text: t('graticule.antimeridian'), color: '#38bdf8' },
    ];

    for (const cfg of badgeConfigs) {
      const sprite = createCartographicBadge(cfg.text, cfg.color);
      const pos = polarToCartesian(cfg.lat, cfg.lng, 0.015);
      sprite.position.copy(pos);
      this.group.add(sprite);
    }
  }

  public clear(): void {
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      if (!child) break;
      this.group.remove(child);

      if (child instanceof Line || child instanceof LineSegments || child instanceof Sprite) {
        child.geometry?.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => {
              if ('map' in m && m.map) m.map.dispose();
              m.dispose();
            });
          } else {
            if ('map' in child.material && child.material.map) {
              child.material.map.dispose();
            }
            child.material.dispose();
          }
        }
      }
    }
  }

  private bindStore(): void {
    this.unsubscribe = this.store.subscribe(
      s => s.graticule,
      mode => {
        this.sync(mode);
      },
    );
  }

  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.clear();
    if (this.scene) {
      this.scene.remove(this.group);
    }
  }
}
