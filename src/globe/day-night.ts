import { ShaderMaterial, TextureLoader, Vector3, type Texture } from 'three';
import { calculateSunDirection } from '@/geo/solar';
import type { Store, AppState } from '@/state/types';
import { resolveAssetUrl } from '@/utils/assets';

export interface DayNightMaterialUniforms {
  uBaseTexture: { value: Texture | null };
  uDayTexture: { value: Texture | null };
  uNightTexture: { value: Texture | null };
  uWaterMask: { value: Texture | null };
  uSunDirection: { value: Vector3 };
  uEnabled: { value: number };
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

  varying vec2 vUv;
  varying vec3 vWorldPosition;

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
    vec3 sunGlint = vec3(1.0, 0.95, 0.85) * (specular * 0.35);
    dayIlluminated += sunGlint;

    // Night lighting: deep dark night with boosted city lights
    // Deep space ambient for unlit oceans and plains
    vec3 nightAmbient = vec3(0.015, 0.02, 0.035);
    vec3 cityLights = nightColor.rgb * 1.5;
    vec3 nightSurface = max(nightAmbient, cityLights);

    // Day-night smooth transition across terminator (~10 degrees)
    float dayFactor = smoothstep(-0.08, 0.08, sunDot);
    vec3 surface = mix(nightSurface, dayIlluminated, dayFactor);

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
  updateIntervalMs?: number;
}

export class DayNightController {
  private readonly material: ShaderMaterial;
  private readonly store: Store<AppState>;
  private readonly unsubs: (() => void)[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
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

    const sunDir = calculateSunDirection(new Date());

    this.material = new ShaderMaterial({
      uniforms: {
        uBaseTexture: { value: this.baseTexture },
        uDayTexture: { value: this.dayTexture },
        uNightTexture: { value: this.nightTexture },
        uWaterMask: { value: this.waterMask },
        uSunDirection: { value: new Vector3(sunDir[0], sunDir[1], sunDir[2]) },
        uEnabled: { value: store.get().dayNight ? 1.0 : 0.0 },
      },
      vertexShader: DAY_NIGHT_VERTEX_SHADER,
      fragmentShader: DAY_NIGHT_FRAGMENT_SHADER,
    });

    this.syncTheme(store.get().theme);
    this.bindStore();

    // Auto-update sun position every 60s
    const intervalMs = options.updateIntervalMs ?? 60000;
    this.intervalId = setInterval(() => {
      this.updateSun();
    }, intervalMs);
  }

  public getMaterial(): ShaderMaterial {
    return this.material;
  }

  public getSunDirection(): Vector3 {
    return (this.material.uniforms.uSunDirection?.value as Vector3) ?? new Vector3(0, 0, 1);
  }

  public updateSun(date: Date = new Date()): void {
    const [x, y, z] = calculateSunDirection(date);
    const sunUniform = this.material.uniforms.uSunDirection?.value as Vector3 | undefined;
    if (sunUniform) {
      sunUniform.set(x, y, z);
    }
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

  public destroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
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
