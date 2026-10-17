import { createRequire } from 'node:module';
import { createReadStream, readFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
export function imageAnalysisAssets() {
  const core = path.dirname(require.resolve('tesseract.js-core/package.json'));
  const tesseract = path.dirname(require.resolve('tesseract.js/package.json'));
  const english = path.dirname(require.resolve('@tesseract.js-data/eng/package.json'));
  const assets = new Map([
    ['image-analysis/tesseract/worker.min.js', path.join(tesseract, 'dist/worker.min.js')],
    ['image-analysis/tesseract/lang/eng.traineddata.gz', path.join(english, '4.0.0_best_int/eng.traineddata.gz')],
    ...['', '-simd', '-relaxedsimd'].map((variant) => [
      `image-analysis/tesseract/core/tesseract-core${variant}-lstm.wasm.js`,
      path.join(core, `tesseract-core${variant}-lstm.wasm.js`)
    ]),
    ['image-analysis/tesseract/CORE-LICENSE', path.join(core, 'LICENSE')],
    ['image-analysis/tesseract/LICENSE', path.join(tesseract, 'LICENSE.md')]
  ]);
  return {
    name: 'parcel-nexus-local-image-analysis',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const key = (req.url || '').split('?')[0].replace(/^\//, '');
        const file = assets.get(key);
        if (!file) return next();
        res.setHeader('Content-Type', key.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
        createReadStream(file).on('error', next).pipe(res);
      });
    },
    generateBundle() {
      for (const [fileName, file] of assets) this.emitFile({ type: 'asset', fileName, source: readFileSync(file) });
    }
  };
}
