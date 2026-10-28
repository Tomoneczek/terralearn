import { ShaderMaterial, TextureLoader, Vector3, type Texture } from 'three';
import { calculateSunAngularDiameterDeg, calculateSunDirection } from '@/geo/solar';
import { MOON_RADIUS_KM, calculateMoonScenePosition } from '@/geo/lunar';
import { DEG2RAD, kmToScene } from '@/geo/astro';
import { ECLIPSE_GLSL } from './shaders/eclipse-chunk';
import type { Store, AppState } from '@/state/types';
import { resolveAssetUrl } from '@/utils/assets';

export interface DayNightMaterialUniforms {
  uBaseTexture: { value: Texture | null };
  uDayTexture: { value: Texture | null };
  uNightTexture: { value: Texture | null };
  uWaterMask: { value: Texture | null };
  uSunDirection: { value: Vector3 };
  uEnabled: { value: number };
  uMoonPosition: { value: Vector3 };
  uMoonRadius: { value: number };
  uSunAngularRadius: { value: number };
  uEclipses: { value: number };
}

/** Moon radius in scene units (globe radius = 100). */
export const MOON_RADIUS_SCENE = kmToScene(MOON_RADIUS_KM);

/** Angular radius of the solar disc in radians for `date`. */
export function sunAngularRadiusRad(date: Date): number {
  return (calculateSunAngularDiameterDeg(date) / 2) * DEG2RAD;
}

export const DAY_NIGHT_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const DAY_NIGHT_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uBaseTexture;
  uniform sampler2D uDayTexture;
  uniform sampler2D uNightTexture;
  uniform sampler2D uWaterMask;
  uniform vec3 uSunDirection;
  uniform float uEnabled;
  uniform vec3 uMoonPosition;
  uniform float uMoonRadius;
  uniform float uSunAngularRadius;
  uniform float uEclipses;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  ${ECLIPSE_GLSL}

  void main() {
    if (uEnabled < 0.5) {
      gl_FragColor = texture2D(uBaseTexture, vUv);
      return;
    }

    vec4 dayColor = texture2D(uDayTexture, vUv);
    vec4 nightColor = texture2D(uNightTexture, vUv);
    float isWater = texture2D(uWaterMask, vUv).r;

    vec3 norm = normalize(vWorldPosition);
    vec3 sunDir = normalize(uSunDirection);
    float sunDot = dot(norm, sunDir);

    // Solar eclipse: share of the solar disc hidden by the Moon as seen from this point
    float solarEclipse = 0.0;
    if (uEclipses > 0.5 && sunDot > -0.1) {
      vec3 toMoon = uMoonPosition - vWorldPosition;
      float moonAngularRadius = asin(clamp(uMoonRadius / length(toMoon), 0.0, 1.0));
      float separation = eclipseAngleBetween(toMoon, sunDir);
      solarEclipse = eclipseDiscOcclusion(separation, uSunAngularRadius, moonAngularRadius);
    }
    float sunlight = 1.0 - solarEclipse;

    // Day lighting: direct sunlight + ambient atmosphere scatter
    float dayScatter = clamp(sunDot, 0.0, 1.0);
    float dayLight = 0.35 + 0.65 * dayScatter;
    vec3 dayIlluminated = dayColor.rgb * dayLight;

    // Ocean Specular Glint (Blinn-Phong) - soft sun shimmer on water without mirror glare
    // cameraPosition is built-in Three.js uniform injected in ShaderMaterial
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    vec3 halfVec = normalize(sunDir + viewDir);
    float nDotH = max(0.0, dot(norm, halfVec));
    float specular = pow(nDotH, 128.0) * isWater * step(0.0, sunDot);
    vec3 sunGlint = vec3(1.0, 0.95, 0.85) * (specular * 0.35 * sunlight);
    dayIlluminated += sunGlint;

    // Night lighting: deep dark night with boosted city lights
    // Deep space ambient for unlit oceans and plains
    vec3 nightAmbient = vec3(0.015, 0.02, 0.035);
    vec3 cityLights = nightColor.rgb * 1.5;
    vec3 nightSurface = max(nightAmbient, cityLights);

    // Day-night smooth transition across terminator (~10 degrees)
    float dayFactor = smoothstep(-0.08, 0.08, sunDot);
    // Inside the Moon's shadow the surface falls back towards night (city lights included)
    vec3 surface = mix(nightSurface, dayIlluminated, dayFactor * sunlight);

    // Warm golden-amber sunset/sunrise atmospheric glow at the terminator
    float twilight = smoothstep(-0.10, 0.0, sunDot) * (1.0 - smoothstep(0.0, 0.10, sunDot));
    vec3 twilightGlow = vec3(1.0, 0.45, 0.15) * (twilight * 0.45);

    gl_FragColor = vec4(surface + twilightGlow, 1.0);
  }
`;

export interface DayNightControllerOptions {
  baseTextureUrl?: string;
  dayTextureUrl?: string;
  nightTextureUrl?: string;
  waterMaskUrl?: string;
  atlasTextureUrl?: string;
  /** Initial sky time; later updates come through {@link DayNightController.updateSun}. */
  date?: Date;
}

export class DayNightController {
  private readonly material: ShaderMaterial;
  private readonly store: Store<AppState>;
  private readonly unsubs: (() => void)[] = [];
  private readonly sunListeners = new Set<(date: Date) => void>();
  private baseTexture: Texture | null = null;
  private dayTexture: Texture | null = null;
  private nightTexture: Texture | null = null;
  private waterMask: Texture | null = null;
  private atlasTexture: Texture | null = null;

  constructor(store: Store<AppState>, options: DayNightControllerOptions = {}) {
    this.store = store;

    const baseUrl = resolveAssetUrl(
      options.baseTextureUrl ?? options.dayTextureUrl ?? '/textures/earth-dark.jpg',
    );
    const dayUrl = resolveAssetUrl(options.dayTextureUrl ?? '/textures/earth-day.jpg');
    const nightUrl = resolveAssetUrl(options.nightTextureUrl ?? '/textures/earth-night.jpg');
    const maskUrl = resolveAssetUrl(options.waterMaskUrl ?? '/textures/water-mask.png');
    const atlasUrl = resolveAssetUrl(options.atlasTextureUrl ?? '/textures/earth-atlas.jpg');

    const loader = new TextureLoader();
    this.baseTexture = loader.load(baseUrl);
    this.dayTexture = loader.load(dayUrl);
    this.nightTexture = loader.load(nightUrl);
    this.waterMask = loader.load(maskUrl);
    this.atlasTexture = loader.load(atlasUrl);

    const date = options.date ?? new Date();
    const sunDir = calculateSunDirection(date);
    const moonPos = calculateMoonScenePosition(date);

    this.material = new ShaderMaterial({
      uniforms: {
        uBaseTexture: { value: this.baseTexture },
        uDayTexture: { value: this.dayTexture },
        uNightTexture: { value: this.nightTexture },
        uWaterMask: { value: this.waterMask },
        uSunDirection: { value: new Vector3(sunDir[0], sunDir[1], sunDir[2]) },
        uEnabled: { value: store.get().dayNight ? 1.0 : 0.0 },
        uMoonPosition: { value: new Vector3(moonPos[0], moonPos[1], moonPos[2]) },
        uMoonRadius: { value: MOON_RADIUS_SCENE },
        uSunAngularRadius: { value: sunAngularRadiusRad(date) },
        uEclipses: { value: 1.0 },
      },
      vertexShader: DAY_NIGHT_VERTEX_SHADER,
      fragmentShader: DAY_NIGHT_FRAGMENT_SHADER,
    });

    this.syncTheme(store.get().theme);
    this.bindStore();
  }

  public getMaterial(): ShaderMaterial {
    return this.material;
  }

  public getSunDirection(): Vector3 {
    return (this.material.uniforms.uSunDirection?.value as Vector3) ?? new Vector3(0, 0, 1);
  }

  /** Moon center in scene units; shared and mutated in place like the sun direction. */
  public getMoonPosition(): Vector3 {
    return (this.material.uniforms.uMoonPosition?.value as Vector3) ?? new Vector3();
  }

  /** Recomputes the Sun and Moon for `date` (driven by the sky clock). */
  public updateSun(date: Date = new Date()): void {
    const [x, y, z] = calculateSunDirection(date);
    const u = this.material.uniforms;
    (u.uSunDirection?.value as Vector3 | undefined)?.set(x, y, z);
    const [mx, my, mz] = calculateMoonScenePosition(date);
    (u.uMoonPosition?.value as Vector3 | undefined)?.set(mx, my, mz);
    if (u.uSunAngularRadius) u.uSunAngularRadius.value = sunAngularRadiusRad(date);
    for (const listener of this.sunListeners) {
      listener(date);
    }
  }

  /**
   * Notifies about every sun update (the direction vector itself is shared and mutated in
   * place); used by consumers that derive more than the direction, e.g. the solar disc size.
   */
  public onSunUpdate(listener: (date: Date) => void): () => void {
    this.sunListeners.add(listener);
    return () => this.sunListeners.delete(listener);
  }

  public setEnabled(enabled: boolean): void {
    if (this.material.uniforms.uEnabled) {
      this.material.uniforms.uEnabled.value = enabled ? 1.0 : 0.0;
    }
  }

  public syncTheme(theme: string): void {
    const isClassic = theme === 'classic';
    const activeDayTex = isClassic ? this.atlasTexture : this.dayTexture;
    const activeBaseTex = isClassic ? this.atlasTexture : this.baseTexture;

    if (this.material.uniforms.uDayTexture) {
      this.material.uniforms.uDayTexture.value = activeDayTex;
    }
    if (this.material.uniforms.uBaseTexture) {
      this.material.uniforms.uBaseTexture.value = activeBaseTex;
    }
  }

  private bindStore(): void {
    this.unsubs.push(
      this.store.subscribe(
        s => s.dayNight,
        dayNight => {
          this.setEnabled(dayNight);
        },
      ),
    );

    this.unsubs.push(
      this.store.subscribe(
        s => s.theme,
        theme => {
          this.syncTheme(theme);
        },
      ),
    );
  }

  /** Turns the Moon's shadow on the globe on or off (dev panel). */
  public setEclipsesEnabled(enabled: boolean): void {
    if (this.material.uniforms.uEclipses) this.material.uniforms.uEclipses.value = enabled ? 1 : 0;
  }

  public destroy(): void {
    for (const unsub of this.unsubs) {
      unsub();
    }
    this.unsubs.length = 0;
    this.sunListeners.clear();
    this.baseTexture?.dispose();
    this.dayTexture?.dispose();
    this.nightTexture?.dispose();
    this.waterMask?.dispose();
    this.atlasTexture?.dispose();
    this.material.dispose();
  }
}
