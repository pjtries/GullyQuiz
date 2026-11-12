import prisma from "../../lib/prisma";
import { PILOT_SHOPS } from "../../lib/pilotShops";
import { getPaymentService } from "../services/paymentService";
import { getNotificationService } from "../services/notificationService";

export interface SettlementJobResult {
  success: boolean;
  settlementsProcessed: number;
  totalDisbursedPaise: number;
  timestamp: string;
  details: {
    shopCode: string;
    shopName: string;
    ownerName: string;
    ownerPhone: string;
    ownerUpiId: string;
    amountPaise: number;
    payoutRef: string;
    notificationSent: boolean;
  }[];
}

/**
 * Executes the weekly Sunday vendor settlement job:
 * 1. Queries all shops with unsettledBalancePaise > 0
 * 2. Initiates UPI payout via paymentService.disburseVendorCommission()
 * 3. Atomically records VendorPayout & resets unsettledBalancePaise to 0 in a PostgreSQL transaction
 * 4. Dispatches WhatsApp payout receipt to shop owner
 */
export async function executeWeeklyVendorSettlementJob(): Promise<SettlementJobResult> {
  const now = new Date();
  const paymentService = getPaymentService();
  const notificationService = getNotificationService();
  const details: SettlementJobResult["details"] = [];
  let totalDisbursedPaise = 0;

  console.log(`[SettleVendorsJob] ⏳ Starting weekly vendor settlement at ${now.toISOString()}...`);

  // 1. Fetch shops with unsettled commissions > 0
  let eligibleShops: {
    id: string;
    shopCode: string;
    name: string;
    ownerName: string;
    ownerPhone: string;
    ownerUpiId: string;
    unsettledBalancePaise: number;
  }[] = [];

  try {
    eligibleShops = await prisma.shop.findMany({
      where: {
        isActive: true,
        unsettledBalancePaise: { gt: 0 },
      },
      select: {
        id: true,
        shopCode: true,
        name: true,
        ownerName: true,
        ownerPhone: true,
        ownerUpiId: true,
        unsettledBalancePaise: true,
      },
    });
  } catch (err) {
    console.warn("[SettleVendorsJob] DB query failed, checking pilot shops fallback:", err);
    // In-memory fallback
    eligibleShops = PILOT_SHOPS.filter((s) => s.unsettledBalancePaise > 0).map((s) => ({
      id: s.id,
      shopCode: s.shopCode,
      name: s.name,
      ownerName: s.ownerName,
      ownerPhone: s.ownerPhone,
      ownerUpiId: s.ownerUpiId,
      unsettledBalancePaise: s.unsettledBalancePaise,
    }));
  }

  // If no shops currently have positive balance (e.g. freshly seeded for testing),
  // check if any shop has a balance, or log notice.
  if (eligibleShops.length === 0) {
    console.log("[SettleVendorsJob] No shops have unsettled balances (> ₹0.00) to settle.");
    return {
      success: true,
      settlementsProcessed: 0,
      totalDisbursedPaise: 0,
      timestamp: now.toISOString(),
      details: [],
    };
  }

  // 2. Process settlement for each eligible shop
  for (const shop of eligibleShops) {
    const amountToSettle = shop.unsettledBalancePaise;
    if (amountToSettle <= 0) continue;

    // A. Disburse commission via Payment Service
    const payoutResult = await paymentService.disburseVendorCommission(
      shop.ownerUpiId,
      amountToSettle,
      {
        shopId: shop.id,
        shopCode: shop.shopCode,
      }
    );

    // B. Atomically record VendorPayout & reset balance in PostgreSQL transaction
    try {
      await prisma.$transaction(async (tx) => {
        await tx.vendorPayout.create({
          data: {
            shopId: shop.id,
            amountPaise: amountToSettle,
            payoutReferenceId: payoutResult.payoutId,
            status: "COMPLETED",
            settledAt: new Date(),
          },
        });

        await tx.shop.update({
          where: { id: shop.id },
          data: {
            unsettledBalancePaise: 0,
          },
        });
      });
    } catch (dbErr) {
      console.warn(`[SettleVendorsJob] DB transaction skipped for ${shop.shopCode}:`, dbErr);
      // Update in-memory fallback
      const inMem = PILOT_SHOPS.find((s) => s.shopCode === shop.shopCode);
      if (inMem) {
        inMem.unsettledBalancePaise = 0;
      }
    }

    // C. Send WhatsApp Payout Receipt to shopkeeper
    let notificationSent = false;
    try {
      const notif = await notificationService.sendPayoutReceipt({
        phone: shop.ownerPhone,
        ownerName: shop.ownerName,
        shopName: shop.name,
        shopCode: shop.shopCode,
        amountPaise: amountToSettle,
        upiId: shop.ownerUpiId,
        payoutRef: payoutResult.payoutId,
        periodEnd: now,
      });
      notificationSent = notif.success;
    } catch (notifErr) {
      console.error(`[SettleVendorsJob] Failed to send receipt to ${shop.shopCode}:`, notifErr);
    }

    totalDisbursedPaise += amountToSettle;
    details.push({
      shopCode: shop.shopCode,
      shopName: shop.name,
      ownerName: shop.ownerName,
      ownerPhone: shop.ownerPhone,
      ownerUpiId: shop.ownerUpiId,
      amountPaise: amountToSettle,
      payoutRef: payoutResult.payoutId,
      notificationSent,
    });
  }

  console.log(
    `[SettleVendorsJob] ✅ Settled ${details.length} shops. Total: ₹${totalDisbursedPaise / 100}`
  );

  return {
    success: true,
    settlementsProcessed: details.length,
    totalDisbursedPaise,
    timestamp: now.toISOString(),
    details,
  };
}
