import { TextureLoader, type Texture } from 'three';
import { resolveAssetUrl } from '@/utils/assets';

export interface ProgressiveLoadOptions {
  lowResUrl: string;
  highResUrl?: string;
  onUpdate?: (texture: Texture) => void;
}

/**
 * Loads a lightweight base texture immediately for fast First Meaningful Paint,
 * then asynchronously fetches a high-resolution variant and invokes `onUpdate`
 * to seamlessly swap the material uniform.
 */
export class ProgressiveTextureLoader {
  private readonly loader: TextureLoader;
  private currentTexture: Texture | null = null;
  private highResTexture: Texture | null = null;

  constructor(loader: TextureLoader = new TextureLoader()) {
    this.loader = loader;
  }

  public load(options: ProgressiveLoadOptions): Texture {
    const lowUrl = resolveAssetUrl(options.lowResUrl);
    this.currentTexture = this.loader.load(lowUrl);

    if (options.highResUrl) {
      const highUrl = resolveAssetUrl(options.highResUrl);
      this.loader.load(
        highUrl,
        texture => {
          this.highResTexture = texture;
          options.onUpdate?.(texture);
        },
        undefined,
        err => {
          // Graceful fallback: retain low-res texture
          console.warn(
            `[ProgressiveTextureLoader] High-res texture failed (${highUrl}), keeping base texture.`,
            err,
          );
        },
      );
    }

    return this.currentTexture;
  }

  public getCurrentTexture(): Texture | null {
    return this.highResTexture ?? this.currentTexture;
  }

  public dispose(): void {
    this.currentTexture?.dispose();
    this.currentTexture = null;
    this.highResTexture?.dispose();
    this.highResTexture = null;
  }
}
