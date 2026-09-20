export type Tier = 'base' | 'silver' | 'prism' | 'gold' | 'obsidian';
export type Insets = { top: number; right: number; bottom: number; left: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Uniforms = {
  strength: number;
  dispersion: number;
  specularSharpness: number;
  normalScale: number;
  noiseScale: number;
  noiseStrength: number;
  roughness: number;
  anisotropy: number;
  tint: string;
  specularColor: string;
  lightDirection: number[];
  ambient: number;
  tiltX: number;
  tiltY: number;
};
export type NumericUniform = Exclude<
  keyof Uniforms,
  'tint' | 'specularColor' | 'lightDirection' | 'noiseScale'
>;
export type Curve =
  | { kind: 'piecewise-linear'; points: number[][]; outside: 'clamp' }
  | {
      kind: 'cubic-bezier';
      inputRange: number[];
      outputRange: number[];
      controlPoints: number[];
      outside: 'clamp';
    };
export type Texture = {
  assetRef: string;
  uvScale: number[];
  uvOffset: number[];
  rotationDeg: number;
  filter: 'nearest' | 'linear';
  wrap: 'clamp-to-edge';
  colorSpace: 'linear' | 'srgb';
};
export type Mask = {
  assetRef: string;
  channel: 'r' | 'g' | 'b' | 'a' | 'luminance';
  invert: boolean;
  uvSpace: 'surface';
};
export type Material = {
  id: Tier;
  label: string;
  textures: { normal: Texture | null; noise: Texture | null };
  coverageMask: Mask;
  protectMask: Mask;
  uniforms: Uniforms;
  responseCurves: { source: string; target: NumericUniform; curve: Curve }[];
  staticFallback: {
    imageRef: string;
    fit: 'stretch';
    maskBakedIn: true;
    captureUniforms: Uniforms;
  };
};
export type Effect = {
  schemaVersion: string;
  effectVersion: string;
  templateVersion: string;
  _placeholder: boolean;
  surface: { slotId: string; uvOrigin: 'top-left'; alphaMode: 'straight' };
  input: {
    preferredSource: 'pointer' | 'orientation';
    pointerFallback: boolean;
    smoothingMs: number;
    returnToRestMs: number;
  };
  fallbackPolicy: {
    onWebGLUnavailable: 'static';
    onContextLost: 'static';
    lowFps: {
      threshold: number;
      sampleWindowMs: number;
      consecutiveWindows: number;
      warmupMs: number;
      ignoreWhenHidden: true;
    };
    recovery: string;
  };
  materials: Material[];
};
export type TextStyle = {
  content: { literal?: string; binding?: string; prefix?: string; suffix?: string };
  fontRef: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: CanvasTextAlign;
  verticalAlign: 'top' | 'middle' | 'bottom';
  lineHeight: number;
  letterSpacing: number;
  maxLines: number;
  padding: Insets;
  overflow: {
    strategy: 'shrink' | 'truncate' | 'reject';
    minFontSize?: number;
    onExhausted?: 'reject' | 'ellipsis';
    ellipsis?: string;
  };
};
export type Element = {
  id: string;
  type: 'text' | 'image' | 'shape' | 'material';
  rect: Rect;
  zIndex: number;
  opacity: number;
  rotationDeg: number;
  safeAreaPolicy: 'inside' | 'bleed';
  clip?: { radius: number; maskRef: string | null };
  text?: TextStyle;
  image?: {
    source: { assetRef?: string; binding?: string };
    fit: 'cover' | 'contain' | 'stretch';
    anchor: { x: number; y: number };
  };
  shape?: {
    kind: 'rectangle' | 'ellipse';
    fill: string;
    stroke: string;
    strokeWidth: number;
    radius: number;
  };
  material?: { slotId: string };
};
export type Layout = {
  schemaVersion: string;
  templateVersion: string;
  _placeholder: boolean;
  canvas: { width: number; height: number; dpi: number; colorSpace: 'srgb' };
  safeArea: Insets;
  fonts: {
    id: string;
    family: string;
    source: string | null;
    weights: number[];
    fallbacks: string[];
    rightsRef: string;
  }[];
  front: { backgroundColor: string; elements: Element[] };
  back: { backgroundColor: string; elements: Element[] };
};
export type CardData = {
  nickname: string;
  jerseyNumber: string;
  position: string;
  handedness: string;
  cardId: string;
  aiLabel: string;
  tierName: string;
  story: string;
  seriesName: string;
  issuedAt: string;
};
