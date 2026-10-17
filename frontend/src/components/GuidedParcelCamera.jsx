import { Camera, Check, RefreshCw, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

function cameraMessage(error) {
  if (['NotAllowedError', 'SecurityError'].includes(error?.name)) return 'Camera permission was denied. Allow camera access or choose an existing photo.';
  if (['NotFoundError', 'DevicesNotFoundError'].includes(error?.name)) return 'No camera was found. Choose an existing photo instead.';
  if (['NotReadableError', 'TrackStartError'].includes(error?.name)) return 'The camera is busy. Close other camera apps and try again.';
  return 'The camera could not start. Try again or choose an existing photo.';
}

export function GuidedParcelCamera({ onClose, onUse, onUpload, maxBytes = 5 * 1024 * 1024 }) {
  const dialog = useRef(null), video = useRef(null), stream = useRef(null), mounted = useRef(false), capturing = useRef(false);
  const [phase, setPhase] = useState('STARTING'), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const [photo, setPhoto] = useState(null), [url, setUrl] = useState(''), [ratio, setRatio] = useState(4 / 3);
  function stop() { stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null; }
  useEffect(() => {
    mounted.current = true;
    const focus = document.activeElement;
    dialog.current.showModal();
    return () => { mounted.current = false; stop(); if (focus?.isConnected) focus.focus(); };
  }, []);
  useEffect(() => {
    if (!photo) { setUrl(''); return; }
    const next = URL.createObjectURL(photo); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [photo]);
  useEffect(() => {
    if (photo) return;
    let disposed = false, interrupted = false;
    const element = video.current;
    setPhase('STARTING'); setError('');
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera unavailable');
        const next = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } } });
        if (disposed || interrupted) { next.getTracks().forEach((track) => track.stop()); return; }
        stream.current = next; element.srcObject = next;
        await element.play();
        if (disposed || interrupted) return;
        if (element.videoWidth && element.videoHeight) { setRatio(element.videoWidth / element.videoHeight); setPhase('READY'); }
      } catch (failure) {
        if (!disposed && !interrupted) { stop(); setPhase('ERROR'); setError(cameraMessage(failure)); }
      }
    }
    function hidden() {
      if (document.visibilityState !== 'hidden') return;
      interrupted = true; stop(); setPhase('ERROR'); setError('Camera paused while this page was hidden. Try again when you are ready.');
    }
    void start(); document.addEventListener('visibilitychange', hidden);
    return () => { disposed = true; stop(); element?.pause(); if (element) element.srcObject = null; document.removeEventListener('visibilitychange', hidden); };
  }, [attempt, photo]);
  function ready() {
    const element = video.current;
    if (stream.current && element?.videoWidth && element.videoHeight) { setRatio(element.videoWidth / element.videoHeight); setPhase('READY'); }
  }
  function capture() {
    const element = video.current;
    if (capturing.current || phase !== 'READY' || !element?.videoWidth || !element.videoHeight) return;
    capturing.current = true; setPhase('CAPTURING'); setError('');
    const canvas = document.createElement('canvas');
    // Save the whole camera frame. Guides never become pixels in the evidence.
    canvas.width = element.videoWidth; canvas.height = element.videoHeight;
    try {
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Capture unavailable');
      context.drawImage(element, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        capturing.current = false;
        if (!mounted.current) return;
        if (!blob || blob.size > maxBytes) {
          setPhase(stream.current ? 'READY' : 'ERROR'); setError(blob ? 'This photo exceeds the upload limit. Choose a smaller photo instead.' : 'Photo capture failed. Please try again.'); return;
        }
        stop(); setPhoto(new File([blob], `parcel-photo-${Date.now()}.jpg`, { type: 'image/jpeg' })); setPhase('REVIEW');
      }, 'image/jpeg', .9);
    } catch { capturing.current = false; setPhase('READY'); setError('Photo capture failed. Please try again.'); }
  }
  function chooseUpload() { onClose(); onUpload?.(); }
  return <dialog ref={dialog} className="guided-parcel-camera" aria-labelledby="guided-camera-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header><h2 id="guided-camera-title">{photo ? 'Review parcel photo' : 'Capture parcel photo'}</h2><button type="button" aria-label="Close camera" onClick={onClose}><X size={20} /></button></header>
    <p className="guided-camera-instruction">{photo ? 'Check that the whole parcel and shipping label are clearly visible.' : 'Keep the whole parcel inside the frame, with the shipping label facing the camera.'}</p>
    <div className="guided-camera-stage" style={{ aspectRatio: ratio, width: `min(100%, ${58 * ratio}svh)` }}>
      {photo ? <img src={url} alt="Captured parcel photo" /> : <><video ref={video} muted playsInline autoPlay onLoadedData={ready} aria-label="Parcel camera preview" />
        {phase === 'READY' && <div className="guided-camera-frame" aria-hidden="true"><i /><i /><i /><i /></div>}
        {phase === 'STARTING' && <span className="guided-camera-status" role="status">Starting camera...</span>}
      </>}
    </div>
    {error && <p className="guided-camera-error" role="alert">{error}</p>}
    <footer>{photo ? <><button className="guided-camera-primary" type="button" onClick={() => onUse(photo)}><Check size={17} /> Use photo</button><button type="button" onClick={() => { setPhoto(null); setError(''); }}><RefreshCw size={17} /> Retake</button></>
      : phase === 'ERROR' ? <button type="button" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={17} /> Try again</button>
        : <button className="guided-camera-primary" type="button" disabled={phase !== 'READY'} onClick={capture}><Camera size={17} />{phase === 'CAPTURING' ? 'Capturing...' : 'Capture photo'}</button>}
      <button type="button" onClick={chooseUpload}><Upload size={17} /> Choose photo</button></footer>
  </dialog>;
}
