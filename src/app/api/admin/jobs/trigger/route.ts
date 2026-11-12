import { NextResponse } from "next/server";
import { executeRotatePinsJob } from "@/server/jobs/rotatePins";
import { executeWeeklyVendorSettlementJob } from "@/server/jobs/settleVendors";
import { getNotificationService } from "@/server/services/notificationService";

export const dynamic = "force-dynamic";

function checkAdminAuth(request: Request, body?: any): boolean {
  const configuredSecret = process.env.ADMIN_SECRET || "gullyquiz_dev_secret_2026";

  const headerSecret = request.headers.get("x-admin-secret");
  const authHeader = request.headers.get("authorization");
  const bearerSecret = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const bodySecret = body?.adminSecret;

  const provided = headerSecret || bearerSecret || bodySecret;
  return Boolean(provided && provided === configuredSecret);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    // Verify ADMIN_SECRET protection
    if (!checkAdminAuth(request, body)) {
      return NextResponse.json(
        {
          error: "Unauthorized. Please provide valid ADMIN_SECRET via 'x-admin-secret' header or 'adminSecret' body field.",
        },
        { status: 401 }
      );
    }

    const job = body?.job || "rotate-pins";
    const notificationService = getNotificationService();

    let rotatePinsResult = null;
    let settleVendorsResult = null;

    if (job === "rotate-pins" || job === "both") {
      rotatePinsResult = await executeRotatePinsJob();
    }

    if (job === "settle-vendors" || job === "both") {
      settleVendorsResult = await executeWeeklyVendorSettlementJob();
    }

    if (!rotatePinsResult && !settleVendorsResult) {
      return NextResponse.json(
        {
          error: "Invalid job specified. Supported jobs: 'rotate-pins', 'settle-vendors', 'both'.",
        },
        { status: 400 }
      );
    }

    const recentNotifications = notificationService.getRecentNotifications().slice(0, 10);

    return NextResponse.json({
      success: true,
      jobTriggered: job,
      timestamp: new Date().toISOString(),
      rotatePins: rotatePinsResult,
      settleVendors: settleVendorsResult,
      recentNotificationsDispatched: recentNotifications,
    });
  } catch (error: any) {
    console.error("POST /api/admin/jobs/trigger error:", error);
    return NextResponse.json(
      { error: "Failed to execute manual cron job trigger.", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    if (!checkAdminAuth(request)) {
      return NextResponse.json(
        { error: "Unauthorized. Provide 'x-admin-secret' header." },
        { status: 401 }
      );
    }

    const notificationService = getNotificationService();
    const recentNotifications = notificationService.getRecentNotifications();

    return NextResponse.json({
      status: "Scheduler Operational",
      cronSchedules: {
        rotatePins: "0 * * * * (Every hour on the hour, Asia/Kolkata)",
        settleVendors: "0 21 * * 0 (Every Sunday at 21:00 IST, Asia/Kolkata)",
      },
      recentNotifications,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
