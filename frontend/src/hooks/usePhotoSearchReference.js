import { useEffect, useRef, useState } from 'react';
import { getParcelTracePhoto } from '../services/api.js';
import { decodePhoto } from '../utils/photoPreprocessing.js';

const empty = { photo: null, phase: 'LOADING', error: '', blocked: false };
export function usePhotoSearchReference({ parcelId, disputeId, available, role }) {
  const [state, setState] = useState(empty), [retry, setRetry] = useState(0);
  const [uploadError, setUploadError] = useState(''), [validating, setValidating] = useState(false), [url, setUrl] = useState('');
  const generation = useRef(0);
  useEffect(() => {
    const controller = new AbortController(), version = ++generation.current;
    setUploadError(''); setValidating(false);
    if (!['ADMIN', 'GUARD'].includes(role) || available === false) {
      setState({ ...empty, phase: 'MISSING' });
    } else {
      setState(empty);
      async function load() {
        const { blob } = await getParcelTracePhoto(parcelId, null, { dispute_id: disputeId }, { signal: controller.signal });
        const decoded = await decodePhoto(blob); decoded.close();
        if (!controller.signal.aborted && generation.current === version) setState({ ...empty, phase: 'READY', photo: { blob, source: 'REGISTRATION', name: 'Registration photo' } });
      }
      load().catch((failure) => {
        if (!controller.signal.aborted && generation.current === version) setState({ ...empty,
          phase: failure.status === 404 ? 'MISSING' : 'ERROR', error: failure.status === 404 ? '' : 'Registration photo could not be loaded.', blocked: [401, 403].includes(failure.status) });
      });
    }
    return () => { controller.abort(); generation.current++; };
  }, [parcelId, disputeId, available, role, retry]);
  useEffect(() => {
    if (!state.photo) { setUrl(''); return; }
    const next = URL.createObjectURL(state.photo.blob); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [state.photo]);
  async function upload(file) {
    if (!file || !['ADMIN', 'GUARD'].includes(role) || state.blocked || validating || state.phase === 'LOADING') return false;
    setUploadError('');
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setUploadError('Choose a JPG, PNG, or WebP image.'); return false; }
    if (!file.size || file.size > 20 * 1024 * 1024) { setUploadError('Choose a non-empty image no larger than 20 MB.'); return false; }
    const version = ++generation.current; setValidating(true);
    try {
      const decoded = await decodePhoto(file); decoded.close();
      if (generation.current !== version) return false;
      setState({ ...empty, phase: 'READY', photo: { blob: file, source: 'UPLOAD', name: file.name } });
      return true;
    } catch { if (generation.current === version) setUploadError('This image could not be opened. Choose a smaller, valid JPG, PNG, or WebP photo.'); return false; }
    finally { if (generation.current === version) setValidating(false); }
  }
  return { ...state, url, uploadError, validating, upload, reload: () => setRetry((value) => value + 1) };
}
