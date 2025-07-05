import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  outDir: 'dist',
  splitting: false,
  sourcemap: false,
  clean: true,
  define: {
    'import.meta.vitest': 'undefined',
  },
})
