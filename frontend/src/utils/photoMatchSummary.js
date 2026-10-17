import { visualSimilarity } from './visualSimilarity.js';

export function photoMatchSummary(result) {
  const unit = result.unit_reference || 'an unknown unit';
  const registration = result.evidence?.photo_source === 'REGISTRATION';
  const { score } = visualSimilarity(result);
  if (result.failed) return { title: 'Photo could not be compared', description: result.failure || 'Try another photo.', caption: `Photo recorded for ${unit}` };
  if (registration) return { title: `Registration photo for ${unit}`, description: 'Taken when a parcel was registered. This does not tell us who collected it or where it is now.', caption: `Registered to ${unit}` };
  if (result.verification_status !== 'COMPLETED') return { title: `Collection photo for ${unit}`, description: 'This collection was not confirmed.', caption: `Collection request for ${unit} · not confirmed` };
  return {
    title: score !== null && score >= 75 ? `Possible photo match for ${unit}` : `Collection photo recorded for ${unit}`,
    description: 'Collection was marked complete. Check the photos and tracking number before deciding whether this is the parcel you are tracing.',
    caption: `Collection record for ${unit}`
  };
}
