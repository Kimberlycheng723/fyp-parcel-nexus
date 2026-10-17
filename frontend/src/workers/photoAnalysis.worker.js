import cvModule from '@techstark/opencv-js';
import { comparePhotoDescriptors, cvCapabilities, describePhoto } from '../utils/openCvComparison.js';

let reference = null;
const ready = new Promise((resolve, reject) => {
  if (cvModule.Mat) resolve({ cv: cvModule });
  else { cvModule.onRuntimeInitialized = () => resolve({ cv: cvModule }); cvModule.onAbort = () => reject(new Error('OpenCV initialization failed.')); }
});
self.onmessage = async ({ data }) => {
  const { id, kind, image, options, previews } = data;
  try {
    const { cv } = await ready;
    if (kind === 'capabilities') return self.postMessage({ id, result: cvCapabilities(cv) });
    if (kind === 'reference') {
      reference?.dispose(); reference = describePhoto(cv, image, options);
      return self.postMessage({ id, result: { segmentation: reference.segmentation, capabilities: cvCapabilities(cv) } });
    }
    if (kind !== 'compare' || !reference) throw new Error('Prepare a reference photo first.');
    const candidate = describePhoto(cv, image, options);
    try {
      const result = comparePhotoDescriptors(cv, reference, candidate);
      if (previews) { result.referencePreview = reference.preview; result.candidatePreview = candidate.preview; }
      self.postMessage({ id, result });
    } finally { candidate.dispose(); }
  } catch { self.postMessage({ id, error: 'OpenCV analysis unavailable for this image.' }); }
};
