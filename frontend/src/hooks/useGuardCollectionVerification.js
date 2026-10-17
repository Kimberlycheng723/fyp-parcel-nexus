import { useEffect, useRef, useState } from "react";
import { getCollectionVerification } from "../services/api.js";
import { ACTIVE_VERIFICATION } from "../utils/collectionVerification.js";
import { clearGuardVerificationReference, getGuardVerificationReference, guardCollectionError,
  readGuardVerification, saveGuardVerificationReference } from "../utils/guardCollectionVerification.js";

export function useGuardCollectionVerification(guardId) {
  const [sessionId, setSessionId] = useState(() => getGuardVerificationReference(guardId));
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(Boolean(sessionId));
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const refreshRef = useRef(null);

  useEffect(() => {
    if (!sessionId) { setChecking(false); return; }
    let disposed = false, running = false, stopped = false, timer, controller;
    setUnavailable(false); setError("");
    async function refresh({ retry = false } = {}) {
      if (disposed || running || (stopped && !retry) || document.visibilityState === "hidden") return;
      window.clearTimeout(timer);
      running = true;
      controller = new AbortController();
      try {
        const response = await getCollectionVerification(sessionId, { signal: controller.signal });
        if (disposed) return;
        const current = readGuardVerification(response, guardId);
        setSession(current); setError(""); setUnavailable(false);
        stopped = current.status !== ACTIVE_VERIFICATION;
      } catch (requestError) {
        if (!disposed && requestError.name !== "AbortError") {
          setError(guardCollectionError(requestError));
          if ([400, 401, 403, 404].includes(requestError.status)) { stopped = true; setUnavailable(true); setSession(null); }
        }
      } finally {
        running = false;
        if (!disposed) {
          setChecking(false);
          if (!stopped && document.visibilityState !== "hidden") timer = window.setTimeout(() => void refresh(), 3000);
        }
      }
    }
    function onVisible() { if (document.visibilityState === "hidden") window.clearTimeout(timer); else void refresh(); }
    refreshRef.current = () => refresh({ retry: true });
    void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true; window.clearTimeout(timer); controller?.abort(); refreshRef.current = null;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [guardId, sessionId]);

  function watch(response) {
    const current = readGuardVerification(response, guardId);
    saveGuardVerificationReference(current, guardId);
    setSession(current); setSessionId(current.session_id); setChecking(false); setError(""); setUnavailable(false);
  }

  function reset() {
    clearGuardVerificationReference(); setSessionId(null); setSession(null); setChecking(false); setError(""); setUnavailable(false);
  }

  return { sessionId, session, checking, error, unavailable, watch, reset, refresh: () => refreshRef.current?.() };
}
