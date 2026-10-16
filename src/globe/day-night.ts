import { ShaderMaterial, TextureLoader, Vector3, type Texture } from 'three';
import { calculateSunDirection } from '@/geo/solar';
import type { Store, AppState } from '@/state/types';
import { resolveAssetUrl } from '@/utils/assets';

export interface DayNightMaterialUniforms {
  uDayTexture: { value: Texture | null };
  uNightTexture: { value: Texture | null };
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
  uniform sampler2D uDayTexture;
  uniform sampler2D uNightTexture;
  uniform vec3 uSunDirection;
  uniform float uEnabled;

  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    vec4 dayColor = texture2D(uDayTexture, vUv);

    if (uEnabled < 0.5) {
      gl_FragColor = dayColor;
      return;
    }

    vec4 nightColor = texture2D(uNightTexture, vUv);
    vec3 norm = normalize(vWorldPosition);
    float sunDot = dot(norm, normalize(uSunDirection));

    // Twilight transition belt between -0.12 and 0.12 dot product (~14 degrees)
    float factor = smoothstep(-0.12, 0.12, sunDot);

    // Boost night lights slightly for vibrant contrast
    vec3 nightBoosted = nightColor.rgb * 1.35;
    vec3 blended = mix(nightBoosted, dayColor.rgb, factor);

    gl_FragColor = vec4(blended, 1.0);
  }
`;

export interface DayNightControllerOptions {
  dayTextureUrl?: string;
  nightTextureUrl?: string;
  updateIntervalMs?: number;
}

export class DayNightController {
  private readonly material: ShaderMaterial;
  private readonly store: Store<AppState>;
  private unsubscribe: (() => void) | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private dayTexture: Texture | null = null;
  private nightTexture: Texture | null = null;

  constructor(store: Store<AppState>, options: DayNightControllerOptions = {}) {
    this.store = store;

    const dayUrl = resolveAssetUrl(options.dayTextureUrl ?? '/textures/earth-dark.jpg');
    const nightUrl = resolveAssetUrl(options.nightTextureUrl ?? '/textures/earth-night.jpg');

    const loader = new TextureLoader();
    this.dayTexture = loader.load(dayUrl);
    this.nightTexture = loader.load(nightUrl);

    const sunDir = calculateSunDirection(new Date());

    this.material = new ShaderMaterial({
      uniforms: {
        uDayTexture: { value: this.dayTexture },
        uNightTexture: { value: this.nightTexture },
        uSunDirection: { value: new Vector3(sunDir[0], sunDir[1], sunDir[2]) },
        uEnabled: { value: store.get().dayNight ? 1.0 : 0.0 },
      },
      vertexShader: DAY_NIGHT_VERTEX_SHADER,
      fragmentShader: DAY_NIGHT_FRAGMENT_SHADER,
    });

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

  public updateSun(date: Date = new Date()): void {
    const [x, y, z] = calculateSunDirection(date);
    const sunUniform = this.material.uniforms.uSunDirection?.value as Vector3 | undefined;
    if (sunUniform) {
      sunUniform.set(x, y, z);
    }
  }

  public setEnabled(enabled: boolean): void {
    if (this.material.uniforms.uEnabled) {
      this.material.uniforms.uEnabled.value = enabled ? 1.0 : 0.0;
    }
  }

  private bindStore(): void {
    this.unsubscribe = this.store.subscribe(
      s => s.dayNight,
      dayNight => {
        this.setEnabled(dayNight);
      },
    );
  }

  public destroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.dayTexture?.dispose();
    this.nightTexture?.dispose();
    this.material.dispose();
  }
}
