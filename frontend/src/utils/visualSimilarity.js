const bounded = (value) => Math.max(0, Math.min(100, value));
const finite = (value) => typeof value === 'number' && Number.isFinite(value);

// A ranking heuristic, not a calibrated identity probability. Missing checks are excluded.
export function visualSimilarity(result = {}) {
  const checks = [];
  const colour = result.colour, shape = result.shape, orb = result.orb;
  if (!result.failed && colour?.status !== 'UNAVAILABLE' && finite(colour?.distance) && colour.distance >= 0 && colour.distance <= 1) {
    checks.push({ key: 'colour', label: 'Colour distribution', score: bounded((1 - colour.distance) * 100), weight: 30 });
  }
  if (!result.failed && shape?.status !== 'UNAVAILABLE' && finite(shape?.difference) && shape.difference >= 0
    && finite(shape.referenceAspectRatio) && shape.referenceAspectRatio > 0 && finite(shape.candidateAspectRatio) && shape.candidateAspectRatio > 0) {
    const ratio = Math.abs(Math.log(shape.referenceAspectRatio / shape.candidateAspectRatio));
    checks.push({ key: 'shape', label: 'Outline and proportions', score: bounded(100 * Math.exp(-shape.difference / .3 - ratio / .5)), weight: 25 });
  }
  if (!result.failed && orb?.status !== 'UNAVAILABLE' && Number.isInteger(orb?.matches) && orb.matches >= 4
    && Number.isInteger(orb?.inliers) && orb.inliers >= 0 && orb.inliers <= orb.matches && orb.geometryAvailable === true) {
    checks.push({ key: 'orb', label: 'Geometric feature matches', score: bounded(100 * orb.inliers / orb.matches * Math.min(1, orb.inliers / 20)), weight: 45 });
  }
  const weight = checks.reduce((sum, check) => sum + check.weight, 0);
  return {
    score: checks.length >= 2 ? Math.round(checks.reduce((sum, check) => sum + check.score * check.weight, 0) / weight) : null,
    checks: checks.map((check) => ({ ...check, score: Math.round(check.score), contribution: Math.round(check.weight / weight * 100) })),
    partial: checks.length < 3
  };
}

export function rankVisualCandidates(results) {
  return [...results].sort((a, b) => {
    const left = visualSimilarity(a), right = visualSimilarity(b);
    return (right.score ?? -1) - (left.score ?? -1)
      || right.checks.length - left.checks.length
      || a.evidence.evidence_id.localeCompare(b.evidence.evidence_id);
  });
}
