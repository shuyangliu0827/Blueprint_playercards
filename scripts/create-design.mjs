import fs from 'node:fs';
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
const pad = { top: 0, right: 0, bottom: 0, left: 0 };
const el = (id, type, x, y, w, h, z, extra) => ({
  id,
  type,
  rect: { x, y, w, h },
  zIndex: z,
  opacity: 1,
  rotationDeg: 0,
  safeAreaPolicy: 'bleed',
  ...extra,
});
const shape = (id, x, y, w, h, z, fill, stroke = '#00000000', sw = 0) =>
  el(id, 'shape', x, y, w, h, z, {
    shape: { kind: 'rectangle', fill, stroke, strokeWidth: sw, radius: 4 },
  });
const text = (
  id,
  content,
  x,
  y,
  w,
  h,
  z,
  size,
  color = '#F4F3ECFF',
  weight = 500,
  lines = 1,
  align = 'left',
) =>
  el(id, 'text', x, y, w, h, z, {
    safeAreaPolicy: 'inside',
    text: {
      content: typeof content === 'string' ? { literal: content } : content,
      fontRef: 'sans',
      fontSize: size,
      fontWeight: weight,
      color,
      align,
      verticalAlign: 'middle',
      lineHeight: 1.4,
      letterSpacing: 0,
      maxLines: lines,
      padding: pad,
      overflow: { strategy: 'shrink', minFontSize: Math.min(size, 18), onExhausted: 'reject' },
    },
  });
const binding = (v) => ({ binding: v });
const frame = [
  shape('frame', 22, 22, 1456, 2056, 0, '#CDD0D3FF'),
  shape('frame-dark', 32, 32, 1436, 2036, 1, '#151C28FF'),
  shape('frame-line', 45, 45, 1410, 2010, 2, '#101723FF', '#818C9EFF', 3),
];
const front = [
  ...frame,
  el('artwork', 'image', 60, 200, 1380, 1485, 3, {
    image: { source: { binding: 'generatedArtwork' }, fit: 'cover', anchor: { x: 0.5, y: 0.42 } },
  }),
  shape('header', 60, 60, 1380, 174, 4, '#0C121EFF'),
  text('brand', 'B.  蓝本', 100, 86, 690, 66, 5, 58, undefined, 800),
  text(
    'brand-sub',
    'BLUEPRINT  /  YOUR GAME, YOUR CARD',
    105,
    154,
    900,
    36,
    6,
    24,
    '#9CAEC4FF',
    500,
  ),
  shape('name-panel', 60, 1575, 1380, 465, 7, '#101723EF'),
  shape('accent', 104, 1640, 130, 7, 8, '#DDD194FF'),
  text('edition', binding('tierName'), 260, 1618, 690, 45, 9, 27, '#DDD194FF'),
  text('nickname', binding('nickname'), 100, 1685, 1260, 180, 10, 144, undefined, 800),
  text('position', binding('position'), 104, 1870, 690, 64, 11, 38, '#B5C4D5FF'),
  text('jersey', binding('jerseyNumber'), 1120, 92, 240, 130, 12, 118, undefined, 800, 1, 'right'),
  text('ai', binding('aiLabel'), 950, 1904, 410, 40, 13, 25, '#A5B4C6FF', 400, 1, 'right'),
  text('id', binding('cardId'), 104, 1965, 1260, 28, 14, 24, '#8392A6FF'),
  el('foil', 'material', 48, 48, 1404, 2004, 15, { material: { slotId: 'card-surface' } }),
];
const back = [
  ...frame,
  text('brand', 'B.  蓝本', 104, 120, 1100, 100, 3, 80, undefined, 800),
  text('backsub', 'THE STORY BEHIND THE GAME', 110, 240, 1200, 60, 4, 28, '#A9B6C6FF'),
  shape('line-a', 105, 400, 1290, 3, 5, '#657185FF'),
  text('nickname', binding('nickname'), 104, 486, 1260, 150, 6, 124, undefined, 800),
  text('number', { binding: 'jerseyNumber', prefix: '球衣号码  /  ' }, 104, 710, 1260, 75, 7, 43),
  text('position', { binding: 'position', prefix: '场上位置  /  ' }, 104, 815, 1260, 75, 8, 43),
  text('hand', { binding: 'handedness', prefix: '惯用手  /  ' }, 104, 920, 1260, 75, 9, 43),
  shape('line-b', 105, 1110, 1290, 3, 10, '#657185FF'),
  text('story', binding('story'), 104, 1200, 1240, 490, 11, 49, '#D1D9E3FF', 400, 6),
  text('tier', binding('tierName'), 104, 1760, 1260, 60, 12, 36, '#DDD194FF'),
  text('ai', binding('aiLabel'), 104, 1850, 1260, 60, 13, 30, '#A9B6C6FF'),
  text('id', binding('cardId'), 104, 1960, 1260, 28, 14, 24, '#8392A6FF'),
];
write('config/layout.json', {
  schemaVersion: '1.0.0',
  templateVersion: 'blueprint-v0.1',
  _placeholder: true,
  notes: '按用户授权复用旧视觉语言的程序设计初版，所有数值可整体替换；未添加旧版业务字段。',
  canvas: { width: 1500, height: 2100, dpi: 300, colorSpace: 'srgb' },
  safeArea: { top: 70, right: 70, bottom: 70, left: 70 },
  fonts: [
    {
      id: 'sans',
      family: 'Arial',
      source: null,
      weights: [400, 500, 800],
      fallbacks: ['PingFang SC', 'Microsoft YaHei', 'sans-serif'],
      rightsRef: 'system-fonts-no-redistribution',
    },
  ],
  front: { backgroundColor: '#070D16FF', elements: front },
  back: { backgroundColor: '#070D16FF', elements: back },
});
const texture = (assetRef) => ({
  assetRef,
  uvScale: [1, 1],
  uvOffset: [0, 0],
  rotationDeg: 0,
  filter: 'linear',
  wrap: 'clamp-to-edge',
  colorSpace: 'linear',
});
const mask = (assetRef) => ({ assetRef, channel: 'r', invert: false, uvSpace: 'surface' });
const curve = (source, target, a, b) => ({
  source,
  target,
  curve: {
    kind: 'piecewise-linear',
    points: [
      [a, -0.8],
      [0, 0],
      [b, 0.8],
    ],
    outside: 'clamp',
  },
});
const specs = [
  ['base', '基础', 0.08, 0, '#D5DEECFF', 0.02],
  ['silver', '银折', 0.55, 0.08, '#D9E6FFFF', 0.09],
  ['prism', '棱镜', 0.66, 0.94, '#F2EDFFFF', 0.13],
  ['gold', '金箔', 0.61, 0.09, '#FFC45CFF', 0.1],
  ['obsidian', '黑曜', 0.65, 0.48, '#A7ABFFFF', 0.025],
];
write('config/effect.json', {
  schemaVersion: '1.0.0',
  effectVersion: 'foil-v0.1',
  templateVersion: 'blueprint-v0.1',
  _placeholder: true,
  notes: 'WebGL1 单四边形透明反光层；材质参数为程序设计初版。',
  surface: { slotId: 'card-surface', uvOrigin: 'top-left', alphaMode: 'straight' },
  input: {
    preferredSource: 'pointer',
    pointerFallback: true,
    smoothingMs: 110,
    returnToRestMs: 240,
  },
  fallbackPolicy: {
    onWebGLUnavailable: 'static',
    onContextLost: 'static',
    lowFps: {
      threshold: 24,
      sampleWindowMs: 1600,
      consecutiveWindows: 2,
      warmupMs: 2000,
      ignoreWhenHidden: true,
    },
    recovery: 'next-mount',
  },
  materials: specs.map(([id, label, strength, dispersion, tint, ambient]) => {
    const uniforms = {
      strength,
      dispersion,
      specularSharpness: id === 'obsidian' ? 96 : 36,
      normalScale: 0.6,
      noiseScale: 4,
      noiseStrength: 0.15,
      roughness: 0.26,
      anisotropy: 0.45,
      tint,
      specularColor: '#FFFFFFFF',
      lightDirection: [-0.25, 0.4, 1],
      ambient,
      tiltX: 0.2,
      tiltY: -0.15,
    };
    return {
      id,
      label,
      textures: { normal: texture('materials/normal.png'), noise: texture('materials/noise.png') },
      coverageMask: mask('materials/coverage.png'),
      protectMask: mask('materials/protect.png'),
      uniforms,
      responseCurves: [
        curve('pointer.x', 'tiltX', -1, 1),
        curve('pointer.y', 'tiltY', -1, 1),
        curve('orientation.rollDeg', 'tiltX', -30, 30),
        curve('orientation.pitchDeg', 'tiltY', -30, 30),
      ],
      staticFallback: {
        imageRef: `materials/${id}-static.png`,
        fit: 'stretch',
        maskBakedIn: true,
        captureUniforms: { ...uniforms, tiltX: 0.35, tiltY: -0.22 },
      },
    };
  }),
});
const p = JSON.parse(fs.readFileSync('package.json'));
p.scripts = {
  ...p.scripts,
  dev: 'next dev --hostname 0.0.0.0',
  build: 'npm run config:check && next build',
  start: 'next start --hostname 0.0.0.0',
};
write('package.json', p);
const ts = JSON.parse(fs.readFileSync('tsconfig.json'));
Object.assign(ts.compilerOptions, {
  lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  jsx: 'react-jsx',
  allowJs: true,
  incremental: true,
  plugins: [{ name: 'next' }],
});
ts.include = [
  'next-env.d.ts',
  'src/**/*.ts',
  'src/**/*.tsx',
  'scripts/**/*.ts',
  'tests/**/*.ts',
  'vitest.config.ts',
  '.next/types/**/*.ts',
  '.next/dev/types/**/*.ts',
];
write('tsconfig.json', ts);
