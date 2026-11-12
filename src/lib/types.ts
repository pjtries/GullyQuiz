export interface PotBreakdown {
  totalPotPaise: number;
  winnerPrizePoolPaise: number;
  vendorSharePaise: number;
  platformSharePaise: number;
}

/**
 * Calculates zero-CapEx revenue splits:
 * 70% to Match Winner
 * 20% to Shop Owner (Vendor)
 * 10% to Platform Infrastructure
 */
export function calculatePotBreakdown(
  playerCount: number,
  entryFeePaise: number = 1000
): PotBreakdown {
  const totalPotPaise = playerCount * entryFeePaise;
  const winnerPrizePoolPaise = Math.floor((totalPotPaise * 70) / 100);
  const vendorSharePaise = Math.floor((totalPotPaise * 20) / 100);
  const platformSharePaise = totalPotPaise - winnerPrizePoolPaise - vendorSharePaise;

  return {
    totalPotPaise,
    winnerPrizePoolPaise,
    vendorSharePaise,
    platformSharePaise,
  };
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
}

export interface ActiveMatchParticipant {
  playerId: string;
  socketId: string;
  displayName: string;
  phone: string;
  score: number;
  cumulativeResponseMs: number;
  lastAnswerTimestamp?: number;
  answers: {
    questionIndex: number;
    selectedOption: number;
    responseMs: number;
    isCorrect: boolean;
  }[];
}

export type MatchStage =
  | "WAITING_FOR_PLAYERS"
  | "LOBBY_COUNTDOWN"
  | "QUESTION_ACTIVE"
  | "QUESTION_INTERMISSION"
  | "MATCH_FINISHED";

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
  currentQuestionIndex: number;
  totalQuestions: number;
  countdownSeconds: number;
  activeQuestion?: SanitizedQuestion;
  startedAt?: number;
  endedAt?: number;
  winner?: {
    playerId: string;
    displayName: string;
    score: number;
    prizePaise: number;
  };
  pot: PotBreakdown;
}
