import assert from 'node:assert/strict';
import test from 'node:test';
import cvModule from '@techstark/opencv-js';
import { comparePhotoDescriptors, cvCapabilities, describePhoto } from '../src/utils/openCvComparison.js';

const ready = cvModule.Mat ? Promise.resolve({ cv: cvModule }) : new Promise((resolve) => { cvModule.onRuntimeInitialized = () => resolve({ cv: cvModule }); });
export function fixtureImage(colour = [160, 100, 50], circle = false) {
  const width = 600, height = 400, data = new Uint8ClampedArray(width * height * 4);
  let random = 42;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const inside = circle ? Math.hypot(x - 300, y - 200) < 145 : x > 80 && x < 520 && y > 70 && y < 330;
    const i = (y * width + x) * 4; data.set([...(inside ? colour : [245, 245, 245]), 255], i);
  }
  for (let count = 0; count < 140; count++) {
    random = (random * 1664525 + 1013904223) >>> 0; const x = 150 + random % 260;
    random = (random * 1664525 + 1013904223) >>> 0; const y = 115 + random % 170;
    for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) data.set([10, 10, 10, 255], ((y + dy) * width + x + dx) * 4);
  }
  return { width, height, data };
}
test('real pinned OpenCV runtime supports and executes histogram, contour, ORB and GrabCut paths', async () => {
  const { cv } = await ready, capabilities = cvCapabilities(cv);
  for (const supported of Object.values(capabilities)) assert.equal(supported, true);
  const reference = describePhoto(cv, fixtureImage()), same = describePhoto(cv, fixtureImage()), different = describePhoto(cv, fixtureImage([20, 60, 220], true));
  try {
    const match = comparePhotoDescriptors(cv, reference, same);
    assert.equal(match.colour.status, 'SIMILAR'); assert.ok(match.colour.distance < .001);
    assert.equal(match.shape.status, 'CONSISTENT');
    assert.equal(match.orb.status, 'RELIABLE'); assert.ok(match.orb.inliers >= 8); assert.ok(match.orb.lines.length);
    const contrast = comparePhotoDescriptors(cv, reference, different);
    assert.equal(contrast.colour.status, 'DIFFERENT'); assert.notEqual(contrast.shape.status, 'UNAVAILABLE');
  } finally { reference.dispose(); same.dispose(); different.dispose(); }
  const isolated = describePhoto(cv, fixtureImage(), { grabCut: true, regionSelected: true });
  try { assert.equal(isolated.segmentation, 'ISOLATED'); assert.ok(isolated.preview.data.some((value, index) => index % 4 === 3 && value === 0)); }
  finally { isolated.dispose(); }
});
test('unsupported ORB/GrabCut and missing outlines remain explicitly unavailable/inconclusive', async () => {
  const { cv } = await ready;
  const fallbackCv = new Proxy(cv, { get(target, key) { return ['ORB', 'grabCut'].includes(key) ? undefined : Reflect.get(target, key); } });
  const first = describePhoto(fallbackCv, fixtureImage(), { grabCut: true, regionSelected: true }), second = describePhoto(fallbackCv, fixtureImage());
  try { assert.equal(first.segmentation, 'UNAVAILABLE'); assert.equal(comparePhotoDescriptors(fallbackCv, first, second).orb.status, 'UNAVAILABLE'); }
  finally { first.dispose(); second.dispose(); }
  const blank = fixtureImage([245, 245, 245]); blank.data.fill(245); for (let i = 3; i < blank.data.length; i += 4) blank.data[i] = 255;
  const noOutline = describePhoto(cv, blank);
  try { assert.equal(noOutline.shape.status, 'INSUFFICIENT'); }
  finally { noOutline.dispose(); }
});
