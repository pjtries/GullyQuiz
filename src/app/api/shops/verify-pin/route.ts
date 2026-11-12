import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getPilotShopFallback } from "@/lib/pilotShops";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { shopCode, pin } = body;

    if (!shopCode || !pin) {
      return NextResponse.json(
        { valid: false, error: "Both shopCode and 4-digit PIN are required." },
        { status: 400 }
      );
    }

    const cleanShopCode = String(shopCode).trim().toUpperCase();
    const cleanPin = String(pin).trim();

    if (cleanPin.length !== 4) {
      return NextResponse.json(
        { valid: false, error: "PIN must be exactly 4 digits." },
        { status: 400 }
      );
    }

    let shop: {
      id: string;
      shopCode: string;
      name: string;
      ownerName: string;
      currentPin: string;
      pinExpiresAt: Date | string;
      isActive: boolean;
    } | null = null;

    try {
      shop = await prisma.shop.findUnique({
        where: { shopCode: cleanShopCode },
      });
    } catch (dbErr) {
      console.warn("DB connection unavailable for verify-pin, using pilot shop fallback:", dbErr);
      shop = getPilotShopFallback(cleanShopCode);
    }

    if (!shop || !shop.isActive) {
      return NextResponse.json(
        {
          valid: false,
          error: `Stall '${cleanShopCode}' not found or inactive. Scan a valid QR code.`,
        },
        { status: 404 }
      );
    }

    // Compare 4-digit PIN
    if (shop.currentPin !== cleanPin) {
      return NextResponse.json(
        {
          valid: false,
          error: "Incorrect 4-digit PIN. Please check the code displayed on the counter standee.",
        },
        { status: 400 }
      );
    }

    // Check expiry
    const expiryDate = new Date(shop.pinExpiresAt);
    if (new Date() > expiryDate) {
      return NextResponse.json(
        {
          valid: false,
          error: "This stall PIN has expired. Please ask the shopkeeper to refresh their daily PIN.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      valid: true,
      shop: {
        id: shop.id,
        shopCode: shop.shopCode,
        name: shop.name,
        ownerName: shop.ownerName,
      },
    });
  } catch (error) {
    console.error("POST /api/shops/verify-pin error:", error);
    return NextResponse.json(
      { valid: false, error: "Internal server error while verifying PIN." },
      { status: 500 }
    );
  }
}
