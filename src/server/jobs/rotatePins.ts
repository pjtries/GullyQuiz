import crypto from "crypto";
import prisma from "../../lib/prisma";
import { PILOT_SHOPS } from "../../lib/pilotShops";
import { getNotificationService } from "../services/notificationService";

export interface RotatePinsJobResult {
  success: boolean;
  shopsRotated: number;
  timestamp: string;
  details: {
    shopCode: string;
    shopName: string;
    pin: string;
    expiresAt: string;
    notificationSent: boolean;
  }[];
}

/**
 * Generates a cryptographically secure 4-digit PIN (1000 - 9999)
 */
export function generateSecure4DigitPin(): string {
  return crypto.randomInt(1000, 10000).toString();
}

/**
 * Executes the hourly shop PIN rotation job:
 * 1. Generates cryptographically secure 4-digit PIN for every active shop
 * 2. Sets pinExpiresAt to now + 65 minutes (5-min grace overlap for players in checkout)
 * 3. Saves to PostgreSQL
 * 4. Dispatches WhatsApp notification to shopkeeper's mobile
 */
export async function executeRotatePinsJob(): Promise<RotatePinsJobResult> {
  const now = new Date();
  // 65-minute expiry: 60 minutes active + 5-minute checkout grace period
  const pinExpiresAt = new Date(now.getTime() + 65 * 60 * 1000);
  const notificationService = getNotificationService();
  const details: RotatePinsJobResult["details"] = [];

  console.log(`[RotatePinsJob] ⏳ Starting hourly PIN rotation at ${now.toISOString()}...`);

  // 1. Fetch active shops from PostgreSQL
  let activeShops: {
    id: string;
    shopCode: string;
    name: string;
    ownerPhone: string;
    isActive: boolean;
  }[] = [];

  try {
    activeShops = await prisma.shop.findMany({
      where: { isActive: true },
      select: {
        id: true,
        shopCode: true,
        name: true,
        ownerPhone: true,
        isActive: true,
      },
    });
  } catch (err) {
    console.warn("[RotatePinsJob] DB query failed, using pilot shops fallback:", err);
    activeShops = PILOT_SHOPS.map((s) => ({
      id: s.id,
      shopCode: s.shopCode,
      name: s.name,
      ownerPhone: s.ownerPhone,
      isActive: s.isActive,
    }));
  }

  // 2. Rotate each shop's PIN and notify owner
  for (const shop of activeShops) {
    const newPin = generateSecure4DigitPin();

    // Persist to PostgreSQL if available
    try {
      await prisma.shop.update({
        where: { id: shop.id },
        data: {
          currentPin: newPin,
          pinExpiresAt,
        },
      });
    } catch (dbErr) {
      // In-memory fallback for pilot shops
      const inMemory = PILOT_SHOPS.find((s) => s.shopCode === shop.shopCode);
      if (inMemory) {
        inMemory.currentPin = newPin;
        inMemory.pinExpiresAt = pinExpiresAt.toISOString();
      }
    }

    // 3. Send WhatsApp notification to shop owner
    let notificationSent = false;
    try {
      const notifResult = await notificationService.sendHourlyPin({
        phone: shop.ownerPhone,
        shopName: shop.name,
        shopCode: shop.shopCode,
        pin: newPin,
        expiresAt: pinExpiresAt,
      });
      notificationSent = notifResult.success;
    } catch (notifErr) {
      console.error(`[RotatePinsJob] Failed to notify ${shop.shopCode}:`, notifErr);
    }

    details.push({
      shopCode: shop.shopCode,
      shopName: shop.name,
      pin: newPin,
      expiresAt: pinExpiresAt.toISOString(),
      notificationSent,
    });
  }

  console.log(`[RotatePinsJob] ✅ Successfully rotated PINs for ${details.length} shops.`);

  return {
    success: true,
    shopsRotated: details.length,
    timestamp: now.toISOString(),
    details,
  };
}
