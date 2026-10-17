import {
  AdditiveBlending,
  BackSide,
  Color,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Scene,
} from 'three';
import type { Store, AppState } from '@/state/types';

export interface AtmosphereControllerOptions {
  globeRadius?: number;
  altitude?: number;
  sunDirection?: Vector3;
  dayColor?: string | Color;
  twilightColor?: string | Color;
  nightColor?: string | Color;
}

export const ATMOSPHERE_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldPosition;
  varying vec3 vNormal;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const ATMOSPHERE_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uSunDirection;
  uniform float uDayNight;
  uniform vec3 uAtmosphereColor;
  uniform vec3 uTwilightColor;
  uniform vec3 uNightColor;

  varying vec3 vWorldPosition;
  varying vec3 vNormal;

  void main() {
    // Inward pointing normal on BackSide of atmosphere shell
    vec3 inwardNormal = -normalize(vWorldPosition);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);

    // Rim intensity: fades smoothly to 0 at outer edge, peaks at planet horizon
    float rim = max(0.0, dot(inwardNormal, viewDir));
    float rimFactor = clamp(rim * 2.2, 0.0, 1.0);
    float halo = pow(rimFactor, 2.5);

    // Sun angle calculation on atmosphere shell
    vec3 radialDir = normalize(vWorldPosition);
    vec3 sunDir = normalize(uSunDirection);
    float sunDot = dot(radialDir, sunDir);

    // Smooth day-to-night lighting gradient
    float dayFactor = smoothstep(-0.08, 0.08, sunDot);
    vec3 atmoColor = mix(uNightColor, uAtmosphereColor, dayFactor);

    // Golden-amber sunset/sunrise atmospheric scattering at the terminator
    float twilight = smoothstep(-0.12, 0.0, sunDot) * (1.0 - smoothstep(0.0, 0.12, sunDot));
    atmoColor = mix(atmoColor, uTwilightColor, twilight * 0.85);

    // When day/night mode is disabled, render uniform daylight halo
    if (uDayNight < 0.5) {
      atmoColor = uAtmosphereColor;
    }

    // Additive blending: pre-multiplied color with alpha
    gl_FragColor = vec4(atmoColor * halo, halo);
  }
`;

/**
 * Controller for the sun-dependent Fresnel planetary atmosphere.
 * Replaces Globe.gl's static GlowMesh with a dynamic atmospheric shell:
 * - Rayleigh scattering azure on day side.
 * - Golden-amber glow along the solar terminator band.
 * - Deep shadow darkening on the nocturnal limb.
 * - Safe pointer interaction (raycast disabled).
 * - Shares the solar position vector directly with DayNightController.
 */
export class AtmosphereController {
  private readonly scene: Scene | null = null;
  private readonly store: Store<AppState>;
  private readonly mesh: Mesh | null = null;
  private readonly geometry: SphereGeometry | null = null;
  private readonly material: ShaderMaterial;
  private unsubscribe: (() => void) | null = null;

  constructor(
    scene: Scene | null,
    store: Store<AppState>,
    options: AtmosphereControllerOptions = {},
  ) {
    this.scene = scene;
    this.store = store;

    const globeRadius = options.globeRadius ?? 100;
    const altitude = options.altitude ?? 0.15;
    const radius = globeRadius * (1 + altitude);

    const sunDir = options.sunDirection ?? new Vector3(0, 0, 1);
    const dayColor =
      options.dayColor instanceof Color
        ? options.dayColor
        : new Color(options.dayColor ?? '#4aa3ff');
    const twilightColor =
      options.twilightColor instanceof Color
        ? options.twilightColor
        : new Color(options.twilightColor ?? '#ff8833');
    const nightColor =
      options.nightColor instanceof Color
        ? options.nightColor
        : new Color(options.nightColor ?? '#050814');

    this.material = new ShaderMaterial({
      uniforms: {
        uSunDirection: { value: sunDir },
        uDayNight: { value: store.get().dayNight ? 1.0 : 0.0 },
        uAtmosphereColor: { value: dayColor },
        uTwilightColor: { value: twilightColor },
        uNightColor: { value: nightColor },
      },
      vertexShader: ATMOSPHERE_VERTEX_SHADER,
      fragmentShader: ATMOSPHERE_FRAGMENT_SHADER,
      side: BackSide,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });

    try {
      this.geometry = new SphereGeometry(radius, 64, 32);
      this.mesh = new Mesh(this.geometry, this.material);
      this.mesh.name = 'atmosphere-shell';

      // CRITICAL: Atmosphere must never intercept pointer events
      this.mesh.raycast = () => {};

      if (this.scene) {
        this.scene.add(this.mesh);
      }
    } catch {
      // Mock / non-WebGL environment fallback
      this.mesh = null;
      this.geometry = null;
    }

    this.bindStore();
  }

  public getMesh(): Mesh | null {
    return this.mesh;
  }

  public setVisible(visible: boolean): void {
    if (this.mesh) {
      this.mesh.visible = visible;
    }
  }

  public isVisible(): boolean {
    return this.mesh?.visible ?? false;
  }

  public getMaterial(): ShaderMaterial {
    return this.material;
  }

  public setDayNight(enabled: boolean): void {
    if (this.material.uniforms.uDayNight) {
      this.material.uniforms.uDayNight.value = enabled ? 1.0 : 0.0;
    }
  }

  public updateSunDirection(dir: Vector3): void {
    const sunUniform = this.material.uniforms.uSunDirection?.value as Vector3 | undefined;
    if (sunUniform) {
      sunUniform.copy(dir);
    }
  }

  private bindStore(): void {
    if (this.mesh && this.store.get().theme === 'classic') {
      this.mesh.visible = false;
    }

    const un1 = this.store.subscribe(
      s => s.dayNight,
      dayNight => {
        this.setDayNight(dayNight);
      },
    );
    const un2 = this.store.subscribe(
      s => s.theme,
      theme => {
        this.setVisible(theme !== 'classic');
      },
    );

    this.unsubscribe = () => {
      un1();
      un2();
    };
  }

  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.mesh && this.scene) {
      this.scene.remove(this.mesh);
    }
    this.geometry?.dispose();
    this.material.dispose();
  }
}
