import { NextResponse } from "next/server";
import { verifyAdminSecret } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!verifyAdminSecret(request, body)) {
    return NextResponse.json(
      { authenticated: false, error: "Invalid ADMIN_SECRET." },
      { status: 401 }
    );
  }

  return NextResponse.json({
    authenticated: true,
    timestamp: new Date().toISOString(),
  });
}
