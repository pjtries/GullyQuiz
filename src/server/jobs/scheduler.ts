import cron from "node-cron";
import { executeRotatePinsJob } from "./rotatePins";
import { executeWeeklyVendorSettlementJob } from "./settleVendors";

let isSchedulerInitialized = false;

export function initBackgroundSchedulers() {
  if (isSchedulerInitialized) {
    return;
  }

  isSchedulerInitialized = true;
  console.log("[Scheduler] ⏰ Initializing GullyQuiz background schedulers...");

  // 1. Hourly Shop PIN Rotation: Every hour on the hour (0 * * * *)
  cron.schedule(
    "0 * * * *",
    async () => {
      console.log("[Scheduler] 🔄 Triggering hourly PIN rotation cron...");
      try {
        await executeRotatePinsJob();
      } catch (err) {
        console.error("[Scheduler] Error in hourly PIN rotation cron:", err);
      }
    },
    {
      timezone: "Asia/Kolkata",
    }
  );
  console.log("  ✓ Hourly PIN rotation scheduled: '0 * * * *' (Asia/Kolkata)");

  // 2. Weekly Sunday Vendor Settlement: Every Sunday at 21:00 IST (0 21 * * 0)
  cron.schedule(
    "0 21 * * 0",
    async () => {
      console.log("[Scheduler] 💰 Triggering weekly Sunday vendor settlement cron...");
      try {
        await executeWeeklyVendorSettlementJob();
      } catch (err) {
        console.error("[Scheduler] Error in weekly vendor settlement cron:", err);
      }
    },
    {
      timezone: "Asia/Kolkata",
    }
  );
  console.log("  ✓ Weekly Sunday vendor settlement scheduled: '0 21 * * 0' (21:00 IST)");
}
