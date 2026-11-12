import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";
import { getInMemoryMatchesList } from "../../../lib/inMemoryStore";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const shopCode = searchParams.get("shopCode")?.trim().toUpperCase();
  const limitParam = parseInt(searchParams.get("limit") || "25", 10);
  const limit = Number.isNaN(limitParam) ? 25 : Math.min(100, Math.max(1, limitParam));

  try {
    const dbMatches = await prisma.match.findMany({
      where: shopCode ? { shop: { shopCode } } : undefined,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        shop: {
          select: { shopCode: true, name: true },
        },
        winner: {
          select: { displayName: true, phone: true, upiId: true },
        },
        participants: {
          orderBy: [{ score: "desc" }, { cumulativeResponseMs: "asc" }],
          select: {
            playerId: true,
            score: true,
            cumulativeResponseMs: true,
            paymentStatus: true,
            paymentOrderId: true,
            player: { select: { displayName: true, phone: true, upiId: true } },
          },
        },
      },
    });

    return NextResponse.json({ matches: dbMatches, source: "DATABASE" });
  } catch (error) {
    // Fallback to in-memory ledger
    const allMem = getInMemoryMatchesList();
    const filtered = shopCode ? allMem.filter((m) => m.shopCode === shopCode) : allMem;
    const formatted = filtered.slice(0, limit).map((m) => ({
      id: m.id,
      shopId: m.shopId,
      status: m.status,
      entryFeePaise: m.entryFeePaise,
      totalPotPaise: m.totalPotPaise,
      prizePoolPaise: m.prizePoolPaise,
      vendorSharePaise: m.vendorSharePaise,
      platformSharePaise: m.platformSharePaise,
      winnerPlayerId: m.winnerPlayerId,
      payoutReferenceId: m.payoutReferenceId,
      lobbyClosesAt: m.lobbyClosesAt,
      startedAt: m.startedAt,
      endedAt: m.endedAt,
      createdAt: m.createdAt,
      shop: {
        shopCode: m.shopCode,
        name: m.shopName,
      },
      winner: m.winnerDisplayName
        ? {
            displayName: m.winnerDisplayName,
            phone: m.winnerPhone,
            upiId: m.winnerUpiId,
          }
        : null,
      participants: m.participants.map((p) => ({
        playerId: p.playerId,
        score: p.score,
        cumulativeResponseMs: p.cumulativeResponseMs,
        paymentStatus: p.paymentStatus,
        paymentOrderId: p.paymentOrderId,
        player: {
          displayName: p.displayName,
          phone: p.phone,
          upiId: p.upiId,
        },
      })),
    }));

    return NextResponse.json({ matches: formatted, source: "IN_MEMORY" });
  }
}
