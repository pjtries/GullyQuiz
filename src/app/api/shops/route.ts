import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";
import { PILOT_SHOPS, getPilotShopFallback } from "../../../lib/pilotShops";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const shopCode = searchParams.get("shopCode");

    if (shopCode) {
      const cleanCode = shopCode.trim().toUpperCase();
      try {
        const shop = await prisma.shop.findUnique({
          where: { shopCode: cleanCode },
          select: {
            id: true,
            shopCode: true,
            name: true,
            ownerName: true,
            ownerPhone: true,
            ownerUpiId: true,
            currentPin: true,
            pinExpiresAt: true,
            unsettledBalancePaise: true,
            isActive: true,
          },
        });

        if (shop) {
          return NextResponse.json({ shop });
        }
      } catch (dbErr) {
        console.warn("DB query failed in /api/shops, checking pilot fallback:", dbErr);
      }

      const fallbackShop = getPilotShopFallback(cleanCode);
      if (fallbackShop) {
        return NextResponse.json({ shop: fallbackShop });
      }

      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    try {
      const shops = await prisma.shop.findMany({
        where: { isActive: true },
        orderBy: { shopCode: "asc" },
        select: {
          id: true,
          shopCode: true,
          name: true,
          ownerName: true,
          currentPin: true,
          pinExpiresAt: true,
          unsettledBalancePaise: true,
          isActive: true,
        },
      });

      if (shops && shops.length > 0) {
        return NextResponse.json({ shops });
      }
    } catch (dbErr) {
      console.warn("DB query failed for shops list, returning pilot shops:", dbErr);
    }

    return NextResponse.json({ shops: PILOT_SHOPS });
  } catch (error) {
    console.error("GET /api/shops error:", error);
    return NextResponse.json({ shops: PILOT_SHOPS });
  }
}
