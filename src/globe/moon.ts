import {
  Matrix4,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  TextureLoader,
  Vector3,
  type Scene,
  type Texture,
} from 'three';
import { GLOBE_RADIUS } from '@/geo/astro';
import { calculateEclipticPoleDirection } from '@/geo/lunar';
import type { Store, AppState } from '@/state/types';
import { resolveAssetUrl } from '@/utils/assets';
import { MOON_RADIUS_SCENE, sunAngularRadiusRad } from './day-night';
import { ECLIPSE_GLSL } from './shaders/eclipse-chunk';

export interface MoonParams {
  /** Strength of earthshine (sunlight reflected by Earth onto the Moon's night side). */
  earthshine: number;
  /** Widening of Earth's shadow by its atmosphere (Danjon/Chauvenet ~2%). */
  shadowWidening: number;
  /** Brightness of the reddish light refracted into the umbra by Earth's atmosphere. */
  umbraGlow: number;
}

export const DEFAULT_MOON_PARAMS: MoonParams = {
  earthshine: 0.12,
  shadowWidening: 1.02,
  umbraGlow: 0.35,
};

export const MOON_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const MOON_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uSunDirection;
  uniform vec3 uMoonCenter;
  uniform float uEarthshine;
  uniform float uSunAngularRadius;
  uniform float uEarthRadius;
  uniform float uShadowWidening;
  uniform vec3 uUmbraColor;
  uniform float uUmbraGlow;
  uniform float uEclipses;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  ${ECLIPSE_GLSL}

  void main() {
    vec3 albedo = texture2D(uMap, vUv).rgb;
    vec3 n = normalize(vWorldNormal);
    vec3 sunDir = normalize(uSunDirection);

    // Phase comes straight from lighting the sphere with the Sun
    float diffuse = max(dot(n, sunDir), 0.0);

    // Lunar eclipse: share of the solar disc hidden by the (atmosphere-widened) Earth
    float shadow = 0.0;
    if (uEclipses > 0.5) {
      vec3 toEarth = -vWorldPosition;
      float earthAngularRadius =
        asin(clamp(uEarthRadius * uShadowWidening / length(toEarth), 0.0, 1.0));
      float separation = eclipseAngleBetween(toEarth, sunDir);
      shadow = eclipseDiscOcclusion(separation, uSunAngularRadius, earthAngularRadius);
    }
    vec3 light = vec3(diffuse * (1.0 - shadow));
    // Sunlight refracted through Earth's atmosphere tints the umbra red
    light += uUmbraColor * (uUmbraGlow * diffuse * pow(shadow, 4.0));

    // Earthshine: lit by the Earth, strongest when the Earth seen from the Moon is "full"
    vec3 toEarthDir = normalize(-uMoonCenter);
    float earthPhase = 0.5 * (1.0 + dot(toEarthDir, -sunDir));
    light += vec3(uEarthshine * earthPhase * max(dot(n, toEarthDir), 0.0));

    gl_FragColor = vec4(albedo * light, 1.0);
  }
`;

export interface MoonControllerOptions {
  /** Shared Moon center (scene units), e.g. `DayNightController.getMoonPosition()`. */
  moonPosition: Vector3;
  /** Shared sun direction, e.g. `DayNightController.getSunDirection()`. */
  sunDirection: Vector3;
  date?: Date;
  textureUrl?: string;
  params?: Partial<MoonParams>;
}

/**
 * The Moon at its real position, distance and size relative to the globe (~60 Earth radii away,
 * radius 27.3 scene units). Unlike the Sun it is a real object in the scene: at this distance the
 * parallax is genuine. Lit by the shared sun direction, so its phase needs no separate model;
 * the near side always faces the Earth (synchronous rotation, no libration).
 */
export class MoonController {
  public readonly params: MoonParams;
  private readonly scene: Scene | null;
  private readonly store: Store<AppState>;
  private readonly moonPosition: Vector3;
  private readonly geometry: SphereGeometry;
  private readonly material: ShaderMaterial;
  private readonly mesh: Mesh;
  private readonly texture: Texture | null;
  private readonly unsubs: (() => void)[] = [];
  private readonly basis = new Matrix4();

  constructor(scene: Scene | null, store: Store<AppState>, options: MoonControllerOptions) {
    this.scene = scene;
    this.store = store;
    this.moonPosition = options.moonPosition;
    this.params = { ...DEFAULT_MOON_PARAMS, ...options.params };

    const date = options.date ?? new Date();
    this.texture = new TextureLoader().load(
      resolveAssetUrl(options.textureUrl ?? '/textures/moon.jpg'),
    );

    this.material = new ShaderMaterial({
      uniforms: {
        uMap: { value: this.texture },
        uSunDirection: { value: options.sunDirection },
        uMoonCenter: { value: this.moonPosition },
        uEarthshine: { value: this.params.earthshine },
        uSunAngularRadius: { value: sunAngularRadiusRad(date) },
        uEarthRadius: { value: GLOBE_RADIUS },
        uShadowWidening: { value: this.params.shadowWidening },
        uUmbraColor: { value: new Vector3(1.0, 0.32, 0.12) },
        uUmbraGlow: { value: this.params.umbraGlow },
        uEclipses: { value: 1 },
      },
      vertexShader: MOON_VERTEX_SHADER,
      fragmentShader: MOON_FRAGMENT_SHADER,
    });

    this.geometry = new SphereGeometry(MOON_RADIUS_SCENE, 48, 24);
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.name = 'moon';
    this.mesh.raycast = () => {};

    this.scene?.add(this.mesh);
    this.setDate(date);
    this.syncVisibility();
    this.mesh.scale.setScalar(store.get().moonScale);
    this.bindStore();
  }

  public getMesh(): Mesh {
    return this.mesh;
  }

  public getMaterial(): ShaderMaterial {
    return this.material;
  }

  /**
   * Moves and orients the Moon for `date`. The shared position vector must already hold the
   * Moon for that date (the day/night controller updates it before notifying listeners).
   */
  public setDate(date: Date): void {
    this.mesh.position.copy(this.moonPosition);

    // SphereGeometry maps the texture center (selenographic 0°, 0°) to local +X and east to −Z:
    // point +X at the Earth and +Y along the ecliptic pole (the lunar axis is tilted only 1.5°).
    const x = this.moonPosition.clone().negate().normalize();
    const pole = new Vector3(...calculateEclipticPoleDirection(date));
    const y = pole.addScaledVector(x, -pole.dot(x)).normalize();
    const z = new Vector3().crossVectors(x, y);
    this.mesh.quaternion.setFromRotationMatrix(this.basis.makeBasis(x, y, z));

    const u = this.material.uniforms;
    if (u.uSunAngularRadius) u.uSunAngularRadius.value = sunAngularRadiusRad(date);
  }

  /** Pushes `params` changes (e.g. from the dev panel) into the mesh and shader. */
  public applyParams(): void {
    const u = this.material.uniforms;
    if (u.uEarthshine) u.uEarthshine.value = this.params.earthshine;
    if (u.uShadowWidening) u.uShadowWidening.value = this.params.shadowWidening;
    if (u.uUmbraGlow) u.uUmbraGlow.value = this.params.umbraGlow;
  }

  /**
   * Size multiplier from `AppState.moonScale` (comparison aid only: eclipses always use the
   * real radius).
   */
  public getScale(): number {
    return this.mesh.scale.x;
  }

  /** Turns the Earth's shadow on the Moon on or off (dev panel). */
  public setEclipsesEnabled(enabled: boolean): void {
    if (this.material.uniforms.uEclipses) this.material.uniforms.uEclipses.value = enabled ? 1 : 0;
  }

  private syncVisibility(): void {
    const { dayNight, theme } = this.store.get();
    this.mesh.visible = dayNight && theme !== 'classic';
  }

  private bindStore(): void {
    this.unsubs.push(
      this.store.subscribe(
        s => s.dayNight,
        () => this.syncVisibility(),
      ),
      this.store.subscribe(
        s => s.theme,
        () => this.syncVisibility(),
      ),
      this.store.subscribe(
        s => s.moonScale,
        scale => this.mesh.scale.setScalar(scale),
      ),
    );
  }

  public destroy(): void {
    this.unsubs.forEach(unsub => unsub());
    this.unsubs.length = 0;
    this.scene?.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
    this.texture?.dispose();
  }
}
