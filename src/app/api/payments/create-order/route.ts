import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getPilotShopFallback } from "@/lib/pilotShops";
import { getPaymentService } from "@/server/services/paymentService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { shopCode, pin, phone, displayName, upiId } = body;

    if (!shopCode || !pin || !phone) {
      return NextResponse.json(
        { error: "shopCode, pin, and phone are required." },
        { status: 400 }
      );
    }

    const cleanShopCode = String(shopCode).trim().toUpperCase();
    const cleanPin = String(pin).trim();
    const cleanPhone = String(phone).trim();
    const cleanDisplayName = String(displayName || "GullyRider").trim();
    const cleanUpiId = upiId ? String(upiId).trim() : null;

    // 1. Verify Shop & PIN
    let shop: {
      id: string;
      shopCode: string;
      name: string;
      currentPin: string;
      pinExpiresAt: Date | string;
      isActive: boolean;
    } | null = null;

    try {
      shop = await prisma.shop.findUnique({
        where: { shopCode: cleanShopCode },
      });
    } catch {
      shop = getPilotShopFallback(cleanShopCode);
    }

    if (!shop || !shop.isActive) {
      return NextResponse.json(
        { error: "Stall not found or inactive. Please scan a valid shop QR." },
        { status: 404 }
      );
    }

    if (shop.currentPin !== cleanPin) {
      return NextResponse.json(
        { error: "Invalid 4-digit PIN. Please enter the current PIN from the stall counter." },
        { status: 400 }
      );
    }

    if (new Date() > new Date(shop.pinExpiresAt)) {
      return NextResponse.json(
        { error: "Stall PIN expired. Ask the vendor for today's active PIN." },
        { status: 400 }
      );
    }

    // 2. Upsert Player profile
    let playerId = `player_${cleanPhone.replace(/\D/g, "")}`;
    try {
      const player = await prisma.player.upsert({
        where: { phone: cleanPhone },
        update: {
          displayName: cleanDisplayName,
          upiId: cleanUpiId,
        },
        create: {
          phone: cleanPhone,
          displayName: cleanDisplayName,
          upiId: cleanUpiId,
          totalMatches: 0,
          totalWinningsPaise: 0,
        },
      });
      playerId = player.id;
    } catch (dbErr) {
      console.warn("DB unavailable for player upsert, continuing with playerId:", dbErr);
    }

    // 3. Create ₹10 payment order via Payment Abstraction
    const paymentService = getPaymentService();
    const orderResult = await paymentService.createOrder({
      amountPaise: 1000, // ₹10.00
      currency: "INR",
      receipt: `${cleanShopCode}_${cleanPhone.slice(-4)}`,
      notes: {
        shopCode: cleanShopCode,
        phone: cleanPhone,
        playerId,
      },
      customerPhone: cleanPhone,
      customerName: cleanDisplayName,
    });

    return NextResponse.json({
      success: true,
      orderId: orderResult.orderId,
      amountPaise: orderResult.amountPaise,
      currency: orderResult.currency,
      upiIntentUrl: orderResult.upiIntentUrl,
      provider: orderResult.provider,
      keyId: orderResult.keyId,
      player: {
        id: playerId,
        phone: cleanPhone,
        displayName: cleanDisplayName,
        upiId: cleanUpiId,
      },
      shop: {
        shopCode: cleanShopCode,
        name: shop.name,
      },
    });
  } catch (error) {
    console.error("POST /api/payments/create-order error:", error);
    return NextResponse.json(
      { error: "Failed to initialize ₹10 payment order." },
      { status: 500 }
    );
  }
}
