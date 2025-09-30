import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: false,
    clean: true,
    treeshake: true,        
    shims: false,
    external: ['vite'],     
    target: 'node20',       
    outDir: 'dist',
    splitting: false,
});
