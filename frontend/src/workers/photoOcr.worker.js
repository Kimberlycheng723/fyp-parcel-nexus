import { createWorker } from 'tesseract.js';
import { ocrEvidence } from '../utils/photoAnalysisPolicy.js';

let worker;
self.onmessage = async ({ data: { id, kind, root, blob, tracking } }) => {
  try {
    if (kind === 'initialize') {
      worker = await createWorker('eng', 1, {
        workerPath: `${root}worker.min.js`, corePath: `${root}core`, langPath: `${root}lang`,
        workerBlobURL: false, cacheMethod: 'none', gzip: true, logger: () => {},
        errorHandler: () => self.postMessage({ id, error: 'OCR initialization unavailable.' })
      });
      await worker.setParameters({ tessedit_pageseg_mode: '11' });
      self.postMessage({ id, result: true });
    } else if (kind === 'recognize' && worker) {
      const { data } = await worker.recognize(blob);
      self.postMessage({ id, result: ocrEvidence(data.text, tracking, data.confidence) });
    } else throw new Error('OCR unavailable');
  } catch { self.postMessage({ id, error: 'OCR unavailable.' }); }
};
