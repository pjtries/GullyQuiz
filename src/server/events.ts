import { PotBreakdown, SanitizedQuestion, ShopLobbyState, PlayerScoreSummary } from "../lib/types";

export interface ClientToServerEvents {
  join_lobby: (payload: {
    shopCode: string;
    pin: string;
    phone: string;
    displayName: string;
  }) => void;

  submit_answer: (payload: {
    shopCode: string;
    matchId: string;
    questionIndex: number;
    selectedOptionIndex: number;
  }) => void;

  request_lobby_state: (payload: { shopCode: string }) => void;

  force_start_match: (payload: { shopCode: string; pin: string }) => void;
}

export interface ServerToClientEvents {
  lobby_state_update: (state: ShopLobbyState) => void;

  match_countdown: (data: { secondsRemaining: number }) => void;

  question_started: (data: {
    question: SanitizedQuestion;
    questionIndex: number;
    totalQuestions: number;
    timeLimitSeconds: number;
    serverStartTime: number;
  }) => void;

  question_ended: (data: {
    questionIndex: number;
    correctOptionIndex: number;
    leaderboard: PlayerScoreSummary[];
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
  shopCode?: string;
}
