import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/client/index.ts', 'src/model/index.ts', 'src/util/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  outDir: 'dist',
  splitting: false,
  sourcemap: false,
  clean: true,
  treeshake: true,
  define: {
    'import.meta.vitest': 'undefined',
  },
})
