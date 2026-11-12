export interface PotBreakdown {
  totalPotPaise: number;
  winnerPrizePoolPaise: number;
  vendorSharePaise: number;
  platformSharePaise: number;
}

/**
 * Phase 3 Financial Split:
 * 70% to Match Winner (Prize Pool)
 * 10% to Shop Owner (Vendor Commission)
 * 20% to Platform Infrastructure
 */
export function calculatePotBreakdown(
  playerCount: number,
  entryFeePaise: number = 1000
): PotBreakdown {
  const totalPotPaise = playerCount * entryFeePaise;
  const winnerPrizePoolPaise = Math.floor((totalPotPaise * 70) / 100); // 70%
  const vendorSharePaise = Math.floor((totalPotPaise * 10) / 100);     // 10%
  const platformSharePaise = totalPotPaise - winnerPrizePoolPaise - vendorSharePaise; // 20%

  return {
    totalPotPaise,
    winnerPrizePoolPaise,
    vendorSharePaise,
    platformSharePaise,
  };
}

/**
 * Server-Authoritative Question Scoring Formula:
 * If correct: points = 100 + Math.floor(50 * (1 - responseTimeMs / 10000))
 * If wrong: 0 points
 */
export function calculateSpeedPoints(isCorrect: boolean, responseTimeMs: number): number {
  if (!isCorrect) return 0;
  const clampedMs = Math.min(10000, Math.max(0, responseTimeMs));
  const speedBonus = Math.floor(50 * (1 - clampedMs / 10000));
  return 100 + Math.max(0, speedBonus);
}

/**
 * Formats integer paise into Indian Rupee display string
 * e.g., 1000 -> "₹10.00", 2550 -> "₹25.50"
 */
export function formatPaiseToRupees(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

export interface SanitizedQuestion {
  id: string;
  category: string;
  questionText: string;
  options: string[];
  // correctOptionIndex is NOT exposed to clients during question broadcast to prevent cheating
}

export interface PlayerScoreSummary {
  playerId: string;
  displayName: string;
  score: number;
  cumulativeResponseMs: number;
  rank?: number;
  lastQuestionPoints?: number;
  lastQuestionResponseMs?: number;
  upiId?: string;
}

export interface ActiveMatchParticipant {
  playerId: string;
  socketId: string;
  displayName: string;
  phone: string;
  upiId?: string;
  paymentOrderId?: string;
  score: number;
  cumulativeResponseMs: number;
  lastAnswerTimestamp?: number;
  answers: {
    questionIndex: number;
    selectedOption: number;
    responseMs: number;
    isCorrect: boolean;
    points: number;
  }[];
}

export type MatchStage =
  | "WAITING_FOR_PLAYERS"
  | "LOBBY_OPEN"
  | "LOBBY_COUNTDOWN"
  | "GET_READY"
  | "IN_PROGRESS"
  | "QUESTION_ACTIVE"
  | "QUESTION_INTERMISSION"
  | "COMPLETED_SETTLED"
  | "MATCH_FINISHED"
  | "CANCELLED_REFUNDED";

export interface ShopLobbyState {
  shopId: string;
  shopCode: string;
  shopName: string;
  matchId: string;
  stage: MatchStage;
  currentPin: string;
  pinExpiresAt: string;
  entryFeePaise: number;
  players: ActiveMatchParticipant[];
  playerCount: number;
  currentPrizePoolPaise: number;
  secondsRemaining: number;
  lobbyClosesAt: string | null;
  currentQuestionIndex: number;
  totalQuestions: number;
  activeQuestion?: SanitizedQuestion;
  pot: PotBreakdown;
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
