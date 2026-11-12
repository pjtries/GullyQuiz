"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import io, { Socket } from "socket.io-client";
import {
  Zap,
  Coffee,
  Store,
  KeyRound,
  ShieldCheck,
  Smartphone,
  User,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Trophy,
  Users,
  Timer,
  XCircle,
  ArrowRight,
  Sparkles,
  ChevronLeft,
  RotateCcw,
  Award,
  Wallet,
  Clock,
} from "lucide-react";
import {
  ShopLobbyState,
  SanitizedQuestion,
  PlayerScoreSummary,
  PotBreakdown,
  formatPaiseToRupees,
} from "../../../lib/types";

interface ShopInfo {
  id: string;
  shopCode: string;
  name: string;
  ownerName: string;
  ownerPhone?: string;
  ownerUpiId?: string;
  currentPin: string;
  pinExpiresAt: string;
  unsettledBalancePaise?: number;
  isActive: boolean;
}

type FlowStep = "PIN_GATE" | "PLAYER_PAYMENT" | "UPI_MODAL" | "ARENA";

export default function PlayShopPage() {
  const params = useParams();
  const router = useRouter();
  const rawShopCode = (params?.shopCode as string) || "SHP_001";
  const shopCode = rawShopCode.toUpperCase();

  // Shop Data
  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [allShops, setAllShops] = useState<ShopInfo[]>([]);
  const [isLoadingShop, setIsLoadingShop] = useState(true);
  const [shopError, setShopError] = useState<string | null>(null);

  // Step State
  const [currentStep, setCurrentStep] = useState<FlowStep>("PIN_GATE");
  const [pinInput, setPinInput] = useState("");
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  // Player Profile
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [upiId, setUpiId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Payment
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentOrderId, setPaymentOrderId] = useState<string | null>(null);
  const [upiIntentUrl, setUpiIntentUrl] = useState<string | null>(null);
  const [selectedUpiApp, setSelectedUpiApp] = useState<string>("gpay");

  // Socket & Live Matchmaking Lobby
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lobbyState, setLobbyState] = useState<ShopLobbyState | null>(null);
  const [readyCountdown, setReadyCountdown] = useState<number | null>(null);

  // 90-Second Synchronous Quiz State
  const [activeQuestion, setActiveQuestion] = useState<SanitizedQuestion | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(9);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [questionStartTime, setQuestionStartTime] = useState<number>(0);
  const [timerSecondsLeft, setTimerSecondsLeft] = useState<number>(10);
  const [correctOptionIndex, setCorrectOptionIndex] = useState<number | null>(null);
  const [interimLeaderboard, setInterimLeaderboard] = useState<PlayerScoreSummary[]>([]);
  const [answeredLatencyMs, setAnsweredLatencyMs] = useState<number | null>(null);

  // Refund State
  const [refundData, setRefundData] = useState<{
    matchId: string;
    reason: string;
    refundedAmountPaise: number;
    participantsRefunded: number;
  } | null>(null);

  // Winner Settlement
  const [matchWinner, setMatchWinner] = useState<PlayerScoreSummary | null>(null);
  const [finalLeaderboard, setFinalLeaderboard] = useState<PlayerScoreSummary[]>([]);
  const [settledPot, setSettledPot] = useState<PotBreakdown | null>(null);
  const [payoutResult, setPayoutResult] = useState<{
    payoutId: string;
    upiId: string;
    amountPaise: number;
  } | null>(null);

  // 1. Load persisted player profile from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("gullyquiz_player_profile");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.phone) setPhone(parsed.phone);
        if (parsed.displayName) setDisplayName(parsed.displayName);
        if (parsed.upiId) setUpiId(parsed.upiId);
      }
    } catch (e) {
      console.warn("localStorage read error:", e);
    }
  }, []);

  // 2. Fetch Shop Details by shopCode
  useEffect(() => {
    setIsLoadingShop(true);
    setShopError(null);

    fetch(`/api/shops?shopCode=${encodeURIComponent(shopCode)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.shop) {
          throw new Error(data.error || `Stall '${shopCode}' not found or inactive.`);
        }
        setShop(data.shop);
        setIsLoadingShop(false);
      })
      .catch((err) => {
        console.error("Fetch shop error:", err);
        setShopError(err.message || "Failed to load shop details.");
        setIsLoadingShop(false);
      });

    fetch("/api/shops")
      .then((res) => res.json())
      .then((data) => {
        if (data.shops) setAllShops(data.shops);
      })
      .catch(() => {});
  }, [shopCode]);

  // 3. Socket.io Event Subscriptions
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

    // 1. Matchmaking Lobby updates
    socket.on("match:lobby_update", (state: ShopLobbyState) => {
      setLobbyState(state);
      if (state.stage === "LOBBY_OPEN" || state.stage === "WAITING_FOR_PLAYERS") {
        setReadyCountdown(null);
        setActiveQuestion(null);
        setCorrectOptionIndex(null);
        setRefundData(null);
      }
      if (state.stage === "CANCELLED_REFUNDED" && state.refundInfo) {
        setRefundData({
          matchId: state.matchId,
          reason: state.refundInfo.reason,
          refundedAmountPaise: state.refundInfo.refundedAmountPaise,
          participantsRefunded: state.refundInfo.participantsRefunded,
        });
      }
    });

    socket.on("lobby_state_update", (state: ShopLobbyState) => {
      setLobbyState(state);
    });

    // 2. Get Ready 5s Countdown
    socket.on("match:get_ready", (data: { secondsRemaining: number }) => {
      setReadyCountdown(data.secondsRemaining);
    });

    // 3. Minimum Player Refund Rule (<4 players)
    socket.on(
      "match:cancelled_refunded",
      (data: {
        matchId: string;
        reason: string;
        refundedAmountPaise: number;
        participantsRefunded: number;
      }) => {
        console.log("Match cancelled and refunded:", data);
        setRefundData(data);
        setReadyCountdown(null);
        setActiveQuestion(null);
      }
    );

    // 4. 90-Second Quiz Questions (1 every 10s, total 9)
    socket.on("quiz:question", (data) => {
      setActiveQuestion({
        id: `q-${data.questionIndex}`,
        category: "GENERAL_KNOWLEDGE",
        questionText: data.questionText,
        options: data.options,
      });
      setQuestionIndex(data.questionIndex);
      setTotalQuestions(data.totalQuestions || 9);
      setQuestionStartTime(Date.now());
      setTimerSecondsLeft(data.timeLimitSeconds || 10);
      setSelectedOption(null);
      setCorrectOptionIndex(null);
      setReadyCountdown(null);
      setAnsweredLatencyMs(null);
      setRefundData(null);
    });

    socket.on("quiz:leaderboard_update", (data) => {
      setInterimLeaderboard(data.leaderboard);
    });

    socket.on("quiz:question_ended", (data) => {
      setCorrectOptionIndex(data.correctOptionIndex);
      setInterimLeaderboard(data.leaderboard);
    });

    // 5. Tie-Breaker & Settlement Finished
    socket.on("quiz:finished", (data) => {
      setMatchWinner(data.winner);
      setFinalLeaderboard(data.finalLeaderboard);
      setSettledPot(data.pot);
      if (data.payoutResult) {
        setPayoutResult(data.payoutResult);
      }
      setActiveQuestion(null);
      setCorrectOptionIndex(null);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // 10s Question Countdown Progress Bar
  useEffect(() => {
    if (!activeQuestion || correctOptionIndex !== null) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - questionStartTime) / 100);
      const remaining = Math.max(0, 10 - elapsed / 10);
      setTimerSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [activeQuestion, questionStartTime, correctOptionIndex]);

  // STEP 1: Verify 4-Digit PIN Gate
  const handleVerifyPin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pinInput || pinInput.trim().length !== 4) {
      setPinError("Please enter the 4-digit PIN displayed at the stall.");
      return;
    }

    setIsVerifyingPin(true);
    setPinError(null);

    try {
      const res = await fetch("/api/shops/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopCode,
          pin: pinInput.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.valid) {
        setPinError(data.error || "Invalid PIN. Check the counter standee.");
        setIsVerifyingPin(false);
        return;
      }

      setIsVerifyingPin(false);
      setCurrentStep("PLAYER_PAYMENT");
    } catch (err) {
      console.error("PIN verification error:", err);
      setPinError("Failed to verify PIN. Please try again.");
      setIsVerifyingPin(false);
    }
  };

  // STEP 2: Save Profile & Create ₹10 Order
  const handleInitiatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      setFormError("Please enter a valid 10-digit Indian mobile number.");
      return;
    }

    const cleanName = displayName.trim() || "GullyRider";
    const cleanUpi = upiId.trim() || `${cleanPhone}@upi`;

    try {
      localStorage.setItem(
        "gullyquiz_player_profile",
        JSON.stringify({
          phone: cleanPhone,
          displayName: cleanName,
          upiId: cleanUpi,
        })
      );
    } catch (err) {
      console.warn("Could not save to localStorage:", err);
    }

    setIsProcessingPayment(true);

    try {
      const res = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopCode,
          pin: pinInput.trim(),
          phone: cleanPhone,
          displayName: cleanName,
          upiId: cleanUpi,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to create ₹10 payment order.");
      }

      setPaymentOrderId(data.orderId);
      setUpiIntentUrl(data.upiIntentUrl);
      setIsProcessingPayment(false);
      setCurrentStep("UPI_MODAL");
    } catch (err: any) {
      console.error("Payment initiation error:", err);
      setFormError(err.message || "Failed to start ₹10 payment.");
      setIsProcessingPayment(false);
    }
  };

  // STEP 3: Confirm Payment -> Join Live Matchmaking Lobby
  const handleConfirmUpiPayment = async () => {
    if (!paymentOrderId) return;
    setIsProcessingPayment(true);

    try {
      const cleanPhone = phone.replace(/\D/g, "");
      const cleanName = displayName.trim() || "GullyRider";
      const cleanUpi = upiId.trim() || `${cleanPhone}@upi`;

      const res = await fetch("/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: paymentOrderId,
          paymentId: `pay_${selectedUpiApp}_${Date.now()}`,
          shopCode,
          phone: cleanPhone,
          displayName: cleanName,
          upiId: cleanUpi,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Payment verification failed.");
      }

      // Connect player to live Socket.io matchmaking lobby
      if (socketRef.current) {
        socketRef.current.emit("join_lobby", {
          shopCode,
          pin: pinInput.trim(),
          phone: cleanPhone,
          displayName: cleanName,
          upiId: cleanUpi,
          paymentOrderId,
        });
      }

      setIsProcessingPayment(false);
      setCurrentStep("ARENA");
    } catch (err: any) {
      console.error("Verification error:", err);
      alert(err.message || "Could not confirm ₹10 payment.");
      setIsProcessingPayment(false);
    }
  };

  // Submit Answer (Server-Authoritative scoring)
  const handleOptionClick = (index: number) => {
    if (selectedOption !== null || correctOptionIndex !== null || !socketRef.current || !lobbyState) {
      return;
    }

    const latency = Math.min(10000, Math.max(0, Date.now() - questionStartTime));
    setSelectedOption(index);
    setAnsweredLatencyMs(latency);

    socketRef.current.emit("quiz:submit_answer", {
      shopCode: lobbyState.shopCode,
      matchId: lobbyState.matchId,
      questionIndex,
      selectedOptionIndex: index,
    });
  };

  // Local Testing Simulations
  const handleSimulateMultipleRivals = (count: number) => {
    for (let i = 0; i < count; i++) {
      const rivalSocket = io({
        path: "/socket.io",
        transports: ["websocket", "polling"],
      });

      const randomNum = Math.floor(1000 + Math.random() * 9000);
      const names = [
        "Priya S.",
        "Amit P.",
        "Deepak V.",
        "Karan S.",
        "Ananya D.",
        "Vikram R.",
        "Sneha M.",
        "Rahul G.",
        "Pooja B.",
        "Sunil K.",
      ];
      const rivalName = names[i % names.length] + ` (#${i + 1})`;

      rivalSocket.on("connect", () => {
        rivalSocket.emit("join_lobby", {
          shopCode,
          pin: pinInput.trim() || shop?.currentPin || "1234",
          phone: `+9198765${randomNum}`,
          displayName: rivalName,
          upiId: `rival${randomNum}@upi`,
        });
      });

      rivalSocket.on("quiz:question", (data) => {
        const delay = 800 + Math.random() * 3000;
        setTimeout(() => {
          rivalSocket.emit("quiz:submit_answer", {
            shopCode,
            matchId: lobbyState?.matchId || "",
            questionIndex: data.questionIndex,
            selectedOptionIndex: Math.random() > 0.35 ? 0 : 1,
          });
        }, delay);
      });
    }
  };

  const handleTriggerRefundTest = () => {
    if (!socketRef.current) return;
    socketRef.current.emit("trigger_test_refund", { shopCode });
  };

  const handleForceStart = () => {
    if (!socketRef.current) return;
    socketRef.current.emit("force_start_match", {
      shopCode,
      pin: pinInput.trim() || shop?.currentPin || "1234",
    });
  };

  const myPhone = phone.replace(/\D/g, "");
  const currentPrizePool = lobbyState?.currentPrizePoolPaise ?? (lobbyState?.players.length || 1) * 700;

  return (
    <main className="w-full max-w-md mx-auto min-h-screen flex flex-col bg-[#0b0f19] text-slate-100 shadow-2xl relative pb-4">
      {/* Top Navbar */}
      <header className="px-4 py-3 bg-[#131a29]/95 backdrop-blur-md border-b border-slate-800/80 sticky top-0 z-50 flex items-center justify-between">
        <Link href="/" className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-600 to-amber-500 flex items-center justify-center shadow-md shadow-brand-500/20">
            <Zap className="w-4 h-4 text-white fill-current" />
          </div>
          <div>
            <div className="text-base font-black tracking-tight flex items-center gap-1 text-white">
              GULLY<span className="text-brand-500">QUIZ</span>
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400 border border-brand-500/30">
                90s
              </span>
            </div>
            <p className="text-[10px] text-slate-400 -mt-0.5">Speed Trivia Arena</p>
          </div>
        </Link>

        <div className="flex items-center space-x-2">
          <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-brand-400">
            {shopCode}
          </span>
          <div
            title={isConnected ? "WebSocket Connected" : "Connecting..."}
            className={`w-2.5 h-2.5 rounded-full ${
              isConnected ? "bg-emerald-500 shadow-sm shadow-emerald-500/50" : "bg-amber-500 animate-ping"
            }`}
          />
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex flex-col p-4 justify-between">
        {/* LOADING STATE */}
        {isLoadingShop && (
          <div className="my-auto text-center space-y-3 py-16">
            <div className="w-10 h-10 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-400 font-semibold tracking-wide">
              Connecting to {shopCode} Arena...
            </p>
          </div>
        )}

        {/* ERROR STATE */}
        {!isLoadingShop && shopError && (
          <div className="my-auto space-y-5">
            <div className="p-6 rounded-3xl bg-[#161d2d] border border-rose-500/30 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
                <AlertCircle className="w-7 h-7" />
              </div>
              <h2 className="text-lg font-black text-white">Arena Not Found</h2>
              <p className="text-xs text-slate-400">
                Stall code <span className="font-mono text-rose-300 font-bold">&quot;{shopCode}&quot;</span> is not available.
              </p>
              <div className="pt-3 border-t border-slate-800 text-left space-y-2">
                <label className="text-[11px] font-bold text-slate-300 block">
                  Select an active pilot tea stall / bookstore:
                </label>
                <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                  {allShops.map((s) => (
                    <button
                      key={s.shopCode}
                      onClick={() => router.push(`/play/${s.shopCode}`)}
                      className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-brand-500 text-left flex items-center justify-between text-xs transition"
                    >
                      <div>
                        <span className="font-bold text-white block">{s.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {s.shopCode} • {s.ownerName}
                        </span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-brand-400" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 1: HOURLY PIN GATE ================= */}
        {!isLoadingShop && !shopError && shop && currentStep === "PIN_GATE" && (
          <div className="my-auto space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-500/15 border border-brand-500/30 text-brand-400 text-xs font-bold">
                <Coffee className="w-3.5 h-3.5" />
                Live Tea Stall & Bookstore Arena
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight leading-tight">
                Welcome to <br />
                <span className="text-brand-500">{shop.name}</span>
              </h1>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Managed by <span className="text-slate-300 font-semibold">{shop.ownerName}</span> • ₹10 Entry
              </p>
            </div>

            <form
              onSubmit={handleVerifyPin}
              className="p-5 rounded-3xl bg-gradient-to-b from-[#182339] to-[#111827] border border-slate-800 shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                <KeyRound className="w-4 h-4" />
                <span>STEP 1: ENTER STALL 4-DIGIT PIN</span>
              </div>

              <p className="text-xs text-slate-300">
                Enter the active 4-digit PIN displayed on the counter standee:
              </p>

              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                autoFocus
                value={pinInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  setPinInput(val);
                  if (val.length === 4) setPinError(null);
                }}
                placeholder="• • • •"
                className="w-full h-16 bg-slate-900 border-2 border-slate-700 focus:border-brand-500 rounded-2xl text-center text-3xl font-mono font-black tracking-[0.5em] text-amber-400 focus:outline-none transition shadow-inner"
              />

              {pinError && (
                <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{pinError}</span>
                </div>
              )}

              <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Stall Active PIN:</span>
                <button
                  type="button"
                  onClick={() => setPinInput(shop.currentPin)}
                  className="font-mono font-bold text-brand-400 underline hover:text-brand-300"
                >
                  Fill PIN ({shop.currentPin})
                </button>
              </div>

              <button
                type="submit"
                disabled={isVerifyingPin || pinInput.length !== 4}
                className="w-full h-14 rounded-2xl font-black text-sm tracking-wide bg-gradient-to-r from-brand-500 to-amber-500 hover:from-brand-600 hover:to-amber-600 text-white shadow-xl shadow-brand-500/25 active:scale-[0.98] transition flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {isVerifyingPin ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Verify PIN & Continue</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* ================= STEP 2: PLAYER PROFILE & ₹10 ENTRY ================= */}
        {!isLoadingShop && !shopError && shop && currentStep === "PLAYER_PAYMENT" && (
          <div className="my-auto space-y-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setCurrentStep("PIN_GATE")}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-white"
              >
                <ChevronLeft className="w-4 h-4" /> Change PIN
              </button>
              <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                PIN Verified ✓
              </span>
            </div>

            <div className="text-center space-y-1">
              <h2 className="text-xl font-black text-white">Player Profile & Entry</h2>
              <p className="text-xs text-slate-400">
                Fast 90s Trivia • ₹10 Entry • Win 70% of Pot
              </p>
            </div>

            <form
              onSubmit={handleInitiatePayment}
              className="p-5 rounded-3xl bg-gradient-to-b from-[#182339] to-[#111827] border border-slate-800 shadow-2xl space-y-3.5"
            >
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Mobile Number (10 Digits)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3.5 text-xs font-bold text-slate-400">
                    +91
                  </span>
                  <input
                    type="tel"
                    inputMode="tel"
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                    placeholder="9876543210"
                    required
                    className="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl pl-12 pr-3 text-sm font-semibold text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Arena Display Name
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    maxLength={15}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Raju Speedster"
                    required
                    className="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-3 text-sm font-semibold text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  UPI ID (For Winner Prize Payout)
                </label>
                <div className="relative">
                  <CreditCard className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="name@okaxis or 9876543210@ybl"
                    className="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-3 text-sm font-semibold text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              {formError && (
                <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                  {formError}
                </div>
              )}

              {/* Pot Distribution (70 / 10 / 20) */}
              <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-[11px] space-y-1">
                <div className="flex justify-between text-slate-300 font-bold">
                  <span>Entry Fee:</span>
                  <span className="text-white">₹10.00 (1000 Paise)</span>
                </div>
                <div className="flex justify-between text-emerald-400">
                  <span>Winner Prize Pool (70%):</span>
                  <span className="font-bold">₹7.00 per player</span>
                </div>
                <div className="flex justify-between text-amber-400">
                  <span>Stall Vendor Share (10%):</span>
                  <span className="font-bold">₹1.00 per player</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Platform Operations (20%):</span>
                  <span>₹2.00 per player</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={isProcessingPayment}
                className="w-full h-14 rounded-2xl font-black text-sm tracking-wide bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 text-slate-950 shadow-xl shadow-emerald-500/20 active:scale-[0.98] transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isProcessingPayment ? (
                  <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-current" />
                    <span>Pay ₹10 & Enter Arena</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* ================= STEP 2.5: SIMULATED UPI AUTHORIZATION ================= */}
        {currentStep === "UPI_MODAL" && (
          <div className="my-auto space-y-4">
            <div className="p-5 rounded-3xl bg-gradient-to-b from-[#182339] to-[#111827] border border-emerald-500/30 shadow-2xl space-y-4">
              <div className="text-center space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  UPI Intent Simulation
                </span>
                <h3 className="text-xl font-black text-white">Authorize ₹10.00</h3>
                <p className="text-xs text-slate-400">
                  Order: <span className="font-mono text-slate-300">{paymentOrderId}</span>
                </p>
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-400 block">Select UPI App:</span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "gpay", name: "Google Pay" },
                    { id: "phonepe", name: "PhonePe" },
                    { id: "paytm", name: "Paytm UPI" },
                    { id: "bhim", name: "BHIM UPI" },
                  ].map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => setSelectedUpiApp(app.id)}
                      className={`p-3 rounded-xl border text-xs font-bold text-left transition flex items-center justify-between ${
                        selectedUpiApp === app.id
                          ? "bg-brand-500/20 border-brand-500 text-white shadow"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      <span>{app.name}</span>
                      {selectedUpiApp === app.id && (
                        <CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleConfirmUpiPayment}
                disabled={isProcessingPayment}
                className="w-full h-14 rounded-2xl font-black text-sm tracking-wide bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 text-slate-950 shadow-xl shadow-emerald-500/25 active:scale-[0.98] transition flex items-center justify-center gap-2"
              >
                {isProcessingPayment ? (
                  <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Confirm ₹10 & Join Lobby</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 3: LIVE LOBBY / QUIZ / REFUND / PODIUM ================= */}
        {currentStep === "ARENA" && (
          <div className="flex-1 flex flex-col justify-between space-y-4">
            {/* ---------------- 3A. REFUND SCREEN ---------------- */}
            {refundData && (
              <div className="my-auto space-y-4">
                <div className="p-6 rounded-3xl bg-gradient-to-b from-[#241a1a] to-[#181111] border border-amber-500/40 text-center space-y-4 shadow-2xl">
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
                    <RotateCcw className="w-8 h-8" />
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] uppercase font-bold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                      Minimum 4 Players Rule
                    </span>
                    <h2 className="text-2xl font-black text-white">Lobby Cancelled & Refunded</h2>
                    <p className="text-xs text-slate-300 pt-1 leading-relaxed">
                      Fewer than 4 players joined within 60 seconds.
                    </p>
                  </div>

                  {/* Refund Confirmation Card */}
                  <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 text-left text-xs space-y-2">
                    <div className="flex justify-between items-center text-emerald-400 font-bold">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> Refund Status:
                      </span>
                      <span>SUCCESSFUL</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Amount Refunded:</span>
                      <span className="font-bold text-white">₹10.00 (100% Full Refund)</span>
                    </div>
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>Destination UPI:</span>
                      <span className="font-mono text-slate-300">{upiId || `${phone}@upi`}</span>
                    </div>
                    <div className="flex justify-between text-slate-500 text-[10px]">
                      <span>Match ID:</span>
                      <span className="font-mono">{refundData.matchId}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setRefundData(null);
                      if (socketRef.current) {
                        socketRef.current.emit("join_lobby", {
                          shopCode,
                          pin: pinInput.trim() || shop?.currentPin || "1234",
                          phone,
                          displayName,
                          upiId,
                          paymentOrderId,
                        });
                      }
                    }}
                    className="w-full h-12 rounded-xl font-bold text-xs bg-brand-500 hover:bg-brand-600 text-white transition flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="w-4 h-4" /> Re-enter Stall Lobby
                  </button>
                </div>
              </div>
            )}

            {/* ---------------- 3B. LIVE MATCHMAKING LOBBY (LOBBY_OPEN) ---------------- */}
            {!refundData &&
              !activeQuestion &&
              !matchWinner &&
              (lobbyState?.stage === "LOBBY_OPEN" ||
                lobbyState?.stage === "WAITING_FOR_PLAYERS" ||
                readyCountdown !== null) && (
                <div className="space-y-4 my-auto">
                  <div className="p-5 rounded-3xl bg-gradient-to-b from-[#182338] to-[#101726] border border-slate-800 text-center space-y-4 shadow-2xl relative overflow-hidden">
                    {/* GET READY 5-SECOND OVERLAY */}
                    {readyCountdown !== null && (
                      <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md z-30 flex flex-col items-center justify-center space-y-3 p-6 animate-fadeIn">
                        <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-brand-600 to-amber-500 flex items-center justify-center mx-auto shadow-2xl shadow-brand-500/40 animate-pulse">
                          <span className="text-5xl font-black text-white">{readyCountdown}</span>
                        </div>
                        <h3 className="text-xl font-black text-white">Lobby Locked!</h3>
                        <p className="text-xs text-amber-300 font-semibold max-w-xs text-center">
                          Get Ready! 9 rapid questions in 90 seconds. Fastest hand wins tie-breakers!
                        </p>
                      </div>
                    )}

                    {/* Stall Badge */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-500/15 border border-brand-500/30 text-brand-400 font-bold">
                        <Store className="w-3.5 h-3.5" /> {shop?.name}
                      </span>
                      <span className="text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Entry Paid
                      </span>
                    </div>

                    {/* 60-Second Countdown & Pot Banner */}
                    <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-left">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">
                            60s Matchmaking Timer
                          </span>
                          <span className="text-2xl font-mono font-black text-amber-400 flex items-center gap-1.5">
                            <Clock className="w-5 h-5 text-amber-400" />
                            {lobbyState?.secondsRemaining ?? 60}s
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">
                            Winner Prize (70%)
                          </span>
                          <span className="text-2xl font-black text-emerald-400">
                            {formatPaiseToRupees(currentPrizePool)}
                          </span>
                        </div>
                      </div>

                      {/* 10-Player Capacity Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-bold">
                          <span className="text-slate-300">
                            Lobby Cap: {lobbyState?.players.length || 1}/10 Players
                          </span>
                          <span className="text-amber-400">
                            {(lobbyState?.players.length || 1) < 4
                              ? `Need ${4 - (lobbyState?.players.length || 1)} more`
                              : "Match Ready!"}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden flex">
                          <div
                            className="bg-gradient-to-r from-brand-500 to-amber-500 h-full transition-all duration-300"
                            style={{
                              width: `${((lobbyState?.players.length || 1) / 10) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Joined Players List */}
                    <div className="space-y-2 text-left">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                        <span className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-brand-400" /> Joined Players (
                          {lobbyState?.players.length || 1})
                        </span>
                        <span className="text-[10px] text-slate-500">Min 4 • Max 10</span>
                      </div>

                      <div className="space-y-1.5 max-h-36 overflow-y-auto">
                        {(lobbyState?.players || []).map((p, idx) => (
                          <div
                            key={p.socketId || idx}
                            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 rounded-full bg-brand-500/20 text-brand-400 font-bold text-[10px] flex items-center justify-center">
                                {idx + 1}
                              </div>
                              <span className="font-semibold text-white">
                                {p.displayName} {p.phone.includes(myPhone) ? "(You)" : ""}
                              </span>
                            </div>
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                              PAID ₹10
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Minimum 4 players rule notice */}
                    <p className="text-[10px] text-slate-500 leading-tight">
                      Notice: If fewer than 4 players join before the 60s timer expires, the match is
                      cancelled and your ₹10 is instantly refunded to your UPI ID.
                    </p>

                    {/* Local Simulation & Testing Controls */}
                    <div className="pt-2 border-t border-slate-800 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleSimulateMultipleRivals(3)}
                          className="py-2 px-2 text-[11px] font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                        >
                          +3 Rivals (Reach 4)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSimulateMultipleRivals(9)}
                          className="py-2 px-2 text-[11px] font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                        >
                          +9 Rivals (Cap 10)
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={handleTriggerRefundTest}
                          className="py-2 px-2 text-[11px] font-bold rounded-xl bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 transition"
                        >
                          Test Refund (&lt;4)
                        </button>
                        <button
                          type="button"
                          onClick={handleForceStart}
                          className="py-2 px-2 text-[11px] font-bold rounded-xl bg-brand-600 hover:bg-brand-500 text-white transition"
                        >
                          Instant Start
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            {/* ---------------- 3C. 90-SECOND SYNCHRONOUS QUIZ ARENA ---------------- */}
            {!refundData && activeQuestion && (
              <div className="space-y-4 my-auto">
                {/* Question Progress Tracker & 10s Timer */}
                <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                  <span className="bg-slate-800 px-3 py-1 rounded-xl text-brand-400 font-bold border border-slate-700">
                    Question {questionIndex + 1} of {totalQuestions}
                  </span>
                  <span className="flex items-center gap-1.5 text-amber-400 font-mono font-bold bg-amber-500/10 px-3 py-1 rounded-xl border border-amber-500/20 text-sm">
                    <Timer className="w-4 h-4" /> {timerSecondsLeft.toFixed(1)}s
                  </span>
                </div>

                {/* 10-Second Visual Countdown Bar */}
                <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700">
                  <div
                    className={`h-full rounded-full transition-all duration-100 ${
                      timerSecondsLeft > 4
                        ? "bg-gradient-to-r from-brand-500 to-amber-500"
                        : timerSecondsLeft > 2
                        ? "bg-amber-400"
                        : "bg-rose-500 animate-pulse"
                    }`}
                    style={{ width: `${(timerSecondsLeft / 10) * 100}%` }}
                  />
                </div>

                {/* Question Card */}
                <div className="p-5 rounded-3xl bg-gradient-to-br from-[#182339] to-[#111827] border border-slate-800 shadow-2xl min-h-[120px] flex items-center justify-center text-center">
                  <p className="text-base font-bold text-white leading-snug">
                    {activeQuestion.questionText}
                  </p>
                </div>

                {/* 4 Thumb-Friendly Answer Options */}
                <div className="grid grid-cols-1 gap-2.5">
                  {activeQuestion.options.map((option, idx) => {
                    const isSelected = selectedOption === idx;
                    const isCorrect = correctOptionIndex === idx;
                    const isRevealed = correctOptionIndex !== null;

                    let btnStyle =
                      "min-h-[54px] p-4 rounded-2xl border text-left font-semibold text-sm transition flex items-center justify-between ";

                    if (isRevealed) {
                      if (isCorrect) {
                        btnStyle +=
                          "bg-emerald-600/30 border-emerald-500 text-emerald-200 shadow-lg shadow-emerald-500/20 ";
                      } else if (isSelected && !isCorrect) {
                        btnStyle += "bg-rose-600/30 border-rose-500 text-rose-200 ";
                      } else {
                        btnStyle += "bg-slate-900/60 border-slate-800 text-slate-500 opacity-60 ";
                      }
                    } else if (isSelected) {
                      btnStyle +=
                        "bg-brand-500/30 border-brand-500 text-white shadow-md shadow-brand-500/20 ";
                    } else {
                      btnStyle +=
                        "bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-200 active:scale-[0.99] ";
                    }

                    return (
                      <button
                        key={idx}
                        disabled={selectedOption !== null || isRevealed}
                        onClick={() => handleOptionClick(idx)}
                        className={btnStyle}
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center shrink-0">
                            {["A", "B", "C", "D"][idx]}
                          </span>
                          <span className="leading-snug">{option}</span>
                        </div>

                        {isRevealed && isCorrect && (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                        )}
                        {isRevealed && isSelected && !isCorrect && (
                          <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Instant Tap & Latency Feedback */}
                {selectedOption !== null && correctOptionIndex === null && (
                  <div className="text-center space-y-0.5">
                    <p className="text-xs font-bold text-brand-400 animate-pulse flex items-center justify-center gap-1">
                      <Zap className="w-3.5 h-3.5 fill-current" /> Tap locked in{" "}
                      {answeredLatencyMs ? (answeredLatencyMs / 1000).toFixed(2) : "1.0"}s!
                    </p>
                    <p className="text-[10px] text-slate-500">Fastest hands earn up to 150 points.</p>
                  </div>
                )}

                {/* Interim Leaderboard between questions */}
                {correctOptionIndex !== null && (
                  <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800 text-xs space-y-1.5 animate-fadeIn">
                    <div className="flex justify-between text-[10px] font-bold uppercase text-slate-400">
                      <span>Live Standings</span>
                      <span>Reaction Time</span>
                    </div>
                    {interimLeaderboard.slice(0, 4).map((item, idx) => (
                      <div key={item.playerId} className="flex justify-between text-slate-300">
                        <span className="font-semibold">
                          {idx + 1}. {item.displayName}
                        </span>
                        <div className="space-x-2">
                          <span className="text-[11px] text-slate-400 font-mono">
                            {(item.cumulativeResponseMs / 1000).toFixed(2)}s
                          </span>
                          <span className="font-bold text-amber-400">{item.score} pts</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ---------------- 3D. WINNER PODIUM SCREEN ---------------- */}
            {!refundData && matchWinner && (
              <div className="space-y-4 my-auto text-center">
                <div className="p-6 rounded-3xl bg-gradient-to-b from-[#1c273e] to-[#111827] border border-amber-500/40 shadow-2xl space-y-4">
                  {/* Golden Trophy */}
                  <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center mx-auto shadow-2xl shadow-amber-500/30 animate-bounce-short">
                    <Trophy className="w-10 h-10 text-slate-950 fill-current" />
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] uppercase font-bold text-amber-400 tracking-wider">
                      Speed Match Champion
                    </span>
                    <h2 className="text-2xl font-black text-white">{matchWinner.displayName}</h2>
                    <p className="text-xs text-slate-400">
                      Score: <span className="text-amber-400 font-bold">{matchWinner.score} pts</span> • Reaction:{" "}
                      <span className="text-slate-300 font-mono">
                        {(matchWinner.cumulativeResponseMs / 1000).toFixed(2)}s
                      </span>
                    </p>
                  </div>

                  {/* Instant UPI Payout Badge */}
                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-left space-y-1.5 text-xs">
                    <div className="flex justify-between items-center text-emerald-400 font-black">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> Winner UPI Payout (70%):
                      </span>
                      <span className="text-sm">
                        {formatPaiseToRupees(settledPot?.winnerPrizePoolPaise || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Transferred to UPI:</span>
                      <span className="font-mono text-slate-300">{payoutResult?.upiId || "UPI Verified"}</span>
                    </div>
                    {payoutResult?.payoutId && (
                      <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                        <span>Ref ID:</span>
                        <span>{payoutResult.payoutId}</span>
                      </div>
                    )}
                  </div>

                  {/* 70 / 10 / 20 Financial Breakdown */}
                  {settledPot && (
                    <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 space-y-1 text-xs text-left">
                      <div className="flex justify-between text-slate-400">
                        <span>Total Match Pot:</span>
                        <span className="font-bold text-white">
                          {formatPaiseToRupees(settledPot.totalPotPaise)}
                        </span>
                      </div>
                      <div className="flex justify-between text-amber-400 font-semibold">
                        <span>Stall Vendor Commission (10%):</span>
                        <span>{formatPaiseToRupees(settledPot.vendorSharePaise)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500 text-[11px]">
                        <span>Platform Retained (20%):</span>
                        <span>{formatPaiseToRupees(settledPot.platformSharePaise)}</span>
                      </div>
                    </div>
                  )}

                  {/* Full Podium Rankings */}
                  <div className="space-y-1.5 text-left">
                    <span className="text-[11px] font-bold text-slate-400 block">
                      Podium Standings (Fastest Hand Wins):
                    </span>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {finalLeaderboard.map((item, idx) => (
                        <div
                          key={item.playerId}
                          className={`px-3 py-2 rounded-xl border flex items-center justify-between text-xs ${
                            idx === 0
                              ? "bg-amber-500/10 border-amber-500/30 text-white font-bold"
                              : "bg-slate-900 border-slate-800 text-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span>{idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`}</span>
                            <span>{item.displayName}</span>
                          </div>
                          <div className="space-x-2">
                            <span className="text-[10px] text-slate-400 font-mono">
                              {(item.cumulativeResponseMs / 1000).toFixed(2)}s
                            </span>
                            <span className="font-bold text-amber-400">{item.score} pts</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setMatchWinner(null);
                      setSettledPot(null);
                      setPayoutResult(null);
                      setCurrentStep("PLAYER_PAYMENT");
                    }}
                    className="w-full py-3 px-4 rounded-xl font-bold text-xs bg-brand-500 hover:bg-brand-600 text-white transition shadow-lg shadow-brand-500/20"
                  >
                    Play Another ₹10 Round
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="text-center text-[10px] text-slate-500 px-4 mt-auto">
        GullyQuiz QR • 90-Second Speed Trivia for Rural Micro-Businesses
      </footer>
    </main>
  );
}
