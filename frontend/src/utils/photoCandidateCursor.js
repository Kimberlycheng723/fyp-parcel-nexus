// Metadata is streamed through bounded pages. No image bytes enter this cursor.
export class PhotoCandidateCursor {
  constructor(read, parcelId, filters) {
    this.read = read; this.parcelId = parcelId; this.filters = { ...filters };
    this.page = 1; this.collections = []; this.current = null; this.evidence = [];
    this.evidencePage = 1; this.pages = null; this.evidencePages = 0; this.done = false;
    this.pending = []; this.seen = new Set(); this.recordsTotal = null; this.recordsVisited = 0;
    this.discovered = 0; this.skipped = 0; this.noEvidence = 0;
    this.source = filters.photo_source || 'COLLECTION';
    this.registration = this.source === 'REGISTRATION'; this.registrationPhotos = []; this.registrationPage = 1; this.registrationPages = null; this.collectionTotal = 0;
  }
  async nextPhoto(signal) {
    while (!signal.aborted) {
      if (this.registration) {
        if (this.registrationPhotos.length) {
          const item = this.registrationPhotos.shift(), key = `REGISTRATION:${item.evidence.evidence_id}`;
          if (this.seen.has(key)) continue;
          this.seen.add(key); this.recordsVisited++;
          if (!item.evidence.photo_present) { this.skipped++; continue; }
          this.discovered++; return item;
        }
        if (this.registrationPages !== null && this.registrationPage > this.registrationPages) { this.done = true; return null; }
        const data = await this.read(`parcels/${this.parcelId}/registration-photos`, { ...this.filters, page: this.registrationPage, limit: 20 }, { signal });
        this.registrationPhotos = data.photos; this.registrationPages = data.pagination.total_pages; this.registrationPage++;
        this.recordsTotal = this.collectionTotal + data.pagination.total; continue;
      }
      if (this.evidence.length) {
        const evidence = this.evidence.shift();
        const key = `COLLECTION:${evidence.evidence_id}`;
        if (this.seen.has(key)) continue;
        this.seen.add(key);
        if (!evidence.photo_present) { this.skipped++; continue; }
        this.discovered++;
        return { ...this.current, photo_source: 'COLLECTION', evidence: { ...evidence, photo_source: 'COLLECTION' } };
      }
      if (this.current && this.evidencePage <= this.evidencePages) {
        const data = await this.read(`parcels/${this.parcelId}/collections/${this.current.collection_id}/evidence`, { ...this.filters, page: this.evidencePage, limit: 20 }, { signal });
        this.evidence = data.evidence; this.evidencePages = data.pagination.total_pages; this.evidencePage++; continue;
      }
      this.current = null;
      if (this.collections.length) {
        this.current = this.collections.shift(); this.recordsVisited++;
        this.evidence = this.current.evidence_count <= this.current.evidence.length ? [...this.current.evidence] : [];
        this.evidencePage = 1; this.evidencePages = this.current.evidence_count > this.current.evidence.length ? 1 : 0;
        if (!this.current.evidence_count) this.noEvidence++;
        continue;
      }
      if (this.pages !== null && this.page > this.pages) {
        if (this.source === 'ALL') { this.registration = true; continue; }
        this.done = true; return null;
      }
      const data = await this.read(`parcels/${this.parcelId}/collections`, { ...this.filters, page: this.page, limit: 20 }, { signal });
      this.collectionTotal = data.pagination.total; this.recordsTotal = this.collectionTotal; this.pages = data.pagination.total_pages; this.page++; this.collections = data.collections;
    }
    throw new DOMException('Cancelled', 'AbortError');
  }
  async fillBatch(size, signal) {
    while (this.pending.length < size && !this.done) {
      if (this.discovered >= 500) break;
      const item = await this.nextPhoto(signal); if (item) this.pending.push(item);
    }
  }
}
