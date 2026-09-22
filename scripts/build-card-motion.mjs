import { build } from 'esbuild';
await build({
  entryPoints: ['src/platform/card-motion.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  outfile: 'public/motion/card-motion.js',
  minify: true,
});
console.log('Portable card animation built: public/motion/card-motion.js');
