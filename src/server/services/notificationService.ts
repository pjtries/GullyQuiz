import crypto from "crypto";

export interface NotificationResult {
  success: boolean;
  messageId: string;
  recipientPhone: string;
  channel: "WHATSAPP_MOCK" | "WHATSAPP_CLOUD_API" | "TWILIO";
  timestamp: string;
  error?: string;
}

export interface HourlyPinNotificationParams {
  phone: string;
  shopName: string;
  shopCode: string;
  pin: string;
  expiresAt: Date;
}

export interface PayoutReceiptNotificationParams {
  phone: string;
  ownerName: string;
  shopName: string;
  shopCode: string;
  amountPaise: number;
  upiId: string;
  payoutRef: string;
  periodEnd?: Date;
}

export interface NotificationLogItem {
  id: string;
  type: "HOURLY_PIN" | "PAYOUT_RECEIPT";
  recipientPhone: string;
  shopCode: string;
  content: string;
  channel: string;
  timestamp: string;
}

export interface INotificationService {
  readonly channelName: "WHATSAPP_MOCK" | "WHATSAPP_CLOUD_API" | "TWILIO";

  sendHourlyPin(params: HourlyPinNotificationParams): Promise<NotificationResult>;
  sendPayoutReceipt(params: PayoutReceiptNotificationParams): Promise<NotificationResult>;
  getRecentNotifications(): NotificationLogItem[];
}

// In-memory audit trail of sent notifications
const notificationHistory: NotificationLogItem[] = [];

/**
 * 1. MockNotificationService:
 * Default messaging service for local dev & testing.
 * Outputs realistic, formatted WhatsApp business messages to the server console
 * and records an in-memory audit log accessible to admin routes.
 */
export class MockNotificationService implements INotificationService {
  readonly channelName = "WHATSAPP_MOCK" as const;

  async sendHourlyPin(params: HourlyPinNotificationParams): Promise<NotificationResult> {
    const messageId = `msg_pin_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const expiresFormatted = params.expiresAt.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    });

    const content = `☕ *GullyQuiz Counter PIN Update*\nHello ${params.shopName} Owner!\nYour new 4-digit PIN for ${params.shopCode} is 👉 *${params.pin}* 👈\nValid until *${expiresFormatted} IST* (includes 5-min checkout grace period).\nDisplay this on your standee for ₹10 speed quiz players!`;

    console.log("\n==================== 📲 WHATSAPP BUSINESS NOTIFICATION ====================");
    console.log(`To: ${params.phone} (${params.shopName} - ${params.shopCode})`);
    console.log(content);
    console.log("========================================================================\n");

    notificationHistory.unshift({
      id: messageId,
      type: "HOURLY_PIN",
      recipientPhone: params.phone,
      shopCode: params.shopCode,
      content,
      channel: this.channelName,
      timestamp: new Date().toISOString(),
    });

    if (notificationHistory.length > 50) {
      notificationHistory.pop();
    }

    return {
      success: true,
      messageId,
      recipientPhone: params.phone,
      channel: this.channelName,
      timestamp: new Date().toISOString(),
    };
  }

  async sendPayoutReceipt(params: PayoutReceiptNotificationParams): Promise<NotificationResult> {
    const messageId = `msg_pay_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const amountRupees = (params.amountPaise / 100).toFixed(2);

    const content = `💰 *GullyQuiz Weekly Settlement Receipt*\nHello ${params.ownerName}!\nYour weekly vendor commission of *₹${amountRupees}* for ${params.shopName} (${params.shopCode}) has been disbursed.\n• Destination UPI: *${params.upiId}*\n• Ref ID: *${params.payoutRef}*\n• Date: *${new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}*\nThank you for partnering with GullyQuiz!`;

    console.log("\n==================== 💸 WHATSAPP SETTLEMENT RECEIPT ====================");
    console.log(`To: ${params.phone} (${params.ownerName} - ${params.shopName})`);
    console.log(content);
    console.log("========================================================================\n");

    notificationHistory.unshift({
      id: messageId,
      type: "PAYOUT_RECEIPT",
      recipientPhone: params.phone,
      shopCode: params.shopCode,
      content,
      channel: this.channelName,
      timestamp: new Date().toISOString(),
    });

    if (notificationHistory.length > 50) {
      notificationHistory.pop();
    }

    return {
      success: true,
      messageId,
      recipientPhone: params.phone,
      channel: this.channelName,
      timestamp: new Date().toISOString(),
    };
  }

  getRecentNotifications(): NotificationLogItem[] {
    return [...notificationHistory];
  }
}

/**
 * 2. WhatsAppCloudApiNotificationService:
 * Production integration with Meta WhatsApp Business Cloud API.
 */
export class WhatsAppCloudApiNotificationService implements INotificationService {
  readonly channelName = "WHATSAPP_CLOUD_API" as const;
  private phoneNumberId: string;
  private accessToken: string;

  constructor(phoneNumberId?: string, accessToken?: string) {
    this.phoneNumberId = phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "";
    this.accessToken = accessToken || process.env.WHATSAPP_ACCESS_TOKEN || "";
  }

  async sendHourlyPin(params: HourlyPinNotificationParams): Promise<NotificationResult> {
    const url = `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: params.phone.replace(/\D/g, ""),
      type: "text",
      text: {
        body: `☕ GullyQuiz PIN Update: Your new 4-digit PIN for ${params.shopCode} is ${params.pin}. Valid until ${params.expiresAt.toLocaleTimeString("en-IN")}.`,
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    return {
      success: response.ok,
      messageId: data.messages?.[0]?.id || `wamid_${Date.now()}`,
      recipientPhone: params.phone,
      channel: this.channelName,
      timestamp: new Date().toISOString(),
      error: response.ok ? undefined : JSON.stringify(data),
    };
  }

  async sendPayoutReceipt(params: PayoutReceiptNotificationParams): Promise<NotificationResult> {
    const url = `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`;
    const amountRupees = (params.amountPaise / 100).toFixed(2);
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: params.phone.replace(/\D/g, ""),
      type: "text",
      text: {
        body: `💰 GullyQuiz Settlement: ₹${amountRupees} disbursed to UPI ${params.upiId}. Ref: ${params.payoutRef}.`,
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    return {
      success: response.ok,
      messageId: data.messages?.[0]?.id || `wamid_${Date.now()}`,
      recipientPhone: params.phone,
      channel: this.channelName,
      timestamp: new Date().toISOString(),
      error: response.ok ? undefined : JSON.stringify(data),
    };
  }

  getRecentNotifications(): NotificationLogItem[] {
    return [...notificationHistory];
  }
}

/**
 * 3. TwilioNotificationService:
 * Production integration via Twilio WhatsApp API.
 */
export class TwilioNotificationService implements INotificationService {
  readonly channelName = "TWILIO" as const;
  private accountSid: string;
  private authToken: string;
  private fromNumber: string;

  constructor(accountSid?: string, authToken?: string, fromNumber?: string) {
    this.accountSid = accountSid || process.env.TWILIO_ACCOUNT_SID || "";
    this.authToken = authToken || process.env.TWILIO_AUTH_TOKEN || "";
    this.fromNumber = fromNumber || process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+14155238886";
  }

  async sendHourlyPin(params: HourlyPinNotificationParams): Promise<NotificationResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const body = new URLSearchParams({
      From: this.fromNumber,
      To: `whatsapp:${params.phone}`,
      Body: `☕ GullyQuiz PIN Update: Your new 4-digit PIN for ${params.shopCode} is ${params.pin}.`,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const data = await response.json();
    return {
      success: response.ok,
      messageId: data.sid || `tw_${Date.now()}`,
      recipientPhone: params.phone,
      channel: this.channelName,
      timestamp: new Date().toISOString(),
      error: response.ok ? undefined : data.message,
    };
  }

  async sendPayoutReceipt(params: PayoutReceiptNotificationParams): Promise<NotificationResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const amountRupees = (params.amountPaise / 100).toFixed(2);
    const body = new URLSearchParams({
      From: this.fromNumber,
      To: `whatsapp:${params.phone}`,
      Body: `💰 GullyQuiz Settlement: ₹${amountRupees} disbursed to UPI ${params.upiId}. Ref: ${params.payoutRef}.`,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const data = await response.json();
    return {
      success: response.ok,
      messageId: data.sid || `tw_${Date.now()}`,
      recipientPhone: params.phone,
      channel: this.channelName,
      timestamp: new Date().toISOString(),
      error: response.ok ? undefined : data.message,
    };
  }

  getRecentNotifications(): NotificationLogItem[] {
    return [...notificationHistory];
  }
}

// Global Singleton Instance
let notificationServiceInstance: INotificationService | null = null;

export function getNotificationService(): INotificationService {
  if (notificationServiceInstance) {
    return notificationServiceInstance;
  }

  if (process.env.NOTIFICATION_PROVIDER === "WHATSAPP_CLOUD" && process.env.WHATSAPP_ACCESS_TOKEN) {
    notificationServiceInstance = new WhatsAppCloudApiNotificationService();
  } else if (process.env.NOTIFICATION_PROVIDER === "TWILIO" && process.env.TWILIO_ACCOUNT_SID) {
    notificationServiceInstance = new TwilioNotificationService();
  } else {
    notificationServiceInstance = new MockNotificationService();
  }

  return notificationServiceInstance;
}
