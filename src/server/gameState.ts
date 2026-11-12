import { Server, Socket } from "socket.io";
import prisma from "../lib/prisma";
import {
  calculatePotBreakdown,
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
  questions: InternalQuestion[];
  currentQuestionIndex: number;
  questionStartTime: number;
  questionTimer?: NodeJS.Timeout;
  intermissionTimer?: NodeJS.Timeout;
  countdownTimer?: NodeJS.Timeout;
  countdownSeconds: number;
}

export class GameEngine {
  private io: AppServer;
  private sessions: Map<string, ActiveShopSession> = new Map(); // shopCode -> session

  constructor(io: AppServer) {
    this.io = io;
  }

  public async getOrCreateSession(shopCode: string): Promise<ActiveShopSession | null> {
    const existing = this.sessions.get(shopCode);
    if (existing) {
      return existing;
    }

    const shop = await prisma.shop.findUnique({
      where: { shopCode },
    });

    if (!shop || !shop.isActive) {
      return null;
    }

    // Find or create an open match for this shop
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

    const session: ActiveShopSession = {
      shopId: shop.id,
      shopCode: shop.shopCode,
      shopName: shop.name,
      currentPin: shop.currentPin,
      pinExpiresAt: shop.pinExpiresAt,
      matchId: activeMatch.id,
      stage: "WAITING_FOR_PLAYERS",
      players: new Map(),
      questions: [],
      currentQuestionIndex: -1,
      questionStartTime: 0,
      countdownSeconds: 0,
    };

    this.sessions.set(shopCode, session);
    return session;
  }

  public getLobbySnapshot(session: ActiveShopSession): ShopLobbyState {
    const playersList = Array.from(session.players.values());
    const pot = calculatePotBreakdown(playersList.length, 1000);

    let activeQuestion: SanitizedQuestion | undefined = undefined;
    if (
      session.stage === "QUESTION_ACTIVE" &&
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
      currentQuestionIndex: session.currentQuestionIndex,
      totalQuestions: session.questions.length || 5,
      countdownSeconds: session.countdownSeconds,
      activeQuestion,
      pot,
    };
  }

  public broadcastLobbyState(session: ActiveShopSession) {
    const snapshot = this.getLobbySnapshot(session);
    this.io.to(session.shopCode).emit("lobby_state_update", snapshot);
  }

  public async handleJoinLobby(
    socket: AppSocket,
    payload: { shopCode: string; pin: string; phone: string; displayName: string }
  ) {
    const { shopCode, pin, phone, displayName } = payload;

    const shop = await prisma.shop.findUnique({
      where: { shopCode },
    });

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

    // Find or create Player in DB
    const player = await prisma.player.upsert({
      where: { phone },
      update: { displayName },
      create: {
        phone,
        displayName: displayName || "GullyPlayer",
        totalMatches: 0,
        totalWinningsPaise: 0,
      },
    });

    const session = await this.getOrCreateSession(shopCode);
    if (!session) {
      socket.emit("error_message", {
        code: "SESSION_ERROR",
        message: "Could not create or retrieve arena session.",
      });
      return;
    }

    if (session.stage !== "WAITING_FOR_PLAYERS" && session.stage !== "LOBBY_COUNTDOWN") {
      socket.emit("error_message", {
        code: "MATCH_IN_PROGRESS",
        message: "A match is currently in progress. Please wait for the next round!",
      });
      return;
    }

    // Join Socket.io room
    socket.join(shopCode);
    socket.data.playerId = player.id;
    socket.data.displayName = player.displayName;
    socket.data.shopCode = shopCode;

    // Register participant
    const participant: ActiveMatchParticipant = {
      playerId: player.id,
      socketId: socket.id,
      displayName: player.displayName,
      phone: player.phone,
      score: 0,
      cumulativeResponseMs: 0,
      answers: [],
    };

    session.players.set(socket.id, participant);

    // Save participation in DB
    await prisma.matchParticipant.upsert({
      where: {
        matchId_playerId: {
          matchId: session.matchId,
          playerId: player.id,
        },
      },
      update: {
        paymentStatus: "PAID",
      },
      create: {
        matchId: session.matchId,
        playerId: player.id,
        paymentStatus: "PAID",
      },
    });

    console.log(
      `[GameEngine] Player "${player.displayName}" joined lobby for shop ${shopCode}. Total: ${session.players.size}`
    );

    this.broadcastLobbyState(session);

    // Auto-start countdown if 2 or more players join
    if (session.players.size >= 2 && session.stage === "WAITING_FOR_PLAYERS") {
      this.startLobbyCountdown(session);
    }
  }

  public startLobbyCountdown(session: ActiveShopSession) {
    if (session.countdownTimer) {
      clearInterval(session.countdownTimer);
    }

    session.stage = "LOBBY_COUNTDOWN";
    session.countdownSeconds = 5; // 5-second countdown to prepare players

    this.broadcastLobbyState(session);

    session.countdownTimer = setInterval(async () => {
      session.countdownSeconds -= 1;

      this.io.to(session.shopCode).emit("match_countdown", {
        secondsRemaining: session.countdownSeconds,
      });

      if (session.countdownSeconds <= 0) {
        if (session.countdownTimer) clearInterval(session.countdownTimer);
        session.countdownTimer = undefined;
        await this.startMatch(session);
      }
    }, 1000);
  }

  public async startMatch(session: ActiveShopSession) {
    if (session.players.size === 0) {
      session.stage = "WAITING_FOR_PLAYERS";
      this.broadcastLobbyState(session);
      return;
    }

    console.log(`[GameEngine] Starting match ${session.matchId} for shop ${session.shopCode}`);

    // Update match status in DB to IN_PROGRESS
    const playerCount = session.players.size;
    const pot = calculatePotBreakdown(playerCount, 1000);

    await prisma.match.update({
      where: { id: session.matchId },
      data: {
        status: "IN_PROGRESS",
        startedAt: new Date(),
        totalPotPaise: pot.totalPotPaise,
        prizePoolPaise: pot.winnerPrizePoolPaise,
        vendorSharePaise: pot.vendorSharePaise,
        platformSharePaise: pot.platformSharePaise,
      },
    });

    // Fetch 5 random active questions from DB
    const dbQuestions = await prisma.question.findMany({
      where: { isActive: true },
      take: 20,
    });

    // Shuffle and pick 5
    const shuffled = dbQuestions.sort(() => 0.5 - Math.random()).slice(0, 5);

    session.questions = shuffled.map((q) => {
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

    session.currentQuestionIndex = -1;
    this.nextQuestion(session);
  }

  private nextQuestion(session: ActiveShopSession) {
    session.currentQuestionIndex += 1;

    if (session.currentQuestionIndex >= session.questions.length) {
      this.finishMatch(session);
      return;
    }

    const currentQ = session.questions[session.currentQuestionIndex];
    session.stage = "QUESTION_ACTIVE";
    session.questionStartTime = Date.now();

    const sanitized: SanitizedQuestion = {
      id: currentQ.id,
      category: currentQ.category,
      questionText: currentQ.questionText,
      options: currentQ.options,
    };

    this.broadcastLobbyState(session);

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

    const elapsedMs = Math.min(10000, Math.max(50, Date.now() - session.questionStartTime));
    const currentQ = session.questions[session.currentQuestionIndex];
    const isCorrect = payload.selectedOptionIndex === currentQ.correctOptionIndex;

    let pointsAwarded = 0;
    if (isCorrect) {
      // Speed bonus: 100 base + up to 100 speed bonus for sub-10s response
      const speedBonus = Math.floor((10000 - elapsedMs) / 100);
      pointsAwarded = 100 + Math.max(0, speedBonus);
    }

    participant.score += pointsAwarded;
    participant.cumulativeResponseMs += elapsedMs;
    participant.answers.push({
      questionIndex: payload.questionIndex,
      selectedOption: payload.selectedOptionIndex,
      responseMs: elapsedMs,
      isCorrect,
    });

    // If all active players answered, trigger early question end
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

    this.io.to(session.shopCode).emit("question_ended", {
      questionIndex: session.currentQuestionIndex,
      correctOptionIndex: currentQ.correctOptionIndex,
      leaderboard,
    });

    this.broadcastLobbyState(session);

    // 3-second intermission before next question
    session.intermissionTimer = setTimeout(() => {
      this.nextQuestion(session);
    }, 3000);
  }

  private computeLeaderboard(session: ActiveShopSession): PlayerScoreSummary[] {
    const list: PlayerScoreSummary[] = Array.from(session.players.values()).map((p) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      score: p.score,
      cumulativeResponseMs: p.cumulativeResponseMs,
    }));

    // Sort by highest score; break ties by lowest cumulative response time
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

  private async finishMatch(session: ActiveShopSession) {
    session.stage = "MATCH_FINISHED";
    const leaderboard = this.computeLeaderboard(session);
    const winnerSummary = leaderboard.length > 0 ? leaderboard[0] : null;

    const pot = calculatePotBreakdown(session.players.size, 1000);

    console.log(
      `[GameEngine] Match ${session.matchId} finished. Winner: ${
        winnerSummary?.displayName || "None"
      }`
    );

    // Persist final match settlement atomically via Prisma transaction
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
          },
        });

        // 2. Update all participants' scores & response times
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

        // 3. Credit vendor unsettled balance
        await tx.shop.update({
          where: { id: session.shopId },
          data: {
            unsettledBalancePaise: { increment: pot.vendorSharePaise },
          },
        });
      });
    } catch (err) {
      console.error("[GameEngine] Database transaction settlement error:", err);
    }

    const updatedShop = await prisma.shop.findUnique({
      where: { id: session.shopId },
    });

    this.io.to(session.shopCode).emit("match_completed", {
      winner: winnerSummary,
      finalLeaderboard: leaderboard,
      pot,
      vendorBalancePaise: updatedShop?.unsettledBalancePaise || 0,
    });

    this.broadcastLobbyState(session);

    // Reset session for the next match after 10 seconds
    setTimeout(async () => {
      this.sessions.delete(session.shopCode);
      const newSession = await this.getOrCreateSession(session.shopCode);
      if (newSession) {
        this.broadcastLobbyState(newSession);
      }
    }, 10000);
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

    if (session.stage === "WAITING_FOR_PLAYERS" || session.stage === "LOBBY_COUNTDOWN") {
      if (session.players.size < 2 && session.countdownTimer) {
        clearInterval(session.countdownTimer);
        session.countdownTimer = undefined;
        session.stage = "WAITING_FOR_PLAYERS";
        session.countdownSeconds = 0;
      }
      this.broadcastLobbyState(session);
    }
  }

  public async forceStartMatch(shopCode: string, pin: string): Promise<boolean> {
    const session = await this.getOrCreateSession(shopCode);
    if (!session) return false;
    if (session.currentPin !== pin) return false;

    if (session.stage === "WAITING_FOR_PLAYERS" && session.players.size > 0) {
      this.startLobbyCountdown(session);
      return true;
    }
    return false;
  }
}
