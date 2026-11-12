export interface InMemoryParticipantRecord {
  playerId: string;
  displayName: string;
  phone: string;
  upiId?: string;
  paymentOrderId?: string;
  paymentStatus: "PAID" | "REFUNDED";
  score: number;
  cumulativeResponseMs: number;
}

export interface InMemoryMatchRecord {
  id: string;
  shopId: string;
  shopCode: string;
  shopName: string;
  status: "LOBBY_OPEN" | "IN_PROGRESS" | "COMPLETED_SETTLED" | "CANCELLED_REFUNDED";
  entryFeePaise: number;
  totalPotPaise: number;
  prizePoolPaise: number;
  vendorSharePaise: number;
  platformSharePaise: number;
  winnerPlayerId: string | null;
  winnerDisplayName: string | null;
  winnerPhone: string | null;
  winnerUpiId: string | null;
  payoutReferenceId: string | null;
  lobbyClosesAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  participants: InMemoryParticipantRecord[];
}

const globalForLedger = globalThis as unknown as {
  __gullyQuizMatches?: Map<string, InMemoryMatchRecord>;
};

if (!globalForLedger.__gullyQuizMatches) {
  globalForLedger.__gullyQuizMatches = new Map<string, InMemoryMatchRecord>();
}

export const IN_MEMORY_MATCHES: Map<string, InMemoryMatchRecord> =
  globalForLedger.__gullyQuizMatches;

export function upsertInMemoryMatch(record: InMemoryMatchRecord): void {
  IN_MEMORY_MATCHES.set(record.id, record);
}

export function getInMemoryMatchesList(): InMemoryMatchRecord[] {
  return Array.from(IN_MEMORY_MATCHES.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
