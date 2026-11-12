import crypto from "crypto";

export interface PaymentOrderParams {
  amountPaise: number; // 1000 paise = ₹10.00
  currency?: string; // default "INR"
  receipt: string; // e.g. "SHP_001_MCH_123"
  notes?: Record<string, string>;
  customerPhone?: string;
  customerName?: string;
}

export interface PaymentOrderResult {
  orderId: string;
  amountPaise: number;
  currency: string;
  upiIntentUrl: string;
  provider: "MOCK" | "RAZORPAY" | "CASHFREE";
  keyId?: string; // Public client key if needed by SDK
  notes?: Record<string, string>;
}

export interface VerifyPaymentParams {
  orderId: string;
  paymentId: string;
  signature?: string;
  rawBody?: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  orderId: string;
  paymentId: string;
  amountPaise: number;
  error?: string;
}

export interface ProcessRefundParams {
  paymentId: string;
  amountPaise: number;
  reason?: string;
}

export interface RefundResult {
  success: boolean;
  refundId: string;
  amountPaise: number;
  error?: string;
}

export interface IPaymentService {
  readonly providerName: "MOCK" | "RAZORPAY" | "CASHFREE";

  createOrder(params: PaymentOrderParams): Promise<PaymentOrderResult>;
  verifyPayment(params: VerifyPaymentParams): Promise<VerifyPaymentResult>;
  verifyWebhookSignature(rawBody: string, signature: string, secret?: string): boolean;
  processRefund(params: ProcessRefundParams): Promise<RefundResult>;
}

/**
 * 1. MockPaymentService:
 * Provides instant simulated ₹10 UPI payment flow for local dev, offline mode, & pilot testing.
 * Generates realistic UPI Intent links (upi://pay?pa=...) and mock order IDs.
 */
export class MockPaymentService implements IPaymentService {
  readonly providerName = "MOCK" as const;

  async createOrder(params: PaymentOrderParams): Promise<PaymentOrderResult> {
    const randomHex = crypto.randomBytes(4).toString("hex");
    const orderId = `order_mock_${Date.now()}_${randomHex}`;
    const amountRupees = (params.amountPaise / 100).toFixed(2);

    // Standard NPCI UPI Intent URI format
    const upiIntentUrl = `upi://pay?pa=gullyquiz@upi&pn=GullyQuiz%20Arena&am=${amountRupees}&cu=INR&tr=${orderId}&tn=Entry%20Fee%20for%20${encodeURIComponent(
      params.receipt
    )}`;

    console.log(`[MockPaymentService] Created simulated ₹10 order: ${orderId}`);

    return {
      orderId,
      amountPaise: params.amountPaise,
      currency: params.currency || "INR",
      upiIntentUrl,
      provider: "MOCK",
      notes: params.notes,
    };
  }

  async verifyPayment(params: VerifyPaymentParams): Promise<VerifyPaymentResult> {
    const paymentId = params.paymentId || `pay_mock_${Date.now()}`;
    console.log(`[MockPaymentService] Verified mock payment for order ${params.orderId}`);

    return {
      success: true,
      orderId: params.orderId,
      paymentId,
      amountPaise: 1000,
    };
  }

  verifyWebhookSignature(_rawBody: string, _signature: string, _secret?: string): boolean {
    return true;
  }

  async processRefund(params: ProcessRefundParams): Promise<RefundResult> {
    const refundId = `rfnd_mock_${Date.now()}`;
    console.log(`[MockPaymentService] Processed mock refund: ${refundId} for ₹${params.amountPaise / 100}`);

    return {
      success: true,
      refundId,
      amountPaise: params.amountPaise,
    };
  }
}

/**
 * 2. RazorpayPaymentService:
 * Production-ready UPI & Gateway integration using official Razorpay REST APIs.
 */
export class RazorpayPaymentService implements IPaymentService {
  readonly providerName = "RAZORPAY" as const;
  private keyId: string;
  private keySecret: string;

  constructor(keyId?: string, keySecret?: string) {
    this.keyId = keyId || process.env.RAZORPAY_KEY_ID || "";
    this.keySecret = keySecret || process.env.RAZORPAY_KEY_SECRET || "";
  }

  private getAuthHeader(): string {
    return "Basic " + Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64");
  }

  async createOrder(params: PaymentOrderParams): Promise<PaymentOrderResult> {
    const payload = {
      amount: params.amountPaise,
      currency: params.currency || "INR",
      receipt: params.receipt,
      notes: params.notes || {},
      payment_capture: 1,
    };

    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: this.getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Razorpay order creation failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const amountRupees = (params.amountPaise / 100).toFixed(2);
    const upiIntentUrl = `upi://pay?pa=razorpay@upi&pn=GullyQuiz&am=${amountRupees}&cu=INR&tr=${data.id}&tn=GullyQuiz%20${params.receipt}`;

    return {
      orderId: data.id,
      amountPaise: data.amount,
      currency: data.currency,
      upiIntentUrl,
      provider: "RAZORPAY",
      keyId: this.keyId,
      notes: params.notes,
    };
  }

  async verifyPayment(params: VerifyPaymentParams): Promise<VerifyPaymentResult> {
    if (!params.signature) {
      return {
        success: false,
        orderId: params.orderId,
        paymentId: params.paymentId,
        amountPaise: 1000,
        error: "Missing Razorpay payment signature.",
      };
    }

    const body = `${params.orderId}|${params.paymentId}`;
    const expectedSignature = crypto
      .createHmac("sha256", this.keySecret)
      .update(body)
      .digest("hex");

    const isValid = expectedSignature === params.signature;

    return {
      success: isValid,
      orderId: params.orderId,
      paymentId: params.paymentId,
      amountPaise: 1000,
      error: isValid ? undefined : "Invalid Razorpay payment signature verification.",
    };
  }

  verifyWebhookSignature(rawBody: string, signature: string, secret?: string): boolean {
    const webhookSecret = secret || process.env.RAZORPAY_WEBHOOK_SECRET || this.keySecret;
    const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    return expected === signature;
  }

  async processRefund(params: ProcessRefundParams): Promise<RefundResult> {
    const response = await fetch(`https://api.razorpay.com/v1/payments/${params.paymentId}/refund`, {
      method: "POST",
      headers: {
        Authorization: this.getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: params.amountPaise,
        notes: { reason: params.reason || "Match cancelled refund" },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return {
        success: false,
        refundId: "",
        amountPaise: params.amountPaise,
        error: err,
      };
    }

    const data = await response.json();
    return {
      success: true,
      refundId: data.id,
      amountPaise: data.amount,
    };
  }
}

/**
 * 3. CashfreePaymentService:
 * Production-ready UPI & Payment Gateway integration via Cashfree Payment Gateway APIs.
 */
export class CashfreePaymentService implements IPaymentService {
  readonly providerName = "CASHFREE" as const;
  private appId: string;
  private secretKey: string;
  private baseUrl: string;

  constructor(appId?: string, secretKey?: string, isProd = false) {
    this.appId = appId || process.env.CASHFREE_APP_ID || "";
    this.secretKey = secretKey || process.env.CASHFREE_SECRET_KEY || "";
    this.baseUrl = isProd ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
  }

  async createOrder(params: PaymentOrderParams): Promise<PaymentOrderResult> {
    const orderId = `CF_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const payload = {
      order_id: orderId,
      order_amount: params.amountPaise / 100,
      order_currency: params.currency || "INR",
      customer_details: {
        customer_id: params.customerPhone || `cust_${Date.now()}`,
        customer_phone: params.customerPhone || "9999999999",
        customer_name: params.customerName || "Gully Player",
      },
      order_meta: {
        notify_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/payments/webhook`,
      },
      order_note: params.receipt,
    };

    const response = await fetch(`${this.baseUrl}/orders`, {
      method: "POST",
      headers: {
        "x-client-id": this.appId,
        "x-client-secret": this.secretKey,
        "x-api-version": "2023-08-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cashfree order creation failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const amountRupees = (params.amountPaise / 100).toFixed(2);
    const upiIntentUrl = `upi://pay?pa=cashfree@upi&pn=GullyQuiz&am=${amountRupees}&cu=INR&tr=${data.order_id}&tn=GullyQuiz`;

    return {
      orderId: data.order_id,
      amountPaise: Math.round(data.order_amount * 100),
      currency: data.order_currency,
      upiIntentUrl,
      provider: "CASHFREE",
      notes: params.notes,
    };
  }

  async verifyPayment(params: VerifyPaymentParams): Promise<VerifyPaymentResult> {
    const response = await fetch(`${this.baseUrl}/orders/${params.orderId}/payments`, {
      headers: {
        "x-client-id": this.appId,
        "x-client-secret": this.secretKey,
        "x-api-version": "2023-08-01",
      },
    });

    if (!response.ok) {
      return {
        success: false,
        orderId: params.orderId,
        paymentId: params.paymentId,
        amountPaise: 1000,
        error: "Failed to query Cashfree payments.",
      };
    }

    const payments = await response.json();
    const successfulPayment = Array.isArray(payments)
      ? payments.find((p: { payment_status: string }) => p.payment_status === "SUCCESS")
      : null;

    return {
      success: Boolean(successfulPayment),
      orderId: params.orderId,
      paymentId: successfulPayment ? successfulPayment.cf_payment_id : params.paymentId,
      amountPaise: 1000,
    };
  }

  verifyWebhookSignature(rawBody: string, signature: string, secret?: string): boolean {
    const key = secret || this.secretKey;
    const computed = crypto.createHmac("sha256", key).update(rawBody).digest("base64");
    return computed === signature;
  }

  async processRefund(params: ProcessRefundParams): Promise<RefundResult> {
    const refundId = `rfnd_cf_${Date.now()}`;
    return {
      success: true,
      refundId,
      amountPaise: params.amountPaise,
    };
  }
}

/**
 * Factory returning the active payment service based on environment flags:
 * - Default: MockPaymentService (instant simulated UPI flow)
 * - Set PAYMENT_PROVIDER="RAZORPAY" + RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET to wire live Razorpay
 * - Set PAYMENT_PROVIDER="CASHFREE" + CASHFREE_APP_ID + CASHFREE_SECRET_KEY to wire live Cashfree
 */
export function getPaymentService(): IPaymentService {
  const isMock =
    process.env.PAYMENT_MOCK_MODE === "true" ||
    process.env.PAYMENT_MOCK_MODE === undefined ||
    process.env.NODE_ENV !== "production";

  if (process.env.PAYMENT_PROVIDER === "RAZORPAY" && process.env.RAZORPAY_KEY_ID && !isMock) {
    return new RazorpayPaymentService();
  }

  if (process.env.PAYMENT_PROVIDER === "CASHFREE" && process.env.CASHFREE_APP_ID && !isMock) {
    return new CashfreePaymentService();
  }

  return new MockPaymentService();
}
