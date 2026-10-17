import { FULL_REGION, safeRegion } from './photoAnalysisPolicy.js';

export async function decodePhoto(blob) {
  if (!/^image\/(jpeg|png|webp)$/.test(blob.type) || !blob.size || blob.size > 20 * 1024 * 1024) throw new Error('Unsupported or oversized analysis image.');
  let source;
  if (typeof createImageBitmap === 'function') source = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  else {
    const url = URL.createObjectURL(blob);
    try { source = new Image(); source.src = url; await source.decode(); }
    finally { URL.revokeObjectURL(url); }
  }
  const width = source.width || source.naturalWidth, height = source.height || source.naturalHeight;
  if (!width || !height || width * height > 32000000) { source.close?.(); throw new Error('Image dimensions exceed the browser analysis limit.'); }
  return { source, width, height, close: () => source.close?.() };
}
export function photoCanvas(decoded, region = FULL_REGION, maximum = 640) {
  const crop = safeRegion(region), sourceWidth = Math.max(1, Math.round(decoded.width * crop.width)), sourceHeight = Math.max(1, Math.round(decoded.height * crop.height));
  const scale = Math.min(1, maximum / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale)); canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas analysis is unavailable in this browser.');
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(decoded.source, Math.round(decoded.width * crop.x), Math.round(decoded.height * crop.y), sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  return canvas;
}
export async function preprocessPhoto(blob, { parcelRegion = FULL_REGION, labelRegion = FULL_REGION } = {}) {
  const decoded = await decodePhoto(blob);
  let visual, ocr;
  try {
    visual = photoCanvas(decoded, parcelRegion, 640);
    // OCR uses the unsegmented label/original copy at up to 2400px, not the 640px visual copy.
    ocr = photoCanvas(decoded, labelRegion, 2400);
    const ocrBlob = await new Promise((resolve, reject) => ocr.toBlob((value) => value ? resolve(value) : reject(new Error('Cannot prepare OCR image.')), 'image/png'));
    return { image: visual.getContext('2d').getImageData(0, 0, visual.width, visual.height), ocrBlob,
      dimensions: { width: decoded.width, height: decoded.height } };
  } finally { decoded.close(); if (visual) visual.width = visual.height = 0; if (ocr) ocr.width = ocr.height = 0; }
}
