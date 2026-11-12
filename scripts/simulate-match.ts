import { EventEmitter } from "events";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { io as ioClient, Socket as ClientSocket } from "socket.io-client";
import prisma from "../src/lib/prisma";
import { initSocketServer } from "../src/server/socket";
import { GameEngine } from "../src/server/gameState";
import { CURATED_QUESTIONS } from "../src/lib/curatedQuestions";
import { GET as getShopsRoute } from "../src/app/api/shops/route";
import { POST as verifyPinRoute } from "../src/app/api/shops/verify-pin/route";
import { POST as createOrderRoute } from "../src/app/api/payments/create-order/route";
import { POST as verifyPaymentRoute } from "../src/app/api/payments/verify/route";
import { GET as getAdminLedgerRoute } from "../src/app/api/admin/ledger/route";
import { GET as getAdminShopsRoute } from "../src/app/api/admin/shops/route";

const ADMIN_SECRET = process.env.ADMIN_SECRET || "gullyquiz_dev_secret_2026";

function assertCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ASSERTION FAILED: ${message}`);
  }
}

interface SimSocket {
  id: string;
  on(event: string, listener: (...args: any[]) => void): void;
  emit(event: string, payload?: any): void;
  disconnect(): void;
}

interface SimulationRuntime {
  baseUrl: string;
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
  createPlayerSocket: () => SimSocket;
  cleanup: () => Promise<void>;
}

async function dispatchRouteHandler(urlStr: string, init?: RequestInit): Promise<Response> {
  const url = new URL(urlStr, "http://localhost:3000");
  const webReq = new Request(url.toString(), init);

  if (url.pathname === "/api/shops" && (!init?.method || init.method === "GET")) {
    return getShopsRoute(webReq);
  }
  if (url.pathname === "/api/shops/verify-pin" && init?.method === "POST") {
    return verifyPinRoute(webReq);
  }
  if (url.pathname === "/api/payments/create-order" && init?.method === "POST") {
    return createOrderRoute(webReq);
  }
  if (url.pathname === "/api/payments/verify" && init?.method === "POST") {
    return verifyPaymentRoute(webReq);
  }
  if (url.pathname === "/api/admin/ledger" && (!init?.method || init.method === "GET")) {
    return getAdminLedgerRoute(webReq);
  }
  if (url.pathname === "/api/admin/shops" && (!init?.method || init.method === "GET")) {
    return getAdminShopsRoute(webReq);
  }

  return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
}

async function handleHttpApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  baseUrl: string
) {
  const url = new URL(req.url || "/", baseUrl);
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const rawBody = Buffer.concat(chunks).toString("utf-8");

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(", "));
  }

  const webRes = await dispatchRouteHandler(url.toString(), {
    method: req.method || "GET",
    headers,
    body: req.method !== "GET" && req.method !== "HEAD" && rawBody ? rawBody : undefined,
  });

  res.statusCode = webRes.status;
  res.setHeader("Content-Type", "application/json");
  res.end(await webRes.text());
}

/**
 * Creates a simulation runtime that connects over live HTTP + socket.io-client WebSockets
 * when TCP loopback is permitted, or seamlessly bridges to the in-process GameEngine & Route
 * Handlers if running inside a network-restricted sandbox.
 */
async function createSimulationRuntime(): Promise<SimulationRuntime> {
  const candidateUrl = process.env.APP_URL || "http://localhost:3000";

  // 1. Check if external server is already running on localhost:3000
  try {
    const check = await fetch(`${candidateUrl}/api/shops?shopCode=SHP_001`);
    if (check.ok) {
      console.log(`🌐 Connected to running GullyQuiz server at ${candidateUrl} via socket.io-client`);
      return {
        baseUrl: candidateUrl,
        apiFetch: (path, init) => fetch(`${candidateUrl}${path}`, init),
        createPlayerSocket: () =>
          ioClient(candidateUrl, {
            transports: ["websocket"],
            forceNew: true,
          }) as unknown as SimSocket,
        cleanup: async () => {},
      };
    }
  } catch {
    // External server not running; try embedded HTTP + Socket.io server
  }

  // 2. Try embedded HTTP + Socket.io server over loopback TCP
  try {
    const embedded = await new Promise<{ baseUrl: string; close: () => Promise<void> }>(
      (resolve, reject) => {
        const httpServer = createServer((req, res) => {
          const addr = httpServer.address();
          const port = typeof addr === "object" && addr ? addr.port : 0;
          handleHttpApiRequest(req, res, `http://127.0.0.1:${port}`).catch((err) => {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          });
        });

        initSocketServer(httpServer);

        httpServer.on("error", reject);
        httpServer.listen(0, "127.0.0.1", () => {
          const addr = httpServer.address();
          const port = typeof addr === "object" && addr ? addr.port : 3000;
          resolve({
            baseUrl: `http://127.0.0.1:${port}`,
            close: () => new Promise<void>((r) => httpServer.close(() => r())),
          });
        });
      }
    );

    // Probe TCP loopback connectivity
    const probe = await fetch(`${embedded.baseUrl}/api/shops?shopCode=SHP_001`);
    if (probe.ok) {
      console.log(
        `🚀 Booted embedded GullyQuiz HTTP + Socket.io server at ${embedded.baseUrl} (using socket.io-client)`
      );
      return {
        baseUrl: embedded.baseUrl,
        apiFetch: (path, init) => fetch(`${embedded.baseUrl}${path}`, init),
        createPlayerSocket: () =>
          ioClient(embedded.baseUrl, {
            transports: ["websocket"],
            forceNew: true,
          }) as unknown as SimSocket,
        cleanup: embedded.close,
      };
    }
    await embedded.close();
  } catch {
    // Loopback TCP blocked by sandbox environment; use in-process Socket.io room bridge
  }

  console.log(
    "⚡ Loopback TCP restricted by environment; using direct in-process Socket.io GameEngine + Route Handler bridge."
  );

  const rooms = new Map<string, Set<InProcessClientSocket>>();

  const fakeIoServer = {
    to(room: string) {
      return {
        emit(event: string, payload: any) {
          const members = rooms.get(room);
          if (members) {
            members.forEach((client) => client.receiveServerEvent(event, payload));
          }
        },
      };
    },
  };

  const engine = new GameEngine(fakeIoServer as any);
  let socketCounter = 0;

  class InProcessClientSocket implements SimSocket {
    public id: string;
    public data: Record<string, any> = {};
    private clientEmitter = new EventEmitter();
    private joinedRooms = new Set<string>();
    private serverSideSocket: any;

    constructor() {
      socketCounter += 1;
      this.id = `sim_sock_${socketCounter}_${Date.now()}`;
      const self = this;

      this.serverSideSocket = {
        id: this.id,
        data: this.data,
        join(room: string) {
          self.joinedRooms.add(room);
          if (!rooms.has(room)) {
            rooms.set(room, new Set());
          }
          rooms.get(room)!.add(self);
        },
        emit(event: string, payload: any) {
          self.receiveServerEvent(event, payload);
        },
      };

      setImmediate(() => {
        this.clientEmitter.emit("connect");
      });
    }

    on(event: string, listener: (...args: any[]) => void) {
      this.clientEmitter.on(event, listener);
    }

    receiveServerEvent(event: string, payload: any) {
      this.clientEmitter.emit(event, payload);
    }

    emit(event: string, payload?: any) {
      setImmediate(async () => {
        if (event === "join_lobby") {
          await engine.handleJoinLobby(this.serverSideSocket, payload);
        } else if (event === "quiz:submit_answer" || event === "submit_answer") {
          engine.handleSubmitAnswer(this.serverSideSocket, payload);
        } else if (event === "force_start_match") {
          await engine.forceStartMatch(payload.shopCode, payload.pin);
        } else if (event === "trigger_test_refund") {
          await engine.triggerTestRefund(payload.shopCode);
        }
      });
    }

    disconnect() {
      this.joinedRooms.forEach((r) => rooms.get(r)?.delete(this));
      this.joinedRooms.clear();
      engine.handleDisconnect(this.serverSideSocket);
      this.clientEmitter.removeAllListeners();
    }
  }

  return {
    baseUrl: "http://localhost:3000",
    apiFetch: (path, init) => dispatchRouteHandler(`http://localhost:3000${path}`, init),
    createPlayerSocket: () => new InProcessClientSocket(),
    cleanup: async () => {},
  };
}

async function onboardAndPayPlayer(
  runtime: SimulationRuntime,
  shopCode: string,
  pin: string,
  player: { displayName: string; phone: string; upiId: string }
): Promise<{ orderId: string; paymentId: string }> {
  // 1. Verify Shop PIN
  const pinRes = await runtime.apiFetch("/api/shops/verify-pin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shopCode, pin }),
  });
  const pinData = await pinRes.json();
  assertCondition(
    pinRes.ok && pinData.valid === true,
    `PIN verification failed for ${player.displayName}`
  );

  // 2. Create ₹10 Order
  const orderRes = await runtime.apiFetch("/api/payments/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shopCode,
      pin,
      phone: player.phone,
      displayName: player.displayName,
      upiId: player.upiId,
    }),
  });
  const orderData = await orderRes.json();
  assertCondition(
    orderRes.ok && orderData.success && orderData.amountPaise === 1000,
    `₹10 order creation failed for ${player.displayName}`
  );

  // 3. Verify ₹10 Payment
  const verifyRes = await runtime.apiFetch("/api/payments/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId: orderData.orderId,
      paymentId: `pay_sim_${Date.now()}_${player.phone.slice(-4)}`,
      shopCode,
      phone: player.phone,
      displayName: player.displayName,
      upiId: player.upiId,
    }),
  });
  const verifyData = await verifyRes.json();
  assertCondition(
    verifyRes.ok && verifyData.success,
    `Payment verification failed for ${player.displayName}`
  );

  return { orderId: orderData.orderId, paymentId: verifyData.paymentId };
}

/**
 * ============================================================================
 * SCENARIO 1: 6 CONCURRENT PLAYERS FULL MATCH, TIE-BREAKER & 70/10/20 SPLIT
 * ============================================================================
 */
async function runSixPlayerMatchSimulation(runtime: SimulationRuntime) {
  console.log("\n================================================================================");
  console.log("🏏 SCENARIO 1: 6 Concurrent Players on SHP_001 (Full 9-Question Match & 70/10/20 Split)");
  console.log("================================================================================");

  const shopCode = "SHP_001";

  // 1. Fetch shop info & initial unsettledBalancePaise
  const shopRes = await runtime.apiFetch(`/api/shops?shopCode=${shopCode}`);
  const shopJson = await shopRes.json();
  assertCondition(shopRes.ok && Boolean(shopJson.shop), "Failed to fetch SHP_001 details");

  const activePin: string = shopJson.shop.currentPin;
  const initialVendorBalancePaise: number = shopJson.shop.unsettledBalancePaise || 0;
  console.log(
    `📍 Scanned ${shopCode} (${shopJson.shop.name}) | Active PIN: ${activePin} | Initial Vendor Balance: ₹${(
      initialVendorBalancePaise / 100
    ).toFixed(2)}`
  );

  // Define 6 concurrent players:
  // Players 1 & 2 BOTH answer all 9 questions correctly within the [1..199ms] bracket
  // so they earn the EXACT same score (149 * 9 = 1341 pts), testing the "fastest hand wins" tie-breaker!
  // Players 3..6 use randomized response delays (260ms - 850ms) and varied accuracy.
  const playersConfig = [
    {
      displayName: "Aarav_FastestHand",
      phone: "+919000000001",
      upiId: "aarav.fast@okaxis",
      mode: "TIE_LEADER_FAST" as const,
    },
    {
      displayName: "Vikram_TiedScoreSlower",
      phone: "+919000000002",
      upiId: "vikram.tie@ybl",
      mode: "TIE_RUNNER_UP" as const,
    },
    {
      displayName: "Priya_Random",
      phone: "+919000000003",
      upiId: "priya@paytm",
      mode: "RANDOM" as const,
    },
    {
      displayName: "Rohan_Random",
      phone: "+919000000004",
      upiId: "rohan@okicici",
      mode: "RANDOM" as const,
    },
    {
      displayName: "Sneha_Random",
      phone: "+919000000005",
      upiId: "sneha@upi",
      mode: "RANDOM" as const,
    },
    {
      displayName: "Karthik_Random",
      phone: "+919000000006",
      upiId: "karthik@oksbi",
      mode: "RANDOM" as const,
    },
  ];

  // 2. Verify PIN & Pay ₹10 concurrently for all 6 players
  const paymentReceipts = await Promise.all(
    playersConfig.map((p) => onboardAndPayPlayer(runtime, shopCode, activePin, p))
  );
  console.log(`💳 All 6 players verified PIN ${activePin} and completed ₹10 UPI entry payments.`);

  // 3. Connect 6 concurrent Socket clients
  const sockets: SimSocket[] = [];
  let activeMatchId = "";
  let questionsReceivedCount = 0;
  let matchStartedTriggered = false;

  const matchFinishedPromise = new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for 6-player match to complete."));
    }, 90000);

    playersConfig.forEach((player, idx) => {
      const socket = runtime.createPlayerSocket();
      sockets.push(socket);

      socket.on("connect", () => {
        socket.emit("join_lobby", {
          shopCode,
          pin: activePin,
          phone: player.phone,
          displayName: player.displayName,
          upiId: player.upiId,
          paymentOrderId: paymentReceipts[idx].orderId,
        });
      });

      socket.on("match:lobby_update", (state: any) => {
        if (state.matchId) {
          activeMatchId = state.matchId;
        }
        if (
          idx === 0 &&
          !matchStartedTriggered &&
          state.stage === "LOBBY_OPEN" &&
          state.playerCount === 6
        ) {
          matchStartedTriggered = true;
          console.log(
            `👥 Lobby reached 6/10 players | Live Pot: ₹${(
              state.pot.totalPotPaise / 100
            ).toFixed(2)} | 70% Prize Pool: ₹${(state.currentPrizePoolPaise / 100).toFixed(2)}`
          );
          socket.emit("force_start_match", { shopCode, pin: activePin });
        }
      });

      socket.on("quiz:question", (qPayload: any) => {
        // Security verification: ensure correctOptionIndex is NEVER leaked to client
        assertCondition(
          qPayload.correctOptionIndex === undefined,
          "Security breach: correctOptionIndex was sent in quiz:question payload!"
        );

        if (idx === 0) {
          questionsReceivedCount += 1;
          console.log(
            `❓ [Q${qPayload.questionIndex + 1}/${qPayload.totalQuestions}] "${qPayload.questionText.slice(
              0,
              60
            )}..."`
          );
        }

        // Look up the known correct option index from curated question bank
        const matchedQ = CURATED_QUESTIONS.find(
          (cq) => cq.questionText === qPayload.questionText
        );
        const correctIdx = matchedQ ? matchedQ.correctOptionIndex : 0;

        let delayMs: number;
        let selectedOptionIndex: number;

        if (player.mode === "TIE_LEADER_FAST") {
          // Deterministic ~25ms response -> 149 pts per question
          delayMs = 25;
          selectedOptionIndex = correctIdx;
        } else if (player.mode === "TIE_RUNNER_UP") {
          // Deterministic ~135ms response -> 149 pts per question (ties on score, slower cumulativeResponseMs)
          delayMs = 135;
          selectedOptionIndex = correctIdx;
        } else {
          // Randomized response delay between 260ms and 850ms
          delayMs = 260 + Math.floor(Math.random() * 590);
          const pickCorrect = Math.random() < 0.7;
          selectedOptionIndex = pickCorrect ? correctIdx : (correctIdx + 1) % 4;
        }

        setTimeout(() => {
          socket.emit("quiz:submit_answer", {
            shopCode,
            matchId: activeMatchId,
            questionIndex: qPayload.questionIndex,
            selectedOptionIndex,
          });
        }, delayMs);
      });

      if (idx === 0) {
        socket.on("quiz:finished", (finishData: any) => {
          clearTimeout(timeout);
          resolve(finishData);
        });
      }
    });
  });

  const result = await matchFinishedPromise;

  // Clean up sockets
  sockets.forEach((s) => s.disconnect());

  // 4. Verify all 9 questions were broadcast & answered
  assertCondition(
    questionsReceivedCount === 9,
    `Expected 9 questions broadcast, got ${questionsReceivedCount}`
  );
  console.log(`\n✅ All 9 questions completed by 6 concurrent players!`);

  // 5. Verify Exact 70 / 10 / 20 Financial Split
  const { pot, winner, finalLeaderboard, payoutResult } = result;
  console.log("\n📊 Financial Split Verification (6 Players × ₹10 = ₹60.00 Total Pot):");
  console.log(
    `   • Total Gross Pot (100%):    ${pot.totalPotPaise} paise (₹${(pot.totalPotPaise / 100).toFixed(2)})`
  );
  console.log(
    `   • Winner Prize Pool (70%):   ${pot.winnerPrizePoolPaise} paise (₹${(
      pot.winnerPrizePoolPaise / 100
    ).toFixed(2)})`
  );
  console.log(
    `   • Vendor Commission (10%):   ${pot.vendorSharePaise} paise (₹${(
      pot.vendorSharePaise / 100
    ).toFixed(2)})`
  );
  console.log(
    `   • Platform Revenue (20%):    ${pot.platformSharePaise} paise (₹${(
      pot.platformSharePaise / 100
    ).toFixed(2)})`
  );

  assertCondition(pot.totalPotPaise === 6000, `Expected totalPotPaise=6000, got ${pot.totalPotPaise}`);
  assertCondition(
    pot.winnerPrizePoolPaise === 4200,
    `Expected 70% winnerPrizePoolPaise=4200, got ${pot.winnerPrizePoolPaise}`
  );
  assertCondition(
    pot.vendorSharePaise === 600,
    `Expected 10% vendorSharePaise=600, got ${pot.vendorSharePaise}`
  );
  assertCondition(
    pot.platformSharePaise === 1200,
    `Expected 20% platformSharePaise=1200, got ${pot.platformSharePaise}`
  );

  // 6. Verify Tie-Breaker ("Fastest Hand Wins") Accuracy
  const rank1 = finalLeaderboard[0];
  const rank2 = finalLeaderboard[1];
  console.log("\n⚡ Tie-Breaker ('Fastest Hand Wins') Podium Verification:");
  finalLeaderboard.forEach((p: any) => {
    console.log(
      `   #${p.rank} ${p.displayName.padEnd(24)} | Score: ${p.score} pts | Cumulative Time: ${
        p.cumulativeResponseMs
      } ms`
    );
  });

  assertCondition(
    rank1.score === rank2.score,
    `Expected Rank 1 and Rank 2 to have tied scores, got ${rank1.score} vs ${rank2.score}`
  );
  assertCondition(
    rank1.displayName === "Aarav_FastestHand",
    `Expected Aarav_FastestHand to win tie-breaker, got ${rank1.displayName}`
  );
  assertCondition(
    rank1.cumulativeResponseMs < rank2.cumulativeResponseMs,
    `Expected Rank 1 cumulativeResponseMs (${rank1.cumulativeResponseMs}ms) < Rank 2 (${rank2.cumulativeResponseMs}ms)`
  );
  assertCondition(
    winner.displayName === "Aarav_FastestHand" &&
      payoutResult?.success === true &&
      payoutResult?.amountPaise === 4200,
    "Winner UPI payout confirmation mismatch"
  );
  console.log(
    `🏆 Tie-Breaker Verified: ${rank1.displayName} beat ${rank2.displayName} on fastest cumulative hand (${rank1.cumulativeResponseMs}ms vs ${rank2.cumulativeResponseMs}ms) with identical score (${rank1.score} pts)!`
  );
  console.log(
    `💸 Instant UPI Payout Disbursed: ₹${(payoutResult.amountPaise / 100).toFixed(2)} -> ${
      payoutResult.upiId
    } (Ref: ${payoutResult.payoutId})`
  );

  // 7. Verify Persistence in PostgreSQL (and Admin Ledger API)
  const ledgerRes = await runtime.apiFetch("/api/admin/ledger", {
    headers: { "x-admin-secret": ADMIN_SECRET },
  });
  const ledgerData = await ledgerRes.json();
  const recordedMatch = ledgerData.matches.find((m: any) => m.id === activeMatchId);
  assertCondition(
    Boolean(recordedMatch && recordedMatch.status === "COMPLETED_SETTLED"),
    "Ledger match status should be COMPLETED_SETTLED"
  );
  assertCondition(
    recordedMatch.prizePoolPaise === 4200 &&
      recordedMatch.vendorSharePaise === 600 &&
      recordedMatch.platformSharePaise === 1200,
    "Ledger 70/10/20 split values mismatch"
  );

  const updatedShopRes = await runtime.apiFetch(`/api/shops?shopCode=${shopCode}`);
  const updatedShopJson = await updatedShopRes.json();
  assertCondition(
    updatedShopJson.shop.unsettledBalancePaise === initialVendorBalancePaise + 600,
    `Expected SHP_001 unsettledBalancePaise to increase by 600, got ${updatedShopJson.shop.unsettledBalancePaise}`
  );
  console.log(
    `🗄️  Database / Ledger Verified: Match ${activeMatchId} is COMPLETED_SETTLED and ${shopCode} unsettledBalancePaise increased by +₹6.00 (600 paise)!`
  );
}

/**
 * ============================================================================
 * SCENARIO 2: 3 PLAYERS AUTOMATIC CANCELLED_REFUNDED AFTER LOBBY TIMER EXPIRES
 * ============================================================================
 */
async function runThreePlayerRefundSimulation(runtime: SimulationRuntime) {
  console.log("\n================================================================================");
  console.log("↺ SCENARIO 2: 3 Concurrent Players on SHP_002 (Minimum 4-Player Rule -> Auto Refund)");
  console.log("================================================================================");

  const shopCode = "SHP_002";
  const shopRes = await runtime.apiFetch(`/api/shops?shopCode=${shopCode}`);
  const shopJson = await shopRes.json();
  assertCondition(shopRes.ok && Boolean(shopJson.shop), "Failed to fetch SHP_002 details");

  const activePin: string = shopJson.shop.currentPin;
  console.log(`📍 Scanned ${shopCode} (${shopJson.shop.name}) | Active PIN: ${activePin}`);

  const threePlayers = [
    { displayName: "Meera_Refund1", phone: "+919000000011", upiId: "meera@okaxis" },
    { displayName: "Arjun_Refund2", phone: "+919000000012", upiId: "arjun@ybl" },
    { displayName: "Kiran_Refund3", phone: "+919000000013", upiId: "kiran@paytm" },
  ];

  // 1. Verify PIN & Pay ₹10 for 3 players
  const receipts = await Promise.all(
    threePlayers.map((p) => onboardAndPayPlayer(runtime, shopCode, activePin, p))
  );
  console.log(`💳 3 players paid ₹10 and entered ${shopCode} lobby (minimum required: 4 players).`);

  const sockets: SimSocket[] = [];
  let refundedMatchId = "";

  // 2. Join lobby with a 3-second countdown timer and wait for natural timer expiration
  const refundEventPromise = new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for match:cancelled_refunded event."));
    }, 15000);

    threePlayers.forEach((player, idx) => {
      const socket = runtime.createPlayerSocket();
      sockets.push(socket);

      socket.on("connect", () => {
        socket.emit("join_lobby", {
          shopCode,
          pin: activePin,
          phone: player.phone,
          displayName: player.displayName,
          upiId: player.upiId,
          paymentOrderId: receipts[idx].orderId,
          lobbyDurationSeconds: 3, // 3-second lobby timer for fast E2E verification
        });
      });

      if (idx === 0) {
        socket.on("match:lobby_update", (state: any) => {
          if (state.matchId) refundedMatchId = state.matchId;
        });

        socket.on("match:cancelled_refunded", (refundPayload: any) => {
          clearTimeout(timeout);
          resolve(refundPayload);
        });
      }
    });
  });

  console.log("⏳ Waiting for lobby countdown timer to expire with 3/4 players...");
  const refundPayload = await refundEventPromise;

  sockets.forEach((s) => s.disconnect());

  console.log("\n🔔 Received 'match:cancelled_refunded' WebSocket Broadcast:");
  console.log(`   • Match ID:              ${refundPayload.matchId}`);
  console.log(`   • Participants Refunded: ${refundPayload.participantsRefunded}`);
  console.log(`   • Refund Amount Each:    ₹${(refundPayload.refundedAmountPaise / 100).toFixed(2)}`);
  console.log(`   • Reason:                ${refundPayload.reason}`);

  assertCondition(
    refundPayload.participantsRefunded === 3 && refundPayload.refundedAmountPaise === 1000,
    `Expected 3 participants refunded ₹10 (1000 paise), got ${JSON.stringify(refundPayload)}`
  );

  // Verify CANCELLED_REFUNDED status in PostgreSQL / Admin Ledger
  const ledgerRes = await runtime.apiFetch("/api/admin/ledger", {
    headers: { "x-admin-secret": ADMIN_SECRET },
  });
  const ledgerData = await ledgerRes.json();
  const cancelledMatch = ledgerData.matches.find((m: any) => m.id === refundedMatchId);
  assertCondition(
    Boolean(cancelledMatch && cancelledMatch.status === "CANCELLED_REFUNDED"),
    "Expected Ledger match status CANCELLED_REFUNDED"
  );
  assertCondition(
    cancelledMatch.participants.every((p: any) => p.paymentStatus === "REFUNDED"),
    "Expected all Ledger participants to have paymentStatus=REFUNDED"
  );
  console.log(
    `🗄️  Database / Ledger Verified: Match ${refundedMatchId} is CANCELLED_REFUNDED and all 3 participants have paymentStatus = REFUNDED.`
  );
}

async function main() {
  console.log("🚀 Starting GullyQuiz QR Phase 5 End-to-End Multiplayer Simulation...");
  const runtime = await createSimulationRuntime();

  try {
    await runSixPlayerMatchSimulation(runtime);
    await runThreePlayerRefundSimulation(runtime);

    console.log("\n================================================================================");
    console.log("🎉 ALL PHASE 5 END-TO-END MULTIPLAYER SIMULATIONS PASSED WITH ZERO ERRORS!");
    console.log("================================================================================\n");
  } finally {
    await runtime.cleanup();
    await prisma.$disconnect().catch(() => {});
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Simulation failed:", err);
  process.exit(1);
});
