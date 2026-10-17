export function cvCapabilities(cv) {
  return Object.fromEntries(['calcHist', 'compareHist', 'findContours', 'matchShapes', 'grabCut', 'ORB', 'BFMatcher', 'findHomography'].map((key) => [key, typeof cv?.[key] === 'function']));
}
export function describePhoto(cv, image, { grabCut = false, regionSelected = false } = {}) {
  const resources = [];
  const keep = (value) => { resources.push(value); return value; };
  const output = { colour: { status: 'UNAVAILABLE' }, shape: { status: 'UNAVAILABLE' }, orb: { status: 'UNAVAILABLE' }, segmentation: 'NOT_REQUESTED' };
  try {
    const rgba = keep(cv.matFromImageData(image)), rgb = keep(new cv.Mat()), hsv = keep(new cv.Mat()), gray = keep(new cv.Mat());
    cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB); cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV); cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
    const mask = keep(new cv.Mat());
    if (grabCut) {
      output.segmentation = !cvCapabilities(cv).grabCut ? 'UNAVAILABLE' : !regionSelected ? 'REGION_REQUIRED' : 'FAILED';
      if (cvCapabilities(cv).grabCut && regionSelected && image.width >= 20 && image.height >= 20) {
        try {
          const gc = keep(cv.Mat.zeros(image.height, image.width, cv.CV_8UC1)), bg = keep(new cv.Mat()), fg = keep(new cv.Mat());
          const margin = Math.max(2, Math.round(Math.min(image.width, image.height) * .03));
          cv.grabCut(rgb, gc, new cv.Rect(margin, margin, image.width - margin * 2, image.height - margin * 2), bg, fg, 3, cv.GC_INIT_WITH_RECT);
          mask.create(image.height, image.width, cv.CV_8UC1);
          let foreground = 0;
          for (let i = 0; i < gc.data.length; i++) { const selected = gc.data[i] === cv.GC_FGD || gc.data[i] === cv.GC_PR_FGD; mask.data[i] = selected ? 255 : 0; if (selected) foreground++; }
          if (foreground < image.width * image.height * .02 || foreground > image.width * image.height * .98) {
            mask.create(0, 0, cv.CV_8UC1); output.segmentation = 'INCONCLUSIVE';
          } else output.segmentation = 'ISOLATED';
        } catch { output.segmentation = 'FAILED'; mask.create(0, 0, cv.CV_8UC1); }
      }
    }
    output.preview = { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
    if (output.segmentation === 'ISOLATED') for (let i = 0; i < mask.data.length; i++) if (!mask.data[i]) output.preview.data[i * 4 + 3] = 0;
    try {
      const images = keep(new cv.MatVector()); images.push_back(hsv);
      const histogram = keep(new cv.Mat());
      cv.calcHist(images, [0, 1, 2], mask, histogram, [18, 8, 8], [0, 180, 0, 256, 0, 256], false);
      cv.normalize(histogram, histogram, 1, 0, cv.NORM_L1);
      output.histogram = histogram;
      output.colour = { status: 'READY' };
    } catch { output.colour = { status: 'UNAVAILABLE' }; }
    try {
      const edges = keep(new cv.Mat());
      if (output.segmentation === 'ISOLATED') mask.copyTo(edges);
      else { cv.GaussianBlur(gray, edges, new cv.Size(5, 5), 0); cv.Canny(edges, edges, 40, 120); }
      const contours = keep(new cv.MatVector()), hierarchy = keep(new cv.Mat());
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      let largest = null, area = 0;
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i); const current = cv.contourArea(contour);
        if (current > area) { largest?.delete(); largest = contour; area = current; } else contour.delete();
      }
      if (largest) keep(largest);
      if (largest && area >= image.width * image.height * .04 && area < image.width * image.height * .99) {
        const rect = cv.boundingRect(largest); output.contour = largest;
        output.shape = { status: 'READY', aspectRatio: rect.width / rect.height };
      } else output.shape = { status: 'INSUFFICIENT' };
    } catch { output.shape = { status: 'UNAVAILABLE' }; }
    if (cvCapabilities(cv).ORB && cvCapabilities(cv).BFMatcher) {
      try {
        const orb = keep(new cv.ORB(600)), points = keep(new cv.KeyPointVector()), descriptors = keep(new cv.Mat());
        orb.detectAndCompute(gray, mask, points, descriptors);
        output.points = points; output.descriptors = descriptors; output.orb = { status: points.size() >= 8 ? 'READY' : 'INSUFFICIENT', keypoints: points.size() };
      } catch { output.orb = { status: 'UNAVAILABLE' }; }
    }
    return {
      ...output,
      dispose() { for (const item of resources.reverse()) item.delete(); }
    };
  } catch (error) { for (const item of resources.reverse()) item.delete(); throw error; }
}
export function comparePhotoDescriptors(cv, reference, candidate) {
  const result = { colour: { status: 'UNAVAILABLE' }, shape: { status: 'UNAVAILABLE' }, orb: { status: 'UNAVAILABLE' }, segmentation: candidate.segmentation };
  try {
    if (reference.histogram && candidate.histogram) {
      const distance = cv.compareHist(reference.histogram, candidate.histogram, cv.HISTCMP_BHATTACHARYYA);
      result.colour = Number.isFinite(distance) ? { status: distance <= .25 ? 'SIMILAR' : distance <= .5 ? 'MODERATE' : 'DIFFERENT', distance } : { status: 'INCONCLUSIVE' };
    }
  } catch { /* Other methods remain usable if histogram comparison fails. */ }
  try {
    if (reference.contour && candidate.contour) {
      const difference = cv.matchShapes(reference.contour, candidate.contour, cv.CONTOURS_MATCH_I1, 0);
      const ratioDifference = Math.abs(Math.log(reference.shape.aspectRatio / candidate.shape.aspectRatio));
      result.shape = { status: difference <= .15 && ratioDifference <= .25 ? 'CONSISTENT' : difference > .3 || ratioDifference > .5 ? 'DIFFERENT' : 'INSUFFICIENT', difference,
        referenceAspectRatio: reference.shape.aspectRatio, candidateAspectRatio: candidate.shape.aspectRatio };
    } else result.shape = { status: reference.shape.status === 'UNAVAILABLE' || candidate.shape.status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'INSUFFICIENT' };
  } catch { result.shape = { status: 'UNAVAILABLE' }; }
  if (reference.orb.status === 'UNAVAILABLE' || candidate.orb.status === 'UNAVAILABLE') return result;
  result.orb = { status: 'INSUFFICIENT', referenceKeypoints: reference.orb.keypoints, candidateKeypoints: candidate.orb.keypoints, matches: 0, inliers: 0, lines: [] };
  if (reference.orb.status !== 'READY' || candidate.orb.status !== 'READY') return result;
  const resources = [];
  try {
    const matcher = new cv.BFMatcher(cv.NORM_HAMMING, false), pairs = new cv.DMatchVectorVector(); resources.push(matcher, pairs);
    matcher.knnMatch(reference.descriptors, candidate.descriptors, pairs, 2);
    const lines = [];
    for (let i = 0; i < pairs.size(); i++) {
      const pair = pairs.get(i);
      try {
        if (pair.size() < 2) continue;
        const a = pair.get(0), b = pair.get(1);
        if (a.distance < .75 * b.distance && a.distance <= 64) {
          const left = reference.points.get(a.queryIdx).pt, right = candidate.points.get(a.trainIdx).pt;
          lines.push([left.x, left.y, right.x, right.y]);
        }
      } finally { pair.delete(); }
    }
    result.orb.matches = lines.length;
    if (lines.length >= 4 && cvCapabilities(cv).findHomography) {
      const left = cv.matFromArray(lines.length, 1, cv.CV_32FC2, lines.flatMap((line) => line.slice(0, 2)));
      const right = cv.matFromArray(lines.length, 1, cv.CV_32FC2, lines.flatMap((line) => line.slice(2)));
      const inliers = new cv.Mat(); resources.push(left, right, inliers);
      const homography = cv.findHomography(left, right, cv.RANSAC, 3, inliers); resources.push(homography);
      const reliable = lines.filter((line, i) => inliers.data[i]);
      result.orb.geometryAvailable = !homography.empty();
      result.orb.inliers = reliable.length; result.orb.lines = reliable.slice(0, 40);
      result.orb.status = reliable.length >= 8 && reliable.length / lines.length >= .5 ? 'RELIABLE' : 'INSUFFICIENT';
    }
  } catch { result.orb = { status: 'UNAVAILABLE' }; }
  finally { for (const item of resources.reverse()) item.delete(); }
  return result;
}
