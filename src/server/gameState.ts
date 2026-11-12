import { Server, Socket } from "socket.io";
import prisma from "../lib/prisma";
import { PILOT_SHOPS, getPilotShopFallback } from "../lib/pilotShops";
import { CURATED_QUESTIONS } from "../lib/curatedQuestions";
import { upsertInMemoryMatch, IN_MEMORY_MATCHES } from "../lib/inMemoryStore";
import { getPaymentService } from "./services/paymentService";
import {
  calculatePotBreakdown,
  calculateSpeedPoints,
  ActiveMatchParticipant,
  PlayerScoreSummary,
  SanitizedQuestion,
  ShopLobbyState,
} from "../lib/types";
import {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "./events";

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

interface InternalQuestion {
  id: string;
  category: string;
  questionText: string;
  options: string[];
  correctOptionIndex: number;
}

interface ActiveShopSession {
  shopId: string;
  shopCode: string;
  shopName: string;
  currentPin: string;
  pinExpiresAt: Date;
  matchId: string;
  stage: ShopLobbyState["stage"];
  players: Map<string, ActiveMatchParticipant>; // socketId -> participant
  lobbyClosesAt: Date | null;
  lobbyTicker?: NodeJS.Timeout;
  secondsRemaining: number;
  getReadyTicker?: NodeJS.Timeout;
  questions: InternalQuestion[];
  currentQuestionIndex: number;
  questionStartTime: number;
  questionTimer?: NodeJS.Timeout;
  intermissionTimer?: NodeJS.Timeout;
  refundInfo?: {
    reason: string;
    refundedAmountPaise: number;
    participantsRefunded: number;
  };
  winner?: {
    playerId: string;
    displayName: string;
    score: number;
    cumulativeResponseMs: number;
    prizePaise: number;
    upiId?: string;
    payoutId?: string;
  };
}

export class GameEngine {
  private io: AppServer;
  private sessions: Map<string, ActiveShopSession> = new Map(); // shopCode -> session
  private pendingSessions: Map<string, Promise<ActiveShopSession | null>> = new Map();

  constructor(io: AppServer) {
    this.io = io;
  }

  public async getOrCreateSession(shopCode: string): Promise<ActiveShopSession | null> {
    const cleanShopCode = shopCode.trim().toUpperCase();

    const existing = this.sessions.get(cleanShopCode);
    if (existing) {
      const fallback = getPilotShopFallback(cleanShopCode);
      if (fallback) {
        existing.currentPin = fallback.currentPin;
        existing.pinExpiresAt = new Date(fallback.pinExpiresAt);
      }
      return existing;
    }

    const inflight = this.pendingSessions.get(cleanShopCode);
    if (inflight) {
      return inflight;
    }

    const createPromise = this.createSessionInternal(cleanShopCode).finally(() => {
      this.pendingSessions.delete(cleanShopCode);
    });
    this.pendingSessions.set(cleanShopCode, createPromise);
    return createPromise;
  }

  private async createSessionInternal(cleanShopCode: string): Promise<ActiveShopSession | null> {
    let shop: {
      id: string;
      shopCode: string;
      name: string;
      currentPin: string;
      pinExpiresAt: Date;
      isActive: boolean;
    } | null = null;

    try {
      shop = await prisma.shop.findUnique({
        where: { shopCode: cleanShopCode },
      });
    } catch {
      const fallback = getPilotShopFallback(cleanShopCode);
      if (fallback) {
        shop = {
          ...fallback,
          pinExpiresAt: new Date(fallback.pinExpiresAt),
        };
      }
    }

    if (!shop || !shop.isActive) {
      return null;
    }

    const existingAfterAwait = this.sessions.get(cleanShopCode);
    if (existingAfterAwait) {
      existingAfterAwait.currentPin = shop.currentPin;
      existingAfterAwait.pinExpiresAt = shop.pinExpiresAt;
      return existingAfterAwait;
    }

    // Find or create an open match for this shop
    let activeMatchId = `match_${cleanShopCode}_${Date.now()}`;
    try {
      let activeMatch = await prisma.match.findFirst({
        where: {
          shopId: shop.id,
          status: "LOBBY_OPEN",
        },
        orderBy: { createdAt: "desc" },
      });

      if (!activeMatch) {
        activeMatch = await prisma.match.create({
          data: {
            shopId: shop.id,
            status: "LOBBY_OPEN",
            entryFeePaise: 1000, // ₹10.00
          },
        });
      }
      activeMatchId = activeMatch.id;
    } catch (e) {
      console.warn("DB match find/create skipped, using activeMatchId:", e);
    }

    const session: ActiveShopSession = {
      shopId: shop.id,
      shopCode: shop.shopCode,
      shopName: shop.name,
      currentPin: shop.currentPin,
      pinExpiresAt: shop.pinExpiresAt,
      matchId: activeMatchId,
      stage: "WAITING_FOR_PLAYERS",
      players: new Map(),
      lobbyClosesAt: null,
      secondsRemaining: 60,
      questions: [],
      currentQuestionIndex: -1,
      questionStartTime: 0,
    };

    this.sessions.set(cleanShopCode, session);
    return session;
  }

  private syncInMemoryLedger(
    session: ActiveShopSession,
    status: "LOBBY_OPEN" | "IN_PROGRESS" | "COMPLETED_SETTLED" | "CANCELLED_REFUNDED",
    extra?: {
      payoutReferenceId?: string | null;
      startedAt?: string | null;
      endedAt?: string | null;
      refunded?: boolean;
    }
  ) {
    const existing = IN_MEMORY_MATCHES.get(session.matchId);
    const playersList = Array.from(session.players.values());
    const pot = calculatePotBreakdown(playersList.length, 1000);

    upsertInMemoryMatch({
      id: session.matchId,
      shopId: session.shopId,
      shopCode: session.shopCode,
      shopName: session.shopName,
      status,
      entryFeePaise: 1000,
      totalPotPaise: status === "CANCELLED_REFUNDED" ? 0 : pot.totalPotPaise,
      prizePoolPaise: status === "CANCELLED_REFUNDED" ? 0 : pot.winnerPrizePoolPaise,
      vendorSharePaise: status === "CANCELLED_REFUNDED" ? 0 : pot.vendorSharePaise,
      platformSharePaise: status === "CANCELLED_REFUNDED" ? 0 : pot.platformSharePaise,
      winnerPlayerId: session.winner?.playerId || null,
      winnerDisplayName: session.winner?.displayName || null,
      winnerPhone:
        playersList.find((p) => p.playerId === session.winner?.playerId)?.phone || null,
      winnerUpiId: session.winner?.upiId || null,
      payoutReferenceId: extra?.payoutReferenceId ?? session.winner?.payoutId ?? existing?.payoutReferenceId ?? null,
      lobbyClosesAt: session.lobbyClosesAt ? session.lobbyClosesAt.toISOString() : null,
      startedAt: extra?.startedAt ?? existing?.startedAt ?? null,
      endedAt: extra?.endedAt ?? existing?.endedAt ?? null,
      createdAt: existing?.createdAt || new Date().toISOString(),
      participants: playersList.map((p) => ({
        playerId: p.playerId,
        displayName: p.displayName,
        phone: p.phone,
        upiId: p.upiId,
        paymentOrderId: p.paymentOrderId,
        paymentStatus: extra?.refunded ? "REFUNDED" : "PAID",
        score: p.score,
        cumulativeResponseMs: p.cumulativeResponseMs,
      })),
    });
  }

  public getLobbySnapshot(session: ActiveShopSession): ShopLobbyState {
    const playersList = Array.from(session.players.values());
    const playerCount = playersList.length;
    const pot = calculatePotBreakdown(playerCount, 1000);
    const currentPrizePoolPaise = pot.winnerPrizePoolPaise;

    let activeQuestion: SanitizedQuestion | undefined = undefined;
    if (
      (session.stage === "QUESTION_ACTIVE" || session.stage === "QUESTION_INTERMISSION") &&
      session.currentQuestionIndex >= 0 &&
      session.currentQuestionIndex < session.questions.length
    ) {
      const q = session.questions[session.currentQuestionIndex];
      activeQuestion = {
        id: q.id,
        category: q.category,
        questionText: q.questionText,
        options: q.options,
      };
    }

    return {
      shopId: session.shopId,
      shopCode: session.shopCode,
      shopName: session.shopName,
      matchId: session.matchId,
      stage: session.stage,
      currentPin: session.currentPin,
      pinExpiresAt: session.pinExpiresAt.toISOString(),
      entryFeePaise: 1000,
      players: playersList,
      playerCount,
      currentPrizePoolPaise,
      secondsRemaining: session.secondsRemaining,
      lobbyClosesAt: session.lobbyClosesAt ? session.lobbyClosesAt.toISOString() : null,
      currentQuestionIndex: session.currentQuestionIndex,
      totalQuestions: session.questions.length || 9,
      activeQuestion,
      pot,
      refundInfo: session.refundInfo,
      winner: session.winner,
    };
  }

  public broadcastLobbyState(session: ActiveShopSession) {
    const snapshot = this.getLobbySnapshot(session);
    this.io.to(session.shopCode).emit("match:lobby_update", snapshot);
    this.io.to(session.shopCode).emit("lobby_state_update", snapshot);
  }

  /**
   * 1. Matchmaking Lobby: Scoped per shopId.
   * When Player 1 pays and joins, open new Match with 60s countdown timer.
   * Cap Rule: Max 10 players.
   * Min Rule: If <4 players after 60s, CANCELLED_REFUNDED.
   */
  public async handleJoinLobby(
    socket: AppSocket,
    payload: {
      shopCode: string;
      pin: string;
      phone: string;
      displayName: string;
      upiId?: string;
      paymentOrderId?: string;
      lobbyDurationSeconds?: number;
    }
  ) {
    const { shopCode, pin, phone, displayName, upiId, paymentOrderId, lobbyDurationSeconds } = payload;
    const cleanShopCode = shopCode.trim().toUpperCase();

    let shop: {
      id: string;
      shopCode: string;
      name: string;
      currentPin: string;
      pinExpiresAt: Date;
      isActive: boolean;
    } | null = null;

    try {
      shop = await prisma.shop.findUnique({
        where: { shopCode: cleanShopCode },
      });
    } catch {
      const fallback = getPilotShopFallback(cleanShopCode);
      if (fallback) {
        shop = { ...fallback, pinExpiresAt: new Date(fallback.pinExpiresAt) };
      }
    }

    if (!shop || !shop.isActive) {
      socket.emit("error_message", {
        code: "INVALID_SHOP",
        message: "Shop code not found or inactive. Please scan a valid shop QR code.",
      });
      return;
    }

    // Verify 4-digit PIN and expiry
    if (shop.currentPin !== pin) {
      socket.emit("error_message", {
        code: "INVALID_PIN",
        message: "Invalid shop PIN. Please verify the 4-digit code shown at the counter.",
      });
      return;
    }

    if (new Date() > new Date(shop.pinExpiresAt)) {
      socket.emit("error_message", {
        code: "EXPIRED_PIN",
        message: "This shop PIN has expired. Ask the vendor to refresh their daily PIN.",
      });
      return;
    }

    const session = await this.getOrCreateSession(cleanShopCode);
    if (!session) {
      socket.emit("error_message", {
        code: "SESSION_ERROR",
        message: "Could not create or retrieve arena session.",
      });
      return;
    }

    // Cap Rule: Maximum 10 players per lobby
    if (session.players.size >= 10) {
      socket.emit("error_message", {
        code: "LOBBY_FULL",
        message: "Match lobby has reached maximum 10-player capacity. Please wait for the next 90s round!",
      });
      return;
    }

    if (
      session.stage !== "WAITING_FOR_PLAYERS" &&
      session.stage !== "LOBBY_OPEN" &&
      session.stage !== "LOBBY_COUNTDOWN"
    ) {
      socket.emit("error_message", {
        code: "MATCH_IN_PROGRESS",
        message: "A speed match is currently in progress. Please wait for the next round!",
      });
      return;
    }

    // Find or create Player in DB
    let player = {
      id: `player_${phone.replace(/\D/g, "")}`,
      displayName: displayName || "GullyPlayer",
      phone,
      upiId: upiId || `${phone}@upi`,
    };

    try {
      const dbPlayer = await prisma.player.upsert({
        where: { phone },
        update: {
          displayName,
          upiId: upiId || undefined,
        },
        create: {
          phone,
          displayName: displayName || "GullyPlayer",
          upiId: upiId || `${phone}@upi`,
          totalMatches: 0,
          totalWinningsPaise: 0,
        },
      });
      player = {
        id: dbPlayer.id,
        displayName: dbPlayer.displayName,
        phone: dbPlayer.phone,
        upiId: dbPlayer.upiId || `${phone}@upi`,
      };
    } catch (e) {
      console.warn("DB player upsert skipped:", e);
    }

    // Join Socket.io room
    socket.join(cleanShopCode);
    socket.data.playerId = player.id;
    socket.data.displayName = player.displayName;
    socket.data.phone = player.phone;
    socket.data.upiId = player.upiId;
    socket.data.shopCode = cleanShopCode;

    // Register participant
    const participant: ActiveMatchParticipant = {
      playerId: player.id,
      socketId: socket.id,
      displayName: player.displayName,
      phone: player.phone,
      upiId: player.upiId,
      paymentOrderId,
      score: 0,
      cumulativeResponseMs: 0,
      answers: [],
    };

    session.players.set(socket.id, participant);

    // Save participation in DB
    try {
      await prisma.matchParticipant.upsert({
        where: {
          matchId_playerId: {
            matchId: session.matchId,
            playerId: player.id,
          },
        },
        update: {
          paymentStatus: "PAID",
          paymentOrderId,
        },
        create: {
          matchId: session.matchId,
          playerId: player.id,
          paymentStatus: "PAID",
          paymentOrderId,
        },
      });
    } catch (e) {
      console.warn("DB participant upsert skipped:", e);
    }

    console.log(
      `[GameEngine] Player "${player.displayName}" joined lobby for shop ${cleanShopCode}. Total: ${session.players.size}/10`
    );

    // When Player 1 pays and joins: open new Match with 60-second countdown timer
    if (session.players.size >= 1 && session.stage === "WAITING_FOR_PLAYERS") {
      this.start60SecondLobby(session, lobbyDurationSeconds);
    } else {
      this.syncInMemoryLedger(session, "LOBBY_OPEN");
      this.broadcastLobbyState(session);
    }

    // Cap Rule: If 10 players join before 60 seconds, lock immediately and start 5-second countdown!
    if (session.players.size >= 10) {
      console.log(`[GameEngine] 10-player cap reached for shop ${cleanShopCode}! Locking lobby.`);
      if (session.lobbyTicker) {
        clearInterval(session.lobbyTicker);
        session.lobbyTicker = undefined;
      }
      this.startGetReadyCountdown(session);
    }
  }

  /**
   * Starts the 60-second countdown for the matchmaking lobby.
   */
  public start60SecondLobby(session: ActiveShopSession, customDurationSeconds?: number) {
    if (session.lobbyTicker) {
      clearInterval(session.lobbyTicker);
    }

    const durationSec =
      typeof customDurationSeconds === "number" && customDurationSeconds >= 2 && customDurationSeconds <= 60
        ? Math.floor(customDurationSeconds)
        : 60;

    session.stage = "LOBBY_OPEN";
    session.secondsRemaining = durationSec;
    session.lobbyClosesAt = new Date(Date.now() + durationSec * 1000);

    // Update match record with lobbyClosesAt
    prisma.match
      .update({
        where: { id: session.matchId },
        data: {
          status: "LOBBY_OPEN",
          lobbyClosesAt: session.lobbyClosesAt,
        },
      })
      .catch((e) => console.warn("Match lobbyClosesAt update skipped:", e));

    this.syncInMemoryLedger(session, "LOBBY_OPEN");
    this.broadcastLobbyState(session);

    session.lobbyTicker = setInterval(async () => {
      session.secondsRemaining -= 1;
      this.broadcastLobbyState(session);

      if (session.secondsRemaining <= 0) {
        if (session.lobbyTicker) {
          clearInterval(session.lobbyTicker);
          session.lobbyTicker = undefined;
        }

        const playerCount = session.players.size;
        console.log(
          `[GameEngine] 60-second lobby expired for ${session.shopCode}. Player count: ${playerCount}`
        );

        // Minimum Player & Refund Rule:
        // If playerCount < 4: CANCELLED_REFUNDED and refund ₹10 to every participant
        if (playerCount < 4) {
          await this.handleLobbyCancellation(session);
        } else {
          // If playerCount >= 4: Lock lobby and start match!
          this.startGetReadyCountdown(session);
        }
      }
    }, 1000);
  }

  /**
   * Handles lobby cancellation when < 4 players joined within 60s.
   * Calls paymentService.refundParticipant() for every participant and emits match:cancelled_refunded.
   */
  public async handleLobbyCancellation(session: ActiveShopSession) {
    session.stage = "CANCELLED_REFUNDED";
    const paymentService = getPaymentService();
    const participantsList = Array.from(session.players.values());

    console.log(
      `[GameEngine] ⚠️ Cancelling match ${session.matchId}: <4 players joined (${participantsList.length}). Initiating ₹10 refunds.`
    );

    // Process refunds for every participant
    for (const p of participantsList) {
      await paymentService.refundParticipant({
        paymentOrderId: p.paymentOrderId,
        playerId: p.playerId,
        phone: p.phone,
        upiId: p.upiId,
        amountPaise: 1000,
        reason: "GullyQuiz lobby cancelled: minimum 4 players required",
      });

      // Update participant in DB if available
      prisma.matchParticipant
        .update({
          where: {
            matchId_playerId: {
              matchId: session.matchId,
              playerId: p.playerId,
            },
          },
          data: { paymentStatus: "REFUNDED" },
        })
        .catch(() => {});
    }

    // Update match status to CANCELLED_REFUNDED
    prisma.match
      .update({
        where: { id: session.matchId },
        data: {
          status: "CANCELLED_REFUNDED",
          endedAt: new Date(),
        },
      })
      .catch(() => {});

    session.refundInfo = {
      reason: "Minimum 4 players required for speed arena. Your ₹10 entry has been refunded.",
      refundedAmountPaise: 1000,
      participantsRefunded: participantsList.length,
    };

    this.syncInMemoryLedger(session, "CANCELLED_REFUNDED", {
      endedAt: new Date().toISOString(),
      refunded: true,
    });

    // Emit event to inform clients their ₹10 was refunded
    this.io.to(session.shopCode).emit("match:cancelled_refunded", {
      matchId: session.matchId,
      reason: "Minimum 4 players required. Your ₹10 entry has been automatically refunded to your UPI account.",
      refundedAmountPaise: 1000,
      participantsRefunded: participantsList.length,
    });

    this.broadcastLobbyState(session);

    // Reopen fresh lobby after 8 seconds
    setTimeout(async () => {
      this.sessions.delete(session.shopCode);
      const newSession = await this.getOrCreateSession(session.shopCode);
      if (newSession) {
        this.broadcastLobbyState(newSession);
      }
    }, 8000);
  }

  /**
   * 5-Second "Get Ready" countdown before 90-second speed quiz starts.
   */
  public startGetReadyCountdown(session: ActiveShopSession) {
    if (session.getReadyTicker) {
      clearInterval(session.getReadyTicker);
    }

    session.stage = "GET_READY";
    let readySeconds = 5;
    session.secondsRemaining = readySeconds;

    this.io.to(session.shopCode).emit("match:get_ready", { secondsRemaining: readySeconds });
    this.io.to(session.shopCode).emit("match_countdown", { secondsRemaining: readySeconds });
    this.broadcastLobbyState(session);

    session.getReadyTicker = setInterval(async () => {
      readySeconds -= 1;
      session.secondsRemaining = readySeconds;

      this.io.to(session.shopCode).emit("match:get_ready", { secondsRemaining: readySeconds });
      this.io.to(session.shopCode).emit("match_countdown", { secondsRemaining: readySeconds });
      this.broadcastLobbyState(session);

      if (readySeconds <= 0) {
        if (session.getReadyTicker) {
          clearInterval(session.getReadyTicker);
          session.getReadyTicker = undefined;
        }
        await this.startMatch(session);
      }
    }, 1000);
  }

  /**
   * 2. 90-Second Synchronous Quiz (IN_PROGRESS):
   * Selects 9 random active questions. Broadcasts 1 question every 10 seconds.
   * 9 questions * 10 seconds = 90 seconds total!
   */
  public async startMatch(session: ActiveShopSession) {
    if (session.players.size === 0) {
      session.stage = "WAITING_FOR_PLAYERS";
      this.broadcastLobbyState(session);
      return;
    }

    console.log(
      `[GameEngine] Starting 90-second synchronous speed quiz for match ${session.matchId} (${session.shopCode}) with ${session.players.size} players`
    );

    const playerCount = session.players.size;
    const pot = calculatePotBreakdown(playerCount, 1000);

    // Update match status in DB
    const startedAtIso = new Date().toISOString();
    try {
      await prisma.match.update({
        where: { id: session.matchId },
        data: {
          status: "IN_PROGRESS",
          startedAt: new Date(startedAtIso),
          totalPotPaise: pot.totalPotPaise,
          prizePoolPaise: pot.winnerPrizePoolPaise,
          vendorSharePaise: pot.vendorSharePaise,
          platformSharePaise: pot.platformSharePaise,
        },
      });
    } catch (e) {
      console.warn("DB match status update skipped:", e);
    }

    this.syncInMemoryLedger(session, "IN_PROGRESS", { startedAt: startedAtIso });

    // Select 9 random active questions from PostgreSQL (or curated questions)
    let fetchedQuestions: InternalQuestion[] = [];
    try {
      const dbQuestions = await prisma.question.findMany({
        where: { isActive: true },
        take: 30,
      });

      if (dbQuestions && dbQuestions.length >= 9) {
        const shuffled = dbQuestions.sort(() => 0.5 - Math.random()).slice(0, 9);
        fetchedQuestions = shuffled.map((q) => {
          let parsedOptions: string[] = [];
          if (Array.isArray(q.options)) {
            parsedOptions = q.options as string[];
          } else if (typeof q.options === "string") {
            try {
              parsedOptions = JSON.parse(q.options);
            } catch {
              parsedOptions = ["A", "B", "C", "D"];
            }
          }
          return {
            id: q.id,
            category: q.category,
            questionText: q.questionText,
            options: parsedOptions,
            correctOptionIndex: q.correctOptionIndex,
          };
        });
      }
    } catch (e) {
      console.warn("DB questions fetch skipped, using curated questions:", e);
    }

    if (fetchedQuestions.length < 9) {
      // Pick 9 from active curated questions
      const activeCurated = CURATED_QUESTIONS.filter((q) => q.isActive !== false);
      const sourcePool = activeCurated.length >= 9 ? activeCurated : CURATED_QUESTIONS;
      const shuffledCurated = [...sourcePool].sort(() => 0.5 - Math.random()).slice(0, 9);
      fetchedQuestions = shuffledCurated.map((q) => ({
        id: q.id,
        category: q.category,
        questionText: q.questionText,
        options: [...q.options],
        correctOptionIndex: q.correctOptionIndex,
      }));
    }

    session.questions = fetchedQuestions;
    session.currentQuestionIndex = -1;
    this.nextQuestion(session);
  }

  private nextQuestion(session: ActiveShopSession) {
    session.currentQuestionIndex += 1;

    // 9 questions finished: transition to COMPLETED_SETTLED
    if (session.currentQuestionIndex >= session.questions.length) {
      this.finishMatch(session);
      return;
    }

    const currentQ = session.questions[session.currentQuestionIndex];
    session.stage = "QUESTION_ACTIVE";
    session.questionStartTime = Date.now();

    // Do NOT send correctOptionIndex to client!
    const sanitized: SanitizedQuestion = {
      id: currentQ.id,
      category: currentQ.category,
      questionText: currentQ.questionText,
      options: currentQ.options,
    };

    this.broadcastLobbyState(session);

    // Broadcast 1 question every 10 seconds
    this.io.to(session.shopCode).emit("quiz:question", {
      questionIndex: session.currentQuestionIndex,
      totalQuestions: session.questions.length,
      questionText: currentQ.questionText,
      options: currentQ.options,
      serverTimestamp: session.questionStartTime,
      timeLimitSeconds: 10,
    });

    this.io.to(session.shopCode).emit("question_started", {
      question: sanitized,
      questionIndex: session.currentQuestionIndex,
      totalQuestions: session.questions.length,
      timeLimitSeconds: 10,
      serverStartTime: session.questionStartTime,
    });

    // 10-second timer per question
    session.questionTimer = setTimeout(() => {
      this.endQuestion(session);
    }, 10000);
  }

  /**
   * Server-Authoritative Scoring (quiz:submit_answer):
   * responseTimeMs = Date.now() - questionSentAt (clamped between 0 and 10000)
   * If correct: points = 100 + Math.floor(50 * (1 - responseTimeMs / 10000))
   * If wrong: 0 points
   */
  public handleSubmitAnswer(
    socket: AppSocket,
    payload: {
      shopCode: string;
      matchId: string;
      questionIndex: number;
      selectedOptionIndex: number;
    }
  ) {
    const session = this.sessions.get(payload.shopCode);
    if (!session || session.stage !== "QUESTION_ACTIVE") return;
    if (session.currentQuestionIndex !== payload.questionIndex) return;

    const participant = session.players.get(socket.id);
    if (!participant) return;

    // Check if player already answered this question
    const alreadyAnswered = participant.answers.some(
      (a) => a.questionIndex === payload.questionIndex
    );
    if (alreadyAnswered) return;

    const responseTimeMs = Math.min(
      10000,
      Math.max(0, Date.now() - session.questionStartTime)
    );
    const currentQ = session.questions[session.currentQuestionIndex];
    const isCorrect = payload.selectedOptionIndex === currentQ.correctOptionIndex;

    const pointsAwarded = calculateSpeedPoints(isCorrect, responseTimeMs);

    participant.score += pointsAwarded;
    participant.cumulativeResponseMs += responseTimeMs;
    participant.answers.push({
      questionIndex: payload.questionIndex,
      selectedOption: payload.selectedOptionIndex,
      responseMs: responseTimeMs,
      isCorrect,
      points: pointsAwarded,
    });

    // Broadcast live mini-leaderboard update
    const currentLeaderboard = this.computeLeaderboard(session);
    this.io.to(session.shopCode).emit("quiz:leaderboard_update", {
      questionIndex: payload.questionIndex,
      leaderboard: currentLeaderboard,
    });
    this.broadcastLobbyState(session);

    // If all active participants have answered, trigger early question end
    const totalAnswered = Array.from(session.players.values()).filter((p) =>
      p.answers.some((a) => a.questionIndex === payload.questionIndex)
    ).length;

    if (totalAnswered >= session.players.size) {
      if (session.questionTimer) {
        clearTimeout(session.questionTimer);
        session.questionTimer = undefined;
      }
      this.endQuestion(session);
    }
  }

  private endQuestion(session: ActiveShopSession) {
    if (session.questionTimer) {
      clearTimeout(session.questionTimer);
      session.questionTimer = undefined;
    }

    session.stage = "QUESTION_INTERMISSION";
    const currentQ = session.questions[session.currentQuestionIndex];
    const leaderboard = this.computeLeaderboard(session);

    this.io.to(session.shopCode).emit("quiz:question_ended", {
      questionIndex: session.currentQuestionIndex,
      correctOptionIndex: currentQ.correctOptionIndex,
      leaderboard,
    });

    this.io.to(session.shopCode).emit("question_ended", {
      questionIndex: session.currentQuestionIndex,
      correctOptionIndex: currentQ.correctOptionIndex,
      leaderboard,
    });

    this.broadcastLobbyState(session);

    // 2-second intermission between questions
    session.intermissionTimer = setTimeout(() => {
      this.nextQuestion(session);
    }, 2000);
  }

  /**
   * 3. Tie-Breaker:
   * Rank players by score DESC, then fastest hand wins (cumulativeResponseMs ASC).
   */
  private computeLeaderboard(session: ActiveShopSession): PlayerScoreSummary[] {
    const list: PlayerScoreSummary[] = Array.from(session.players.values()).map((p) => {
      const lastAnswer = p.answers.find((a) => a.questionIndex === session.currentQuestionIndex);
      return {
        playerId: p.playerId,
        displayName: p.displayName,
        score: p.score,
        cumulativeResponseMs: p.cumulativeResponseMs,
        lastQuestionPoints: lastAnswer?.points || 0,
        lastQuestionResponseMs: lastAnswer?.responseMs || 0,
        upiId: p.upiId,
      };
    });

    // Rank players by score DESC, then cumulativeResponseMs ASC
    list.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.cumulativeResponseMs - b.cumulativeResponseMs;
    });

    return list.map((item, index) => ({
      ...item,
      rank: index + 1,
    }));
  }

  /**
   * 3. Settlement (COMPLETED_SETTLED):
   * Financial Split:
   * 70% Prize Pool -> paymentService.disbursePrize(winner.upiId, prizePoolPaise)
   * 10% Vendor Commission -> Shop.unsettledBalancePaise
   * 20% Platform Revenue
   * Emits quiz:finished with full podium rankings, response times, and payout result.
   */
  private async finishMatch(session: ActiveShopSession) {
    session.stage = "COMPLETED_SETTLED";
    const leaderboard = this.computeLeaderboard(session);
    const winnerSummary = leaderboard.length > 0 ? leaderboard[0] : null;

    const pot = calculatePotBreakdown(session.players.size, 1000);
    const paymentService = getPaymentService();

    // Trigger instant UPI payout to winner
    let payoutResult = {
      success: true,
      payoutId: `payout_sim_${Date.now()}`,
      amountPaise: pot.winnerPrizePoolPaise,
      upiId: winnerSummary?.upiId || "winner@upi",
    };

    if (winnerSummary && pot.winnerPrizePoolPaise > 0) {
      const targetUpi = winnerSummary.upiId || "winner@upi";
      try {
        payoutResult = await paymentService.disbursePrize(targetUpi, pot.winnerPrizePoolPaise, {
          matchId: session.matchId,
          shopCode: session.shopCode,
        });
      } catch (e) {
        console.error("[GameEngine] Payout disbursement error:", e);
      }
    }

    if (winnerSummary) {
      session.winner = {
        playerId: winnerSummary.playerId,
        displayName: winnerSummary.displayName,
        score: winnerSummary.score,
        cumulativeResponseMs: winnerSummary.cumulativeResponseMs,
        prizePaise: pot.winnerPrizePoolPaise,
        upiId: winnerSummary.upiId,
        payoutId: payoutResult.payoutId,
      };
    }

    console.log(
      `[GameEngine] Match ${session.matchId} completed. Winner: ${
        winnerSummary?.displayName || "None"
      } (₹${pot.winnerPrizePoolPaise / 100} UPI payout), Vendor share: ₹${pot.vendorSharePaise / 100}`
    );

    // Atomically persist to database
    try {
      await prisma.$transaction(async (tx) => {
        // 1. Update Match record
        await tx.match.update({
          where: { id: session.matchId },
          data: {
            status: "COMPLETED_SETTLED",
            endedAt: new Date(),
            winnerPlayerId: winnerSummary?.playerId || null,
            totalPotPaise: pot.totalPotPaise,
            prizePoolPaise: pot.winnerPrizePoolPaise,
            vendorSharePaise: pot.vendorSharePaise,
            platformSharePaise: pot.platformSharePaise,
            payoutReferenceId: payoutResult.payoutId,
          },
        });

        // 2. Update participants
        for (const p of Array.from(session.players.values())) {
          await tx.matchParticipant.update({
            where: {
              matchId_playerId: {
                matchId: session.matchId,
                playerId: p.playerId,
              },
            },
            data: {
              score: p.score,
              cumulativeResponseMs: p.cumulativeResponseMs,
            },
          });

          await tx.player.update({
            where: { id: p.playerId },
            data: {
              totalMatches: { increment: 1 },
              ...(winnerSummary && p.playerId === winnerSummary.playerId
                ? { totalWinningsPaise: { increment: pot.winnerPrizePoolPaise } }
                : {}),
            },
          });
        }

        // 3. Atomically increment Shop.unsettledBalancePaise with 10% vendor commission
        await tx.shop.update({
          where: { id: session.shopId },
          data: {
            unsettledBalancePaise: { increment: pot.vendorSharePaise },
          },
        });
      });
    } catch (err) {
      console.warn("[GameEngine] Database transaction settlement error, updating in-memory shop balance:", err);
      const fallbackShop = PILOT_SHOPS.find((s) => s.shopCode === session.shopCode);
      if (fallbackShop) {
        fallbackShop.unsettledBalancePaise += pot.vendorSharePaise;
      }
    }

    this.syncInMemoryLedger(session, "COMPLETED_SETTLED", {
      payoutReferenceId: payoutResult.payoutId,
      endedAt: new Date().toISOString(),
    });

    // Emit quiz:finished and match_completed
    this.io.to(session.shopCode).emit("quiz:finished", {
      winner: winnerSummary,
      finalLeaderboard: leaderboard,
      pot,
      payoutResult,
      vendorSharePaise: pot.vendorSharePaise,
    });

    this.io.to(session.shopCode).emit("match_completed", {
      winner: winnerSummary,
      finalLeaderboard: leaderboard,
      pot,
      vendorBalancePaise: pot.vendorSharePaise,
    });

    this.broadcastLobbyState(session);

    // Reset session for the next match after 12 seconds
    setTimeout(async () => {
      this.sessions.delete(session.shopCode);
      const newSession = await this.getOrCreateSession(session.shopCode);
      if (newSession) {
        this.broadcastLobbyState(newSession);
      }
    }, 12000);
  }

  public handleDisconnect(socket: AppSocket) {
    const shopCode = socket.data.shopCode;
    if (!shopCode) return;

    const session = this.sessions.get(shopCode);
    if (!session) return;

    session.players.delete(socket.id);
    console.log(
      `[GameEngine] Player disconnected from ${shopCode}. Remaining: ${session.players.size}`
    );

    if (session.stage === "LOBBY_OPEN" || session.stage === "WAITING_FOR_PLAYERS") {
      this.broadcastLobbyState(session);
    }
  }

  public async forceStartMatch(shopCode: string, pin: string): Promise<boolean> {
    const cleanShopCode = shopCode.trim().toUpperCase();
    const session = await this.getOrCreateSession(cleanShopCode);
    if (!session) return false;
    if (session.currentPin !== pin) return false;

    if (
      (session.stage === "WAITING_FOR_PLAYERS" || session.stage === "LOBBY_OPEN") &&
      session.players.size > 0
    ) {
      if (session.lobbyTicker) {
        clearInterval(session.lobbyTicker);
        session.lobbyTicker = undefined;
      }
      this.startGetReadyCountdown(session);
      return true;
    }
    return false;
  }

  /**
   * Helper to manually test the cancellation/refund rule (<4 players).
   */
  public async triggerTestRefund(shopCode: string) {
    const cleanShopCode = shopCode.trim().toUpperCase();
    const session = this.sessions.get(cleanShopCode);
    if (!session) return;

    if (session.lobbyTicker) {
      clearInterval(session.lobbyTicker);
      session.lobbyTicker = undefined;
    }

    await this.handleLobbyCancellation(session);
  }
}
