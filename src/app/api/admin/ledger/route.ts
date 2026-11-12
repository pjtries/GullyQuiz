import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PILOT_SHOPS } from "@/lib/pilotShops";
import { getInMemoryMatchesList } from "@/lib/inMemoryStore";
import { verifyAdminSecret } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!verifyAdminSecret(request)) {
    return NextResponse.json(
      { error: "Unauthorized. Valid ADMIN_SECRET required." },
      { status: 401 }
    );
  }

  let matches: any[] = [];
  let source = "IN_MEMORY";

  try {
    const dbMatches = await prisma.match.findMany({
      take: 50,
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
            player: {
              select: { displayName: true, phone: true, upiId: true },
            },
          },
        },
      },
    });

    if (dbMatches) {
      matches = dbMatches;
      source = "DATABASE";
    }
  } catch (err) {
    console.warn("GET /api/admin/ledger DB fallback:", err);
    const memMatches = getInMemoryMatchesList();
    matches = memMatches.map((m) => ({
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
  }

  // Compute financial ledger aggregates across settled matches
  const settledMatches = matches.filter((m) => m.status === "COMPLETED_SETTLED");
  const cancelledMatches = matches.filter((m) => m.status === "CANCELLED_REFUNDED");
  const activeMatches = matches.filter(
    (m) => m.status === "LOBBY_OPEN" || m.status === "IN_PROGRESS"
  );

  const totalGrossPotPaise = settledMatches.reduce(
    (sum, m) => sum + (m.totalPotPaise || 0),
    0
  );
  const totalWinnerPrizesPaise = settledMatches.reduce(
    (sum, m) => sum + (m.prizePoolPaise || 0),
    0
  );
  const totalVendorCommissionPaise = settledMatches.reduce(
    (sum, m) => sum + (m.vendorSharePaise || 0),
    0
  );
  const totalPlatformRevenuePaise = settledMatches.reduce(
    (sum, m) => sum + (m.platformSharePaise || 0),
    0
  );

  let totalUnsettledVendorPaise = PILOT_SHOPS.reduce(
    (sum, s) => sum + (s.unsettledBalancePaise || 0),
    0
  );

  if (source === "DATABASE") {
    try {
      const shopAgg = await prisma.shop.aggregate({
        _sum: { unsettledBalancePaise: true },
      });
      totalUnsettledVendorPaise = shopAgg._sum.unsettledBalancePaise || 0;
    } catch {
      // keep fallback
    }
  }

  return NextResponse.json({
    summary: {
      totalMatchesCount: matches.length,
      completedMatchesCount: settledMatches.length,
      cancelledRefundedCount: cancelledMatches.length,
      activeLobbiesCount: activeMatches.length,
      totalGrossPotPaise,
      totalWinnerPrizesPaise,
      totalVendorCommissionPaise,
      totalPlatformRevenuePaise,
      totalUnsettledVendorPaise,
    },
    matches,
    source,
  });
}
