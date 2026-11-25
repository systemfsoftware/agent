import { defineConfig } from 'tsdown'

import manifest from './package.json' with { type: 'json' }

// The source tree is the development surface: every `exports` entry names one source file, and each is one bundle
// entry. `publishConfig.exports` swaps them for the built files when the package is packed.
export default defineConfig({
  entry: Object.values(manifest.exports),
  format: 'esm',
  dts: true,
  // The solution root owns no files, so declaration emit reads the app role directly.
  tsconfig: 'tsconfig.build.json',
  sourcemap: true,
  fixedExtension: true,
})
