import {
  createOverdueNotification,
  findOverdueNotificationCandidates
} from "./notification.service.js";

const OVERDUE_SWEEP_INTERVAL_MS = 60 * 1000;
let schedulerTimer = null;
let sweepInProgress = false;

export async function runOverdueNotificationSweep() {
  if (sweepInProgress) {
    return {
      skipped: true,
      reason: "SWEEP_ALREADY_RUNNING"
    };
  }

  sweepInProgress = true;

  try {
    const candidates = await findOverdueNotificationCandidates();
    let createdCount = 0;

    for (const candidate of candidates) {
      const result = await createOverdueNotification(candidate);

      if (result.created) {
        createdCount += 1;
      }
    }

    return {
      skipped: false,
      checked_count: candidates.length,
      created_count: createdCount
    };
  } finally {
    sweepInProgress = false;
  }
}

async function executeScheduledSweep() {
  try {
    await runOverdueNotificationSweep();
  } catch (error) {
    console.error("Overdue notification sweep failed. It will be retried automatically.");
  }
}

export function startNotificationScheduler() {
  if (schedulerTimer) {
    return () => {};
  }

  void executeScheduledSweep();
  schedulerTimer = setInterval(executeScheduledSweep, OVERDUE_SWEEP_INTERVAL_MS);
  schedulerTimer.unref?.();

  return () => {
    if (schedulerTimer) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
  };
}
