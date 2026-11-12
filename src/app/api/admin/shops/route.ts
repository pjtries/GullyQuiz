import crypto from "crypto";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PILOT_SHOPS, PilotShopData } from "@/lib/pilotShops";
import { verifyAdminSecret } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!verifyAdminSecret(request)) {
    return NextResponse.json(
      { error: "Unauthorized. Valid ADMIN_SECRET required." },
      { status: 401 }
    );
  }

  try {
    const dbShops = await prisma.shop.findMany({
      orderBy: { shopCode: "asc" },
    });

    if (dbShops && dbShops.length > 0) {
      return NextResponse.json({
        shops: dbShops,
        totalUnsettledBalancePaise: dbShops.reduce(
          (sum, s) => sum + (s.unsettledBalancePaise || 0),
          0
        ),
        source: "DATABASE",
      });
    }
  } catch (err) {
    console.warn("GET /api/admin/shops DB fallback:", err);
  }

  return NextResponse.json({
    shops: PILOT_SHOPS,
    totalUnsettledBalancePaise: PILOT_SHOPS.reduce(
      (sum, s) => sum + (s.unsettledBalancePaise || 0),
      0
    ),
    source: "IN_MEMORY",
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!verifyAdminSecret(request, body)) {
    return NextResponse.json(
      { error: "Unauthorized. Valid ADMIN_SECRET required." },
      { status: 401 }
    );
  }

  const { shopCode, name, ownerName, ownerPhone, ownerUpiId, currentPin } = body;

  if (!shopCode || !name || !ownerName || !ownerPhone || !ownerUpiId) {
    return NextResponse.json(
      {
        error: "shopCode, name, ownerName, ownerPhone, and ownerUpiId are required.",
      },
      { status: 400 }
    );
  }

  const cleanCode = String(shopCode).trim().toUpperCase();
  const pin =
    currentPin && /^\d{4}$/.test(String(currentPin).trim())
      ? String(currentPin).trim()
      : String(crypto.randomInt(1000, 10000));
  const pinExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const newShopFallback: PilotShopData = {
    id: `shop-${Date.now()}-uuid`,
    shopCode: cleanCode,
    name: String(name).trim(),
    ownerName: String(ownerName).trim(),
    ownerPhone: String(ownerPhone).trim(),
    ownerUpiId: String(ownerUpiId).trim(),
    currentPin: pin,
    pinExpiresAt: pinExpiresAt.toISOString(),
    unsettledBalancePaise: 0,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  try {
    const created = await prisma.shop.create({
      data: {
        shopCode: cleanCode,
        name: newShopFallback.name,
        ownerName: newShopFallback.ownerName,
        ownerPhone: newShopFallback.ownerPhone,
        ownerUpiId: newShopFallback.ownerUpiId,
        currentPin: pin,
        pinExpiresAt,
        unsettledBalancePaise: 0,
        isActive: true,
      },
    });
    newShopFallback.id = created.id;
  } catch (err) {
    console.warn("POST /api/admin/shops DB fallback:", err);
  }

  const existingIndex = PILOT_SHOPS.findIndex((s) => s.shopCode === cleanCode);
  if (existingIndex >= 0) {
    PILOT_SHOPS[existingIndex] = newShopFallback;
  } else {
    PILOT_SHOPS.push(newShopFallback);
  }

  return NextResponse.json({
    success: true,
    shop: newShopFallback,
  });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!verifyAdminSecret(request, body)) {
    return NextResponse.json(
      { error: "Unauthorized. Valid ADMIN_SECRET required." },
      { status: 401 }
    );
  }

  const { shopCode, isActive, rotatePin } = body;
  if (!shopCode) {
    return NextResponse.json({ error: "shopCode is required." }, { status: 400 });
  }

  const cleanCode = String(shopCode).trim().toUpperCase();
  const newPin = rotatePin ? String(crypto.randomInt(1000, 10000)) : undefined;
  const newPinExpiresAt = rotatePin ? new Date(Date.now() + 65 * 60 * 1000) : undefined;

  let updatedShop: any = null;

  try {
    updatedShop = await prisma.shop.update({
      where: { shopCode: cleanCode },
      data: {
        ...(typeof isActive === "boolean" ? { isActive } : {}),
        ...(newPin && newPinExpiresAt
          ? { currentPin: newPin, pinExpiresAt: newPinExpiresAt }
          : {}),
      },
    });
  } catch (err) {
    console.warn("PATCH /api/admin/shops DB fallback:", err);
  }

  const memShop = PILOT_SHOPS.find((s) => s.shopCode === cleanCode);
  if (memShop) {
    if (typeof isActive === "boolean") {
      memShop.isActive = isActive;
    }
    if (newPin && newPinExpiresAt) {
      memShop.currentPin = newPin;
      memShop.pinExpiresAt = newPinExpiresAt.toISOString();
    }
    if (!updatedShop) {
      updatedShop = memShop;
    }
  }

  if (!updatedShop) {
    return NextResponse.json({ error: "Shop not found." }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    shop: updatedShop,
  });
}
