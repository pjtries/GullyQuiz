import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const shopCode = searchParams.get("shopCode");

    const matches = await prisma.match.findMany({
      where: shopCode ? { shop: { shopCode } } : undefined,
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        shop: {
          select: { shopCode: true, name: true },
        },
        winner: {
          select: { displayName: true, phone: true },
        },
        participants: {
          select: {
            score: true,
            cumulativeResponseMs: true,
            player: { select: { displayName: true } },
          },
        },
      },
    });

    return NextResponse.json({ matches });
  } catch (error) {
    console.error("GET /api/matches error:", error);
    return NextResponse.json({ error: "Failed to fetch matches" }, { status: 500 });
  }
}
