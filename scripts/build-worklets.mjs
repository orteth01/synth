import * as esbuild from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const watch = process.argv.includes('--watch')

const ctx = await esbuild.context({
  entryPoints: [path.join(root, 'src/audio/worklet/voice.worklet.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outdir: path.join(root, 'public/worklets'),
  entryNames: '[name]',
  logLevel: 'info',
  sourcemap: 'inline',
})

if (watch) {
  await ctx.watch()
  console.log('[worklets] watching for changes...')
} else {
  await ctx.rebuild()
  await ctx.dispose()
}
