import type { MaterialInput } from '../render/material-input';
/** Contract only. No WeChat client or SDK is included in v0. */
export interface MiniProgramAdapters {
  loadTexture(assetRef: string): Promise<TexImageSource>;
  bindTouch(onInput: (value: MaterialInput) => void): () => void;
  bindGyroscope(onInput: (value: MaterialInput) => void): Promise<() => void>;
  saveImage(blob: Blob): Promise<void>;
}
