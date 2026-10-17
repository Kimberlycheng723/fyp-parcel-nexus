import { expireCollectionVerifications } from "./collectionVerification.service.js";

let timer;
let running = false;
export function startCollectionVerificationScheduler() {
  if (timer) return;
  const sweep = async () => {
    if (running) return;
    running = true;
    try { await expireCollectionVerifications(); }
    catch { console.error("Collection verification expiry sweep failed; it will retry."); }
    finally { running = false; }
  };
  void sweep();
  timer = setInterval(sweep, 60000);
  timer.unref?.();
}
