import { useEffect, useRef, useState } from "react";
import { getActiveCollectionVerifications, getCollectionVerification } from "../services/api.js";
import { acquireRealtimeSocket, releaseRealtimeSocket } from "../services/socket.js";
import { getVerificationReference, saveVerificationReference } from "../utils/collectionSession.js";
import { ACTIVE_VERIFICATION, remainingSeconds, verificationError } from "../utils/collectionVerification.js";

export function useCollectionVerification(residentId, collection) {
  const [verification, setVerification] = useState(null);
  const [checking, setChecking] = useState(true);
  const [waitingExpired, setWaitingExpired] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const coordinator = useRef(null);

  useEffect(() => {
    const state = { disposed: false, running: false, pending: false, mutating: false, timer: null, controller: null,
      sessionId: getVerificationReference(residentId, collection?.collection_id)?.session_id, session: null, stopped: false };
    coordinator.current = state;
    setVerification(null); setChecking(true); setWaitingExpired(false); setUnavailable(false); setSyncError("");

    function accept(session) {
      if (state.disposed) return;
      state.session = session;
      state.sessionId = session.session_id;
      state.stopped = session.status !== ACTIVE_VERIFICATION;
      saveVerificationReference(session, residentId);
      setVerification(session);
      setWaitingExpired(false); setSyncError(""); setUnavailable(false);
    }

    function schedule() {
      window.clearTimeout(state.timer);
      if (!state.disposed && !state.stopped && !state.mutating && document.visibilityState !== "hidden") {
        state.timer = window.setTimeout(() => void refresh(), 3000);
      }
    }

    async function refresh() {
      if (state.disposed || state.stopped || document.visibilityState === "hidden") return;
      if (state.running || state.mutating) { state.pending = true; return; }
      state.running = true;
      state.pending = false;
      state.controller = new AbortController();
      try {
        const options = { signal: state.controller.signal };
        const requestedSessionId = state.sessionId;
        let session;
        if (requestedSessionId) session = (await getCollectionVerification(requestedSessionId, options)).verification_session;
        else if (state.sessionId !== requestedSessionId) state.pending = true;
        else {
          const { verification_sessions: sessions = [] } = await getActiveCollectionVerifications(options);
          session = collection?.collection_id ? sessions.find((item) => item.collection_id === collection.collection_id) : sessions[0];
        }
        if (state.disposed || state.mutating || state.controller.signal.aborted) return;
        if (session) accept(session);
        else {
          // An expired QR is not final until authorized session discovery has succeeded.
          const expired = Boolean(collection) && remainingSeconds(collection.expires_at) === 0;
          setWaitingExpired(expired);
          state.stopped = expired || !collection;
          setSyncError("");
        }
      } catch (error) {
        if (!state.disposed && error.name !== "AbortError") {
          setSyncError(verificationError(error));
          if ([401, 403, 404].includes(error.status)) { state.stopped = true; setUnavailable(true); }
        }
      } finally {
        state.running = false;
        if (!state.disposed) {
          setChecking(false);
          if (state.pending && !state.mutating) { state.pending = false; void refresh(); }
          else schedule();
        }
      }
    }

    state.accept = accept;
    state.refresh = refresh;
    state.schedule = schedule;
    function onVisible() { if (document.visibilityState === "hidden") window.clearTimeout(state.timer); else void refresh(); }
    function onRealtime(payload) {
      if (collection?.collection_id && payload?.collection_id !== collection.collection_id) return;
      if (state.sessionId && payload?.session_id !== state.sessionId) return;
      // Events trigger an authorized read, never client-side completion or fabricated progress.
      if (payload?.session_id) state.sessionId = payload.session_id;
      void refresh();
    }
    const socket = acquireRealtimeSocket();
    socket.on("collection:verification-started", onRealtime);
    socket.on("collection:completed", onRealtime);
    socket.on("connect", refresh);
    document.addEventListener("visibilitychange", onVisible);
    void refresh();
    return () => {
      state.disposed = true;
      window.clearTimeout(state.timer); state.controller?.abort();
      socket.off("collection:verification-started", onRealtime);
      socket.off("collection:completed", onRealtime);
      socket.off("connect", refresh);
      releaseRealtimeSocket(); document.removeEventListener("visibilitychange", onVisible);
    };
  }, [residentId, collection?.collection_id]);

  async function mutate(operation) {
    const state = coordinator.current;
    if (!state || state.disposed || state.mutating || !state.sessionId) return null;
    state.mutating = true;
    window.clearTimeout(state.timer);
    state.controller?.abort();
    setBusy(true);
    try {
      const response = await operation(state.sessionId);
      if (response?.verification_session) state.accept(response.verification_session);
      return response;
    } finally {
      state.mutating = false;
      if (!state.disposed) { setBusy(false); void state.refresh(); }
    }
  }

  return { verification, checking, waitingExpired, syncError, unavailable, busy, mutate,
    refresh: () => { const state = coordinator.current; if (state) { state.stopped = false; return state.refresh(); } } };
}
