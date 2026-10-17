import { preprocessPhoto } from '../utils/photoPreprocessing.js';

export class PhotoAnalysisEngine {
  constructor(signal) {
    if (typeof Worker !== 'function' || typeof WebAssembly === 'undefined') throw new Error('This browser does not support local image-analysis workers. Use a current browser.');
    this.signal = signal; this.sequence = 0; this.requests = new Map(); this.ocrWorker = null; this.ocrUnavailable = false; this.cvUnavailable = false; this.closed = false;
    this.cvWorker = new Worker(new URL('../workers/photoAnalysis.worker.js', import.meta.url), { type: 'module' });
    this.cvWorker.onmessage = ({ data }) => {
      const pending = this.requests.get(data.id); if (!pending) return;
      this.requests.delete(data.id); clearTimeout(pending.timer);
      data.error ? pending.reject(new Error(data.error)) : pending.resolve(data.result);
    };
    this.cvWorker.onerror = () => { this.cvUnavailable = true; this.rejectCv(); };
    this.abort = () => this.dispose(); signal.addEventListener('abort', this.abort, { once: true });
  }
  rejectCv() {
    for (const pending of this.requests.values()) { clearTimeout(pending.timer); pending.reject(new Error('OpenCV analysis unavailable.')); }
    this.requests.clear();
  }
  cv(kind, image, options, previews = false) {
    if (this.closed || this.cvUnavailable) return Promise.reject(new Error('OpenCV analysis unavailable.'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.cvUnavailable = true; this.cvWorker.terminate(); this.rejectCv(); }, 30000);
      this.requests.set(id, { resolve, reject, timer });
      this.cvWorker.postMessage({ id, kind, image, options, previews }, image ? [image.data.buffer] : []);
    });
  }
  async initializeOcr() {
    if (this.closed || this.ocrUnavailable) throw new Error('Cancelled');
    const root = new URL(`${import.meta.env.BASE_URL}image-analysis/tesseract/`, location.origin).href;
    // Own the host immediately, including Tesseract's child worker during pending initialization.
    const native = new Worker(new URL('../workers/photoOcr.worker.js', import.meta.url), { type: 'module' });
    const pending = new Map(); let sequence = 0;
    const rejectAll = () => { for (const job of pending.values()) job.reject(new Error('OCR unavailable.')); pending.clear(); };
    const request = (kind, payload = {}) => new Promise((resolve, reject) => {
      const id = ++sequence; pending.set(id, { resolve, reject }); native.postMessage({ id, kind, ...payload });
    });
    native.onmessage = ({ data }) => {
      const job = pending.get(data.id); if (!job) return; pending.delete(data.id);
      data.error ? job.reject(new Error(data.error)) : job.resolve(data.result);
    };
    native.onerror = rejectAll;
    const worker = { recognize: (blob, tracking) => request('recognize', { blob, tracking }),
      terminate: () => { native.terminate(); rejectAll(); } };
    this.ocrWorker = worker;
    await request('initialize', { root });
    if (this.closed || this.ocrUnavailable) { worker.terminate(); throw new Error('Cancelled'); }
    return worker;
  }
  async ocr(blob, tracking) {
    if (this.ocrUnavailable) return { status: 'UNAVAILABLE', snippets: [] };
    let timer, abort;
    try {
      const deadline = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('OCR timed out')), 45000);
        abort = () => reject(new DOMException('Cancelled', 'AbortError'));
        this.signal.addEventListener('abort', abort, { once: true }); if (this.signal.aborted) abort();
      });
      // Initialization never captures image data; cancellation cannot queue a late recognition job.
      const worker = this.ocrWorker || await Promise.race([this.initializeOcr(), deadline]);
      if (this.closed || this.signal.aborted) throw new Error('Cancelled');
      return await Promise.race([worker.recognize(blob, tracking), deadline]);
    } catch { this.ocrUnavailable = true; this.ocrWorker?.terminate(); this.ocrWorker = null; return { status: 'UNAVAILABLE', snippets: [] }; }
    finally { clearTimeout(timer); if (abort) this.signal.removeEventListener('abort', abort); }
  }
  async prepare(blob, tracking, options) {
    const prepared = await preprocessPhoto(blob, options);
    this.referenceOcr = options.skipOcr ? { status: 'UNAVAILABLE', snippets: [] } : await this.ocr(prepared.ocrBlob, tracking);
    if (this.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    try { this.runtime = await this.cv('reference', prepared.image, options); }
    catch { this.cvUnavailable = true; this.runtime = { capabilities: {}, segmentation: 'UNAVAILABLE' }; }
    return { referenceOcr: this.referenceOcr, ...this.runtime };
  }
  async compare(blob, tracking, options, previews = false) {
    const prepared = await preprocessPhoto(blob, options);
    const ocr = options.skipOcr ? { status: 'UNAVAILABLE', snippets: [] } : await this.ocr(prepared.ocrBlob, tracking);
    if (this.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    let visual;
    try { visual = await this.cv('compare', prepared.image, options, previews); }
    catch { visual = { colour: { status: 'UNAVAILABLE' }, shape: { status: 'UNAVAILABLE' }, orb: { status: 'UNAVAILABLE' }, segmentation: 'UNAVAILABLE' }; }
    return { ...visual, ocr, referenceOcr: this.referenceOcr, dimensions: prepared.dimensions, capabilities: this.runtime?.capabilities || {} };
  }
  dispose() {
    if (this.closed) return; this.closed = true; this.signal.removeEventListener('abort', this.abort);
    this.cvWorker.terminate(); this.rejectCv(); this.ocrWorker?.terminate(); this.ocrWorker = null;
  }
}
