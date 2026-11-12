"use client";

import React, { useState, useEffect, useRef } from "react";
import io, { Socket } from "socket.io-client";
import {
  Trophy,
  Zap,
  Coffee,
  Users,
  Timer,
  CheckCircle2,
  XCircle,
  QrCode,
  Store,
  ChevronRight,
  ShieldCheck,
  Award,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  ShopLobbyState,
  SanitizedQuestion,
  PlayerScoreSummary,
  PotBreakdown,
  formatPaiseToRupees,
} from "../lib/types";

interface PilotShop {
  shopCode: string;
  name: string;
  ownerName: string;
  currentPin: string;
  unsettledBalancePaise: number;
}

export default function GullyQuizPage() {
  // Navigation / View State
  const [activeTab, setActiveTab] = useState<"player" | "vendor">("player");
  const [pilotShops, setPilotShops] = useState<PilotShop[]>([]);

  // Player Onboarding Form
  const [shopCode, setShopCode] = useState("SHP_001");
  const [pin, setPin] = useState("1234");
  const [phone, setPhone] = useState("9876543210");
  const [displayName, setDisplayName] = useState("Raju Speedster");

  // Socket & Connection
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Live Lobby & Game State
  const [lobbyState, setLobbyState] = useState<ShopLobbyState | null>(null);
  const [hasJoined, setHasJoined] = useState(false);
  const [countdownRemaining, setCountdownRemaining] = useState<number | null>(null);

  // Active Question State
  const [activeQuestion, setActiveQuestion] = useState<SanitizedQuestion | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(5);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answerSubmittedAt, setAnswerSubmittedAt] = useState<number | null>(null);
  const [questionStartTime, setQuestionStartTime] = useState<number>(0);
  const [timerSecondsLeft, setTimerSecondsLeft] = useState<number>(10);
  const [correctOptionIndex, setCorrectOptionIndex] = useState<number | null>(null);
  const [interimLeaderboard, setInterimLeaderboard] = useState<PlayerScoreSummary[]>([]);

  // Post Match Settlement
  const [matchWinner, setMatchWinner] = useState<PlayerScoreSummary | null>(null);
  const [finalLeaderboard, setFinalLeaderboard] = useState<PlayerScoreSummary[]>([]);
  const [settledPot, setSettledPot] = useState<PotBreakdown | null>(null);
  const [vendorBalance, setVendorBalance] = useState<number>(0);

  // Fetch pilot shops from API for easy local selection
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const codeParam = params.get("shopCode");
      if (codeParam) {
        setShopCode(codeParam.toUpperCase());
      }
    }

    fetch("/api/shops")
      .then((res) => res.json())
      .then((data) => {
        if (data.shops && data.shops.length > 0) {
          setPilotShops(data.shops);
          const first = data.shops[0];
          if (!shopCode) {
            setShopCode(first.shopCode);
            setPin(first.currentPin);
          }
        }
      })
      .catch((err) => console.error("Error loading pilot shops:", err));
  }, []);

  // Initialize Socket.io connection
  useEffect(() => {
    const socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      console.log("Connected to GullyQuiz Socket server:", socket.id);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
      console.log("Disconnected from Socket server");
    });

    socket.on("error_message", (err: { code: string; message: string }) => {
      setErrorMessage(err.message);
      setTimeout(() => setErrorMessage(null), 4000);
    });

    socket.on("lobby_state_update", (state: ShopLobbyState) => {
      setLobbyState(state);
      if (state.stage === "WAITING_FOR_PLAYERS") {
        setCountdownRemaining(null);
        setActiveQuestion(null);
        setCorrectOptionIndex(null);
      }
    });

    socket.on("match_countdown", (data: { secondsRemaining: number }) => {
      setCountdownRemaining(data.secondsRemaining);
    });

    socket.on("question_started", (data) => {
      setActiveQuestion(data.question);
      setQuestionIndex(data.questionIndex);
      setTotalQuestions(data.totalQuestions);
      setQuestionStartTime(Date.now());
      setTimerSecondsLeft(data.timeLimitSeconds);
      setSelectedOption(null);
      setAnswerSubmittedAt(null);
      setCorrectOptionIndex(null);
      setCountdownRemaining(null);
    });

    socket.on("question_ended", (data) => {
      setCorrectOptionIndex(data.correctOptionIndex);
      setInterimLeaderboard(data.leaderboard);
    });

    socket.on("match_completed", (data) => {
      setMatchWinner(data.winner);
      setFinalLeaderboard(data.finalLeaderboard);
      setSettledPot(data.pot);
      setVendorBalance(data.vendorBalancePaise);
      setActiveQuestion(null);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // 10s Question Countdown Timer ticker
  useEffect(() => {
    if (!activeQuestion || correctOptionIndex !== null) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - questionStartTime) / 1000);
      const remaining = Math.max(0, 10 - elapsed);
      setTimerSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [activeQuestion, questionStartTime, correctOptionIndex]);

  const handleJoinLobby = () => {
    if (!socketRef.current || !shopCode || !pin || !phone) return;
    setErrorMessage(null);

    socketRef.current.emit("join_lobby", {
      shopCode,
      pin,
      phone,
      displayName: displayName.trim() || "GullyRider",
    });

    setHasJoined(true);
  };

  const handleOptionClick = (index: number) => {
    if (selectedOption !== null || correctOptionIndex !== null || !socketRef.current || !lobbyState) {
      return;
    }

    setSelectedOption(index);
    setAnswerSubmittedAt(Date.now());

    socketRef.current.emit("submit_answer", {
      shopCode: lobbyState.shopCode,
      matchId: lobbyState.matchId,
      questionIndex,
      selectedOptionIndex: index,
    });
  };

  const handleForceStart = () => {
    if (!socketRef.current || !shopCode || !pin) return;
    socketRef.current.emit("force_start_match", { shopCode, pin });
  };

  const handleAddSimulatedPlayer = () => {
    // Connects a secondary socket to simulate real multi-player duel
    const rivalSocket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });

    const randomNum = Math.floor(100 + Math.random() * 900);
    const rivalPhone = `+9198765${randomNum}`;
    const rivalNames = ["Priya Sharma", "Amit Patel", "Deepak Verma", "Karan Singh", "Ananya Das"];
    const rivalName = rivalNames[Math.floor(Math.random() * rivalNames.length)];

    rivalSocket.on("connect", () => {
      rivalSocket.emit("join_lobby", {
        shopCode,
        pin,
        phone: rivalPhone,
        displayName: rivalName,
      });
    });

    rivalSocket.on("question_started", (data) => {
      // Rival answers within 1.5 - 3.5 seconds with 75% accuracy
      const delay = 1500 + Math.random() * 2000;
      setTimeout(() => {
        const picked = Math.random() > 0.25 ? 0 : 1; // simulation choice
        rivalSocket.emit("submit_answer", {
          shopCode,
          matchId: lobbyState?.matchId || "",
          questionIndex: data.questionIndex,
          selectedOptionIndex: picked,
        });
      }, delay);
    });
  };

  const currentSelectedShop = pilotShops.find((s) => s.shopCode === shopCode);

  return (
    <main className="w-full max-w-md mx-auto min-h-screen flex flex-col bg-[#0b0f19] text-slate-100 shadow-2xl relative pb-10">
      {/* Top Navbar */}
      <header className="px-4 py-3 bg-[#131a29]/90 backdrop-blur-md border-b border-slate-800/80 sticky top-0 z-50 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-600 to-amber-500 flex items-center justify-center shadow-md shadow-brand-500/20">
            <Zap className="w-4 h-4 text-white fill-current" />
          </div>
          <div>
            <div className="text-base font-black tracking-tight flex items-center gap-1 text-white">
              GULLY<span className="text-brand-500">QUIZ</span>
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400 border border-brand-500/30">
                QR
              </span>
            </div>
            <p className="text-[10px] text-slate-400 -mt-0.5">Rural Trivia Speed Arenas</p>
          </div>
        </div>

        {/* Tab switch & Connection dot */}
        <div className="flex items-center space-x-2">
          <div className="flex bg-slate-900/90 rounded-lg p-0.5 border border-slate-800">
            <button
              onClick={() => setActiveTab("player")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${
                activeTab === "player"
                  ? "bg-brand-500 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Play
            </button>
            <button
              onClick={() => setActiveTab("vendor")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${
                activeTab === "vendor"
                  ? "bg-brand-500 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Shop
            </button>
          </div>

          <div
            title={isConnected ? "Real-time engine connected" : "Connecting..."}
            className={`w-2.5 h-2.5 rounded-full ${
              isConnected ? "bg-emerald-500 shadow-sm shadow-emerald-500/50" : "bg-amber-500 animate-ping"
            }`}
          />
        </div>
      </header>

      {/* Error alert toast */}
      {errorMessage && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2 animate-bounce-short">
          <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ---------------- VENDOR TAB VIEW ---------------- */}
      {activeTab === "vendor" && (
        <div className="p-4 space-y-4">
          <div className="p-4 rounded-2xl bg-gradient-to-br from-[#1a2337] to-[#121927] border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-brand-400 uppercase tracking-wider flex items-center gap-1.5">
                <Store className="w-4 h-4" /> Vendor Counter Portal
              </span>
              <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                24h Active PIN
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 font-medium">Select Pilot Stall:</label>
              <select
                value={shopCode}
                onChange={(e) => {
                  const s = pilotShops.find((item) => item.shopCode === e.target.value);
                  if (s) {
                    setShopCode(s.shopCode);
                    setPin(s.currentPin);
                  }
                }}
                className="w-full bg-slate-900/90 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 font-medium focus:outline-none focus:border-brand-500"
              >
                {pilotShops.map((shop) => (
                  <option key={shop.shopCode} value={shop.shopCode}>
                    {shop.shopCode} - {shop.name}
                  </option>
                ))}
              </select>
            </div>

            {/* QR & PIN Card */}
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col items-center text-center space-y-3">
              <div className="p-3 bg-white rounded-2xl shadow-lg">
                <QrCode className="w-32 h-32 text-slate-950" />
              </div>

              <div>
                <p className="text-xs text-slate-400">Physical Counter PIN</p>
                <div className="mt-1 text-3xl font-mono font-black tracking-widest text-amber-400 bg-amber-500/10 px-4 py-1 rounded-xl border border-amber-500/30">
                  {pin}
                </div>
              </div>

              <p className="text-[11px] text-slate-400 max-w-[240px]">
                Customers scan your stall QR code and type this 4-digit PIN to join the ₹10 speed arena.
              </p>
            </div>

            {/* Financial Revenue Card */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Unsettled Vendor Earnings (20% Share):</span>
                <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded">
                  Instant UPI
                </span>
              </div>
              <div className="text-2xl font-black text-emerald-400 flex items-center justify-between">
                <span>{formatPaiseToRupees(vendorBalance || currentSelectedShop?.unsettledBalancePaise || 0)}</span>
                <button
                  onClick={() => alert("Simulated instant UPI settlement initiated to " + (currentSelectedShop?.ownerName || "Vendor"))}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition"
                >
                  Settle to UPI
                </button>
              </div>
              <p className="text-[10px] text-slate-500">
                Zero CapEx hardware. Every ₹10 match awards ₹2 per participant directly to your shop balance.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- PLAYER TAB VIEW ---------------- */}
      {activeTab === "player" && (
        <div className="p-4 flex-1 flex flex-col justify-between">
          {/* STEP 1: JOIN ARENA FORM */}
          {!hasJoined && (
            <div className="space-y-4 my-auto">
              {/* Header Banner */}
              <div className="text-center space-y-1.5">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-500/15 border border-brand-500/30 text-brand-400 text-xs font-semibold">
                  <Coffee className="w-3.5 h-3.5" />
                  Tea Stall & Bookstore Arenas
                </div>
                <h1 className="text-2xl font-black tracking-tight text-white">
                  Join Speed Trivia <span className="text-brand-500">₹10</span>
                </h1>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  5 rapid questions. 10 seconds each. Win 70% of the pot in 60 seconds!
                </p>
              </div>

              {/* Form card */}
              <div className="p-4 rounded-2xl bg-gradient-to-b from-[#161f31] to-[#101726] border border-slate-800/80 shadow-xl space-y-3.5">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Select Pilot Stall (or Scan QR):
                  </label>
                  <select
                    value={shopCode}
                    onChange={(e) => {
                      const s = pilotShops.find((item) => item.shopCode === e.target.value);
                      if (s) {
                        setShopCode(s.shopCode);
                        setPin(s.currentPin);
                      }
                    }}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-brand-500"
                  >
                    {pilotShops.map((s) => (
                      <option key={s.shopCode} value={s.shopCode}>
                        {s.shopCode} - {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Shop Code
                    </label>
                    <input
                      type="text"
                      value={shopCode}
                      onChange={(e) => setShopCode(e.target.value.toUpperCase())}
                      placeholder="SHP_001"
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs font-mono font-bold text-brand-400 focus:outline-none focus:border-brand-500 uppercase"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Counter 4-Digit PIN
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="1234"
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs font-mono font-bold tracking-widest text-amber-400 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Mobile Phone (UPI Payout)
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="9876543210"
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white font-medium focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Player Nickname
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="SpeedMaster"
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white font-medium focus:outline-none focus:border-brand-500"
                  />
                </div>

                {/* Pot distribution preview card */}
                <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] space-y-1">
                  <div className="flex justify-between text-slate-400 font-medium">
                    <span>Entry Fee:</span>
                    <span className="font-bold text-white">₹10.00 (1000 Paise)</span>
                  </div>
                  <div className="flex justify-between text-emerald-400">
                    <span>Winner Prize Pool:</span>
                    <span className="font-bold">70% of Pot</span>
                  </div>
                  <div className="flex justify-between text-amber-400">
                    <span>Shopkeeper Commission:</span>
                    <span className="font-bold">20% of Pot</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Platform Infrastructure:</span>
                    <span className="font-bold">10%</span>
                  </div>
                </div>

                <button
                  onClick={handleJoinLobby}
                  disabled={!isConnected}
                  className="w-full py-3 px-4 rounded-xl font-black text-sm tracking-wide bg-gradient-to-r from-brand-500 to-amber-500 hover:from-brand-600 hover:to-amber-600 text-white shadow-lg shadow-brand-500/25 active:scale-[0.98] transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Zap className="w-4 h-4 fill-current" /> Pay ₹10 & Enter Arena
                </button>
              </div>

              <div className="flex items-center justify-center gap-4 text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Instant UPI Payout
                </span>
                <span>•</span>
                <span>Zero Latency WebSockets</span>
              </div>
            </div>
          )}

          {/* STEP 2: LOBBY / WAITING ROOM */}
          {hasJoined && lobbyState?.stage === "WAITING_FOR_PLAYERS" && (
            <div className="space-y-4 my-auto">
              <div className="p-4 rounded-2xl bg-gradient-to-b from-[#182338] to-[#101726] border border-slate-800 text-center space-y-3">
                <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-brand-500/20 text-brand-400 text-xs font-bold">
                  <Coffee className="w-3.5 h-3.5" /> {lobbyState.shopName}
                </div>

                <h2 className="text-xl font-black text-white">Match Lobby Open</h2>
                <p className="text-xs text-slate-400">
                  Waiting for opponents at this counter. Starts automatically with 2+ players!
                </p>

                {/* Pot summary badge */}
                <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 grid grid-cols-2 gap-2 text-center">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Total Pot</span>
                    <p className="text-lg font-black text-amber-400">
                      {formatPaiseToRupees(lobbyState.pot.totalPotPaise)}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">1st Prize</span>
                    <p className="text-lg font-black text-emerald-400">
                      {formatPaiseToRupees(lobbyState.pot.winnerPrizePoolPaise)}
                    </p>
                  </div>
                </div>

                {/* Joined players list */}
                <div className="space-y-2 text-left">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-brand-400" /> Joined Competitors ({lobbyState.players.length})
                    </span>
                    <span className="text-slate-500 text-[11px]">Min: 2 players</span>
                  </div>

                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {lobbyState.players.map((p, idx) => (
                      <div
                        key={p.socketId || idx}
                        className="px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-400 font-bold text-xs flex items-center justify-center">
                            {idx + 1}
                          </div>
                          <span className="text-xs font-semibold text-white">{p.displayName}</span>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          PAID ₹10
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Local test helpers */}
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <button
                    onClick={handleAddSimulatedPlayer}
                    className="w-full py-2 px-3 text-xs font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition flex items-center justify-center gap-1.5"
                  >
                    <Users className="w-3.5 h-3.5 text-brand-400" /> Simulate Rival Player Joining
                  </button>

                  <button
                    onClick={handleForceStart}
                    className="w-full py-2 px-3 text-xs font-bold rounded-xl bg-brand-600 hover:bg-brand-500 text-white transition flex items-center justify-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current" /> Instant Start Round
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: LOBBY COUNTDOWN */}
          {hasJoined && (lobbyState?.stage === "LOBBY_COUNTDOWN" || countdownRemaining !== null) && (
            <div className="my-auto text-center space-y-4">
              <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-brand-600 to-amber-500 flex items-center justify-center mx-auto shadow-2xl shadow-brand-500/30 animate-pulse">
                <span className="text-4xl font-black text-white">{countdownRemaining ?? 5}</span>
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-black text-white">Get Ready!</h3>
                <p className="text-xs text-slate-400">Match begins in seconds. Speed matters!</p>
              </div>
            </div>
          )}

          {/* STEP 4: LIVE QUESTION ARENA */}
          {hasJoined &&
            (lobbyState?.stage === "QUESTION_ACTIVE" || lobbyState?.stage === "QUESTION_INTERMISSION") &&
            activeQuestion && (
              <div className="space-y-4 my-auto">
                {/* Status Bar */}
                <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                  <span className="bg-slate-800/80 px-2.5 py-1 rounded-lg text-brand-400 font-bold">
                    Question {questionIndex + 1} of {totalQuestions}
                  </span>
                  <span className="flex items-center gap-1 text-amber-400 font-mono font-bold bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                    <Timer className="w-3.5 h-3.5" /> {timerSecondsLeft}s
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-100 ${
                      timerSecondsLeft > 4
                        ? "bg-brand-500"
                        : timerSecondsLeft > 2
                        ? "bg-amber-400"
                        : "bg-rose-500"
                    }`}
                    style={{ width: `${(timerSecondsLeft / 10) * 100}%` }}
                  />
                </div>

                {/* Question Text */}
                <div className="p-5 rounded-2xl bg-gradient-to-br from-[#182339] to-[#111827] border border-slate-800 shadow-xl min-h-[110px] flex items-center justify-center text-center">
                  <p className="text-base font-bold text-white leading-snug">
                    {activeQuestion.questionText}
                  </p>
                </div>

                {/* 4 Answer Options */}
                <div className="grid grid-cols-1 gap-2.5">
                  {activeQuestion.options.map((option, idx) => {
                    const isSelected = selectedOption === idx;
                    const isCorrectAnswer = correctOptionIndex === idx;
                    const isRevealed = correctOptionIndex !== null;

                    let btnClass =
                      "p-3.5 rounded-xl border text-left font-semibold text-sm transition flex items-center justify-between ";

                    if (isRevealed) {
                      if (isCorrectAnswer) {
                        btnClass += "bg-emerald-600/30 border-emerald-500 text-emerald-200 shadow-lg shadow-emerald-500/20 ";
                      } else if (isSelected && !isCorrectAnswer) {
                        btnClass += "bg-rose-600/30 border-rose-500 text-rose-200 ";
                      } else {
                        btnClass += "bg-slate-900/60 border-slate-800 text-slate-500 opacity-60 ";
                      }
                    } else if (isSelected) {
                      btnClass += "bg-brand-500/30 border-brand-500 text-white shadow-md shadow-brand-500/20 ";
                    } else {
                      btnClass +=
                        "bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-200 active:scale-[0.99] ";
                    }

                    return (
                      <button
                        key={idx}
                        disabled={selectedOption !== null || isRevealed}
                        onClick={() => handleOptionClick(idx)}
                        className={btnClass}
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center">
                            {["A", "B", "C", "D"][idx]}
                          </span>
                          <span>{option}</span>
                        </div>

                        {isRevealed && isCorrectAnswer && (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                        )}
                        {isRevealed && isSelected && !isCorrectAnswer && (
                          <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Interim feedback */}
                {selectedOption !== null && correctOptionIndex === null && (
                  <p className="text-center text-xs font-semibold text-brand-400 animate-pulse">
                    ⚡ Answer submitted! Waiting for opponents...
                  </p>
                )}

                {/* Intermission Mini Leaderboard */}
                {correctOptionIndex !== null && (
                  <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-xs space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Current Standings</span>
                    {interimLeaderboard.slice(0, 3).map((item, idx) => (
                      <div key={item.playerId} className="flex justify-between text-slate-300">
                        <span>
                          {idx + 1}. {item.displayName}
                        </span>
                        <span className="font-bold text-amber-400">{item.score} pts</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          {/* STEP 5: MATCH FINISHED & SETTLEMENT */}
          {hasJoined && lobbyState?.stage === "MATCH_FINISHED" && (
            <div className="space-y-4 my-auto text-center">
              <div className="p-5 rounded-2xl bg-gradient-to-b from-[#1c273e] to-[#111827] border border-amber-500/30 shadow-2xl space-y-3">
                <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/30">
                  <Trophy className="w-8 h-8 text-slate-950 fill-current" />
                </div>

                <div>
                  <span className="text-xs uppercase font-bold text-amber-400 tracking-wider">
                    Match Champion
                  </span>
                  <h2 className="text-2xl font-black text-white">{matchWinner?.displayName || "Champion"}</h2>
                  <p className="text-xs text-slate-400">Score: {matchWinner?.score || 0} pts</p>
                </div>

                {/* Pot summary */}
                {settledPot && (
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5 text-xs text-left">
                    <div className="flex justify-between text-slate-400">
                      <span>Total Match Pot:</span>
                      <span className="font-bold text-white">
                        {formatPaiseToRupees(settledPot.totalPotPaise)}
                      </span>
                    </div>
                    <div className="flex justify-between text-emerald-400 font-bold">
                      <span>Winner Payout (70%):</span>
                      <span>{formatPaiseToRupees(settledPot.winnerPrizePoolPaise)}</span>
                    </div>
                    <div className="flex justify-between text-amber-400 font-semibold">
                      <span>Vendor Commission (20%):</span>
                      <span>{formatPaiseToRupees(settledPot.vendorSharePaise)}</span>
                    </div>
                    <div className="flex justify-between text-slate-500 text-[11px]">
                      <span>Platform Infrastructure (10%):</span>
                      <span>{formatPaiseToRupees(settledPot.platformSharePaise)}</span>
                    </div>
                  </div>
                )}

                {/* Final Leaderboard */}
                <div className="space-y-1 text-left">
                  <span className="text-[11px] font-bold text-slate-400">Final Leaderboard:</span>
                  {finalLeaderboard.map((item, idx) => (
                    <div
                      key={item.playerId}
                      className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <span className="font-semibold text-slate-200">
                        {idx + 1}. {item.displayName}
                      </span>
                      <span className="font-bold text-amber-400">{item.score} pts</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => {
                    setHasJoined(false);
                    setMatchWinner(null);
                    setSettledPot(null);
                  }}
                  className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-brand-500 hover:bg-brand-600 text-white transition"
                >
                  Return to Stall Home
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer Branding */}
      <footer className="text-center text-[10px] text-slate-500 px-4 mt-auto">
        GullyQuiz QR • Zero-CapEx Speed Trivia for Rural Micro-Businesses
      </footer>
    </main>
  );
}
