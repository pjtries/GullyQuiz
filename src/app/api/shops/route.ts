import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const shopCode = searchParams.get("shopCode");

    if (shopCode) {
      const shop = await prisma.shop.findUnique({
        where: { shopCode },
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

      if (!shop) {
        return NextResponse.json({ error: "Shop not found" }, { status: 404 });
      }

      return NextResponse.json({ shop });
    }

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

    return NextResponse.json({ shops });
  } catch (error) {
    console.error("GET /api/shops error:", error);
    return NextResponse.json({ error: "Failed to fetch shops" }, { status: 500 });
  }
}
