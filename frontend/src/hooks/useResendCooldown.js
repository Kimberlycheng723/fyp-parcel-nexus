import { useEffect, useState } from "react";

export function useResendCooldown(durationSeconds = 60) {
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  useEffect(() => {
    if (secondsRemaining <= 0) {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      setSecondsRemaining((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => window.clearTimeout(timerId);
  }, [secondsRemaining]);

  return {
    secondsRemaining,
    isCoolingDown: secondsRemaining > 0,
    startCooldown: () => setSecondsRemaining(durationSeconds),
    resetCooldown: () => setSecondsRemaining(0)
  };
}
