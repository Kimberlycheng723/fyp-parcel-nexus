import { useEffect, useRef, useState } from 'react';
import { getParcelTrace } from '../services/api.js';
import { traceQuery } from '../utils/parcelTrace.js';

export function useParcelTraceRead(path, filters = {}, revision = 0) {
  const query = traceQuery(filters);
  const [retry, setRetry] = useState(0);
  const previousKey = useRef('');
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    const key = `${path}?${query}`;
    const unchanged = previousKey.current === key;
    previousKey.current = key;
    setState((current) => ({ data: unchanged ? current.data : null, loading: Boolean(path), error: '' }));
    if (path) getParcelTrace(path, Object.fromEntries(new URLSearchParams(query)), { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setState({ data, loading: false, error: '' }); })
      .catch((error) => { if (!controller.signal.aborted) setState((current) => ({
        data: [401, 403, 404].includes(error.status) ? null : current.data, loading: false, error: error.message
      })); });
    return () => controller.abort();
  }, [path, query, revision, retry]);
  return { ...state, retry: () => setRetry((current) => current + 1) };
}
