import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getPaymentService } from "@/server/services/paymentService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { orderId, paymentId, signature, shopCode, phone, displayName, upiId } = body;

    if (!orderId || !shopCode || !phone) {
      return NextResponse.json(
        { error: "orderId, shopCode, and phone are required for verification." },
        { status: 400 }
      );
    }

    const cleanShopCode = String(shopCode).trim().toUpperCase();
    const cleanPhone = String(phone).trim();
    const cleanPaymentId = paymentId ? String(paymentId).trim() : `pay_mock_${Date.now()}`;

    // 1. Verify via Payment Abstraction
    const paymentService = getPaymentService();
    const verifyResult = await paymentService.verifyPayment({
      orderId: String(orderId),
      paymentId: cleanPaymentId,
      signature: signature ? String(signature) : undefined,
    });

    if (!verifyResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: verifyResult.error || "Payment signature or verification failed.",
        },
        { status: 400 }
      );
    }

    // 2. Persist PAID status in Database (if available)
    let matchId = `match_${cleanShopCode}_${Date.now()}`;
    let playerId = `player_${cleanPhone.replace(/\D/g, "")}`;

    try {
      const shop = await prisma.shop.findUnique({
        where: { shopCode: cleanShopCode },
      });

      if (shop) {
        // Find or create Player
        const player = await prisma.player.upsert({
          where: { phone: cleanPhone },
          update: {
            displayName: displayName || undefined,
            upiId: upiId || undefined,
          },
          create: {
            phone: cleanPhone,
            displayName: displayName || "GullyRider",
            upiId: upiId || null,
          },
        });
        playerId = player.id;

        // Find or create active match for this shop
        let activeMatch = await prisma.match.findFirst({
          where: {
            shopId: shop.id,
            status: "LOBBY_OPEN",
          },
          orderBy: { createdAt: "desc" },
        });

        if (!activeMatch) {
          activeMatch = await prisma.match.create({
            data: {
              shopId: shop.id,
              status: "LOBBY_OPEN",
              entryFeePaise: 1000,
            },
          });
        }
        matchId = activeMatch.id;

        // Upsert participant with PAID status & orderId
        await prisma.matchParticipant.upsert({
          where: {
            matchId_playerId: {
              matchId,
              playerId,
            },
          },
          update: {
            paymentStatus: "PAID",
            paymentOrderId: String(orderId),
          },
          create: {
            matchId,
            playerId,
            paymentStatus: "PAID",
            paymentOrderId: String(orderId),
          },
        });
      }
    } catch (dbErr) {
      console.warn("DB record creation skipped in /api/payments/verify, continuing:", dbErr);
    }

    return NextResponse.json({
      success: true,
      orderId: verifyResult.orderId,
      paymentId: verifyResult.paymentId,
      amountPaise: 1000,
      matchId,
      playerId,
      shopCode: cleanShopCode,
      phone: cleanPhone,
    });
  } catch (error) {
    console.error("POST /api/payments/verify error:", error);
    return NextResponse.json(
      { error: "Internal error verifying ₹10 payment." },
      { status: 500 }
    );
  }
}
