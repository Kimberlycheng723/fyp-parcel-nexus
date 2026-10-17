import { useEffect, useState } from 'react';

const readSearch = () => (new URLSearchParams(window.location.search).get('search') || '').slice(0, 120);

// Header searches can navigate to the page that is already mounted.
export function useSearchQuery({ setPage, setDateRange } = {}) {
  const [search, setSearch] = useState(readSearch);
  useEffect(() => {
    const syncSearch = () => {
      const params = new URLSearchParams(window.location.search);
      setSearch(readSearch()); setPage?.(1);
      if (params.has('search')) setDateRange?.('all');
    };
    window.addEventListener('popstate', syncSearch);
    return () => window.removeEventListener('popstate', syncSearch);
  }, [setPage, setDateRange]);
  return [search, setSearch];
}
