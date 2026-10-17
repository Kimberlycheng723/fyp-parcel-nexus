import { visualSimilarity } from '../utils/visualSimilarity.js';

const PHOTO_CHECKS = [{ key: 'colour', label: 'Photo colours' }, { key: 'shape', label: 'Visible shape' }, { key: 'orb', label: 'Small photo details' }];

export function SimilarityBadge({ result, compact = false }) {
  const { score, partial } = visualSimilarity(result);
  return <span className={`photo-similarity ${score === null ? 'unavailable' : score >= 75 ? 'high' : score < 50 ? 'low' : 'moderate'}`}>
    {score === null ? 'No score available' : compact ? `${score}% similar` : `${score}% photo similarity${score < 50 ? ' · low' : ''}${partial ? ' · fewer checks' : ''}`}
  </span>;
}

export function SimilarityDetails({ result }) {
  return <details className="photo-score-details"><summary>View similarity details</summary><SimilarityBreakdown result={result} /></details>;
}

export function SimilarityBreakdown({ result }) {
  const { score, checks, partial } = visualSimilarity(result);
  return <div className="photo-score-breakdown"><h3>{score === null ? 'Not enough detail to give a score' : `Why these photos scored ${score}%`}</h3>
      <p>This score shows how similar the photos look. It does not prove they show the same parcel.</p>
      {PHOTO_CHECKS.map(({ key, label }) => {
        const check = checks.find((item) => item.key === key);
        return check ? <div className={`photo-score-check ${check.score < 50 ? 'low' : check.score >= 75 ? 'high' : 'moderate'}`} key={key}><strong>{label}</strong><span>{check.score}%</span><meter min="0" max="100" value={check.score}>{check.score}%</meter><small>{score === null ? 'This check alone is not enough for an overall score.' : `${check.contribution}% of the overall photo score`}</small></div>
          : <div className="photo-score-check unavailable" key={key}><strong>{label}</strong><span>Cannot compare</span></div>;
      })}
      {partial && <p className="photo-score-caution">{checks.length} of 3 photo checks were possible. {score === null ? 'At least two clear photo checks are needed for an overall score.' : 'The score uses the available checks only. Scores based on different checks may not be directly comparable.'}</p>}
      <small>Lighting, camera angle and the background can change the score.</small>
    </div>;
}
