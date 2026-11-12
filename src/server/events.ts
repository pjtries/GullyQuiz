import {
  PotBreakdown,
  SanitizedQuestion,
  ShopLobbyState,
  PlayerScoreSummary,
} from "../lib/types";

export interface ClientToServerEvents {
  join_lobby: (payload: {
    shopCode: string;
    pin: string;
    phone: string;
    displayName: string;
    upiId?: string;
    paymentOrderId?: string;
  }) => void;

  "quiz:submit_answer": (payload: {
    shopCode: string;
    matchId: string;
    questionIndex: number;
    selectedOptionIndex: number;
  }) => void;

  // Backward compatibility alias
  submit_answer: (payload: {
    shopCode: string;
    matchId: string;
    questionIndex: number;
    selectedOptionIndex: number;
  }) => void;

  request_lobby_state: (payload: { shopCode: string }) => void;

  force_start_match: (payload: { shopCode: string; pin: string }) => void;

  trigger_test_refund: (payload: { shopCode: string }) => void;
}

export interface ServerToClientEvents {
  "match:lobby_update": (state: ShopLobbyState) => void;
  lobby_state_update: (state: ShopLobbyState) => void;

  "match:get_ready": (data: { secondsRemaining: number }) => void;
  match_countdown: (data: { secondsRemaining: number }) => void;

  "match:cancelled_refunded": (data: {
    matchId: string;
    reason: string;
    refundedAmountPaise: number;
    participantsRefunded: number;
  }) => void;

  "quiz:question": (data: {
    questionIndex: number;
    totalQuestions: number;
    questionText: string;
    options: string[];
    serverTimestamp: number;
    timeLimitSeconds: number;
  }) => void;
  question_started: (data: {
    question: SanitizedQuestion;
    questionIndex: number;
    totalQuestions: number;
    timeLimitSeconds: number;
    serverStartTime: number;
  }) => void;

  "quiz:question_ended": (data: {
    questionIndex: number;
    correctOptionIndex: number;
    leaderboard: PlayerScoreSummary[];
  }) => void;
  question_ended: (data: {
    questionIndex: number;
    correctOptionIndex: number;
    leaderboard: PlayerScoreSummary[];
  }) => void;

  "quiz:leaderboard_update": (data: {
    questionIndex: number;
    leaderboard: PlayerScoreSummary[];
  }) => void;

  "quiz:finished": (data: {
    winner: PlayerScoreSummary | null;
    finalLeaderboard: PlayerScoreSummary[];
    pot: PotBreakdown;
    payoutResult?: {
      success: boolean;
      payoutId: string;
      amountPaise: number;
      upiId: string;
    };
    vendorSharePaise: number;
  }) => void;
  match_completed: (data: {
    winner: PlayerScoreSummary | null;
    finalLeaderboard: PlayerScoreSummary[];
    pot: PotBreakdown;
    vendorBalancePaise: number;
  }) => void;

  error_message: (data: { code: string; message: string }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  playerId?: string;
  displayName?: string;
  phone?: string;
  upiId?: string;
  shopCode?: string;
}
