export function photoSearchProgress(search) {
  const remaining = search.pending > 0 ? `${search.pending} ${search.pending === 1 ? 'photo' : 'photos'} left in this group` : '';
  if (search.phase === 'RUNNING') {
    return { label: search.stage === 'DISCOVERING' ? 'Finding photos...' : 'Comparing photos...', remaining: search.stage === 'DISCOVERING' ? '' : remaining };
  }
  if (search.phase === 'CANCELLING') return { label: 'Stopping search...', remaining };
  if (search.phase === 'PAUSED') return { label: 'Search paused', remaining };
  return null;
}
