# Focused Parcel Trace

The staff-only Parcel Trace page now follows a tracking search, method choice, and focused evidence workflow. It reuses the existing authenticated, read-only trace APIs and the existing ZXing camera scanner. Only the selected method loads its evidence; changing methods disposes photo workers and temporary image URLs. Back/forward navigation and linked dispute query parameters remain supported.

The identity header replaces the old investigation overview. Parcel room, registered unit, status and timestamps remain under Parcel details. Validated linked disputes open existing Dispute Management. No investigation status, return request, notification or collection mutation is added.

Tracking checks present registration and recorded session units alongside the stored scan result. A scan or completed session alone is not treated as proof of handing this parcel to a different unit. The paginated scan table remains available under View scan records.

Image comparison opens directly to the search filters, automatically using the registration photo without an initial thumbnail or ready-state banner. A validated temporary reference upload remains available when the registration photo is unavailable. Batch searches use full images, without a manual crop or GrabCut control. The primary button becomes Cancel Search while running and Continue Search when more work remains. A compact loading indicator shows photos left in the current batch; completed searches show no completion banner. Clear Results is a small action beside the filter-section heading.

The highest visual-similarity candidate is selected after each batch unless staff explicitly select another result. The reference and selected photo appear together. The yellow lead banner's View details opens only the photo-score breakdown: the duplicated metadata grid, priority badge and text findings are removed. All three photo checks are listed, with Cannot compare for unavailable checks rather than a fabricated zero. Other possible matches show a larger photo, similarity percentage and Compare button only, ordered by descending visual similarity with unavailable scores last. Compare changes the main pair and its details. All analyzed candidates, including failures, remain reviewable through pagination. The redundant Browse recorded collections section and its separate filters/cards are removed; the same collection APIs still supply photo search candidates.

Visible copy uses everyday staff language: tracking text, small photo details,
photo colours and collection records. Algorithm names, feature counts and
processing terminology are not shown. The details still explain that a score
does not prove parcel identity, that missing checks are excluded, and that
lighting/background can change the result. Collection confirmation and possible
photo matches remain distinct. These wording changes do not change scores,
sorting, stored statuses, permissions or API contracts.

Photo discovery includes both registered-parcel uploads and collection evidence by default, with a Photo source selector. Collection status defaults to all recorded sessions and affects only collection candidates; it is disabled for registration-only searches. The same date window applies to both sources. Reference-parcel registration images are excluded from candidates to avoid trivial self-matches. No collection or barcode attempt is required for a registered upload to become a candidate. Unsaved uploads that are not linked to a finished parcel registration are not searched.

Registration candidate metadata and images use the staff-only read endpoints `GET /api/parcel-trace/parcels/:parcelId/registration-photos` and `GET /api/parcel-trace/parcels/:parcelId/registration-photos/:candidateId/photo`. Images validate the target/dispute relationship, date/unit window, candidate ID and generated local path. Responses remain private/no-store and never expose stored filenames in metadata. Existing collection APIs are unchanged; no schema migration is needed.

## Independent Evidence

The support-layer strong-evidence classification is separate from visual ranking and is not displayed in the simplified graph view. It requires a tracking scan attached to the candidate photo's own parcel evidence, exact OCR tracking text, or reliable geometric features together with at least 75% combined visual similarity. These are review heuristics, not calibrated identity decisions.

Tracking/OCR signals remain internal to photo analysis and do not raise the visual score. Collection-level `matching_attempt` remains useful for discovery but is not copied into every photo. Preview and expanded evidence responses supply per-evidence `matching_tracking_attempt`. Failed analysis is not promoted. Lead wording distinguishes registration, incomplete collection records and completed records; none establishes current physical location or a confirmed wrong-unit handover. Tracking-number review remains available in its dedicated tracing method. The selected photos retain their source/unit/time captions; duplicate metadata and signal badges are not shown in the graph details.

## Visual Ranking

The displayed percentage is an uncalibrated visual similarity heuristic, not an identity probability or collection outcome:

- Colour histogram distance: 30% nominal weight.
- Contour difference and aspect ratio: 25% nominal weight.
- RANSAC inlier proportion, discounted below 20 inliers: 45% nominal weight.

At least two valid checks are required. Missing checks are excluded and weights renormalized; partial coverage is labelled explicitly. Invalid metrics and failed results cannot produce a score. OCR, barcode, unit and session status do not enter the visual score. The details disclose available checks and weighting. Different coverage, image backgrounds, lighting and camera angles can limit comparisons. There are no fictional tape, handwriting or room-camera measurements.

All analyzed candidates, including inconclusive and failed results, remain accessible. Evidence files are neither modified nor uploaded by analysis; fallback reference uploads remain local and temporary.

## Verification

Use the frontend build and focused Node suites (`parcel-trace`, `photo-analysis`, `photo-analysis-opencv`, `visual-similarity`). Browser suites cover responsive trace flows and actual OCR/OpenCV workers with intercepted API/image fixtures. They do not test physical camera hardware, real-user collections or production photo accuracy.
