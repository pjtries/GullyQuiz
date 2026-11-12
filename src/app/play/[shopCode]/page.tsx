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
} from "lucide-react";
import {
  ShopLobbyState,
  SanitizedQuestion,
  PlayerScoreSummary,
  PotBreakdown,
  formatPaiseToRupees,
} from "../../../lib/types";
import { PilotShopData } from "../../../lib/pilotShops";

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

type FlowStep = "PIN_GATE" | "PLAYER_PAYMENT" | "UPI_MODAL" | "ARENA_LOBBY";

export default function PlayShopPage() {
  const params = useParams();
  const router = useRouter();
  const rawShopCode = (params?.shopCode as string) || "SHP_001";
  const shopCode = rawShopCode.toUpperCase();

  // Shop Data & Loading
  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [allShops, setAllShops] = useState<ShopInfo[]>([]);
  const [isLoadingShop, setIsLoadingShop] = useState(true);
  const [shopError, setShopError] = useState<string | null>(null);

  // Flow State
  const [currentStep, setCurrentStep] = useState<FlowStep>("PIN_GATE");
  const [pinInput, setPinInput] = useState("");
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  // Player Profile State (with localStorage persistence)
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [upiId, setUpiId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Payment State
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentOrderId, setPaymentOrderId] = useState<string | null>(null);
  const [upiIntentUrl, setUpiIntentUrl] = useState<string | null>(null);
  const [paymentProvider, setPaymentProvider] = useState<string>("MOCK");
  const [selectedUpiApp, setSelectedUpiApp] = useState<string>("gpay");

  // Socket & Live Arena State
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lobbyState, setLobbyState] = useState<ShopLobbyState | null>(null);
  const [countdownRemaining, setCountdownRemaining] = useState<number | null>(null);

  // Active Question State
  const [activeQuestion, setActiveQuestion] = useState<SanitizedQuestion | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(5);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [questionStartTime, setQuestionStartTime] = useState<number>(0);
  const [timerSecondsLeft, setTimerSecondsLeft] = useState<number>(10);
  const [correctOptionIndex, setCorrectOptionIndex] = useState<number | null>(null);
  const [interimLeaderboard, setInterimLeaderboard] = useState<PlayerScoreSummary[]>([]);

  // Post Match Settlement
  const [matchWinner, setMatchWinner] = useState<PlayerScoreSummary | null>(null);
  const [finalLeaderboard, setFinalLeaderboard] = useState<PlayerScoreSummary[]>([]);
  const [settledPot, setSettledPot] = useState<PotBreakdown | null>(null);

  // 1. Load saved player profile from localStorage
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
      console.warn("Failed to load player profile from localStorage:", e);
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

    // Also fetch all pilot shops as fallback options
    fetch("/api/shops")
      .then((res) => res.json())
      .then((data) => {
        if (data.shops) setAllShops(data.shops);
      })
      .catch(() => {});
  }, [shopCode]);

  // 3. Initialize Socket.io connection
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
      setActiveQuestion(null);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // 4. 10s Question Countdown Timer ticker
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

      // PIN is valid! Move to Player Profile & Payment step
      setIsVerifyingPin(false);
      setCurrentStep("PLAYER_PAYMENT");
    } catch (err) {
      console.error("PIN verification error:", err);
      setPinError("Failed to verify PIN. Please try again.");
      setIsVerifyingPin(false);
    }
  };

  // STEP 2: Save Profile & Initiate ₹10 Payment
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

    // Persist to localStorage
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
      // 1. Create ₹10 payment order via backend API
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
      setPaymentProvider(data.provider);
      setIsProcessingPayment(false);

      // Open UPI App Simulator / Intent Modal
      setCurrentStep("UPI_MODAL");
    } catch (err: any) {
      console.error("Payment initiation error:", err);
      setFormError(err.message || "Failed to start ₹10 payment.");
      setIsProcessingPayment(false);
    }
  };

  // STEP 3: Complete & Verify Payment -> Enter WebSocket Lobby
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

      // 2. Connect socket to the live lobby room for this shop
      if (socketRef.current) {
        socketRef.current.emit("join_lobby", {
          shopCode,
          pin: pinInput.trim(),
          phone: cleanPhone,
          displayName: cleanName,
        });
      }

      setIsProcessingPayment(false);
      setCurrentStep("ARENA_LOBBY");
    } catch (err: any) {
      console.error("Verification error:", err);
      alert(err.message || "Could not confirm ₹10 payment.");
      setIsProcessingPayment(false);
    }
  };

  // Arena Question Option Click
  const handleOptionClick = (index: number) => {
    if (selectedOption !== null || correctOptionIndex !== null || !socketRef.current || !lobbyState) {
      return;
    }

    setSelectedOption(index);
    socketRef.current.emit("submit_answer", {
      shopCode: lobbyState.shopCode,
      matchId: lobbyState.matchId,
      questionIndex,
      selectedOptionIndex: index,
    });
  };

  // Local testing helpers
  const handleSimulateRival = () => {
    const rivalSocket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });

    const randomNum = Math.floor(100 + Math.random() * 900);
    const rivalNames = ["Priya Sharma", "Amit Patel", "Deepak Verma", "Karan Singh", "Ananya Das"];
    const rivalName = rivalNames[Math.floor(Math.random() * rivalNames.length)];

    rivalSocket.on("connect", () => {
      rivalSocket.emit("join_lobby", {
        shopCode,
        pin: pinInput.trim() || shop?.currentPin || "1234",
        phone: `+9198765${randomNum}`,
        displayName: rivalName,
      });
    });

    rivalSocket.on("question_started", (data) => {
      const delay = 1200 + Math.random() * 2500;
      setTimeout(() => {
        rivalSocket.emit("submit_answer", {
          shopCode,
          matchId: lobbyState?.matchId || "",
          questionIndex: data.questionIndex,
          selectedOptionIndex: Math.random() > 0.3 ? 0 : 1,
        });
      }, delay);
    });
  };

  const handleForceStart = () => {
    if (!socketRef.current) return;
    socketRef.current.emit("force_start_match", {
      shopCode,
      pin: pinInput.trim() || shop?.currentPin || "1234",
    });
  };

  return (
    <main className="w-full max-w-md mx-auto min-h-screen flex flex-col bg-[#0b0f19] text-slate-100 shadow-2xl relative">
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
                QR
              </span>
            </div>
            <p className="text-[10px] text-slate-400 -mt-0.5">Speed Trivia Arenas</p>
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

        {/* ERROR STATE: INVALID OR INACTIVE SHOP */}
        {!isLoadingShop && shopError && (
          <div className="my-auto space-y-5">
            <div className="p-6 rounded-3xl bg-[#161d2d] border border-rose-500/30 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
                <AlertCircle className="w-7 h-7" />
              </div>

              <div className="space-y-1">
                <h2 className="text-lg font-black text-white">Arena Not Found</h2>
                <p className="text-xs text-slate-400">
                  Stall code <span className="font-mono text-rose-300 font-bold">&quot;{shopCode}&quot;</span> is not registered or is currently inactive.
                </p>
              </div>

              {/* Selector to choose a valid pilot stall */}
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
                        <span className="text-[10px] text-slate-400 font-mono">{s.shopCode} • {s.ownerName}</span>
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
            {/* Stall Welcome Banner */}
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-500/15 border border-brand-500/30 text-brand-400 text-xs font-bold">
                <Coffee className="w-3.5 h-3.5" />
                Live Stall Speed Arena
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight leading-tight">
                Welcome to <br />
                <span className="text-brand-500">{shop.name}</span>
              </h1>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Managed by <span className="text-slate-300 font-semibold">{shop.ownerName}</span> • ₹10 Entry Speed Trivia
              </p>
            </div>

            {/* PIN Entry Card */}
            <form
              onSubmit={handleVerifyPin}
              className="p-5 rounded-3xl bg-gradient-to-b from-[#182339] to-[#111827] border border-slate-800 shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                <KeyRound className="w-4 h-4" />
                <span>STEP 1: ENTER STALL 4-DIGIT PIN</span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Check the 4-digit PIN displayed on the physical QR counter standee:
              </p>

              {/* Large 4-digit PIN input */}
              <div className="space-y-2">
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
                    if (val.length === 4) {
                      setPinError(null);
                    }
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
              </div>

              {/* Quick local test PIN hint pill */}
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

              {/* Large Thumb-Friendly Submit Button */}
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

            {/* Micro footer guarantee */}
            <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Rotates hourly to prevent remote cheating</span>
            </div>
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
              <h2 className="text-xl font-black text-white">Player Profile & ₹10 Entry</h2>
              <p className="text-xs text-slate-400">
                Saved locally on your device for one-tap entry next time!
              </p>
            </div>

            <form
              onSubmit={handleInitiatePayment}
              className="p-5 rounded-3xl bg-gradient-to-b from-[#182339] to-[#111827] border border-slate-800 shadow-2xl space-y-3.5"
            >
              {/* Phone Input */}
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Mobile Number (10-digit Indian Mobile)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3.5 text-xs font-bold text-slate-400">
                    +91
                  </span>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                    placeholder="9876543210"
                    required
                    className="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl pl-12 pr-3 text-sm font-semibold text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              {/* Display Name Input */}
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Speed Nickname (Visible in Arena)
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    maxLength={20}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Raju Speedster"
                    required
                    className="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-3 text-sm font-semibold text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              {/* UPI ID for Prize Payout */}
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  UPI ID (For Instant ₹ Winner Payout)
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

              {/* Pot Distribution Breakdown */}
              <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-[11px] space-y-1.5">
                <div className="flex justify-between text-slate-300 font-bold">
                  <span>Entry Fee:</span>
                  <span className="text-white text-xs">₹10.00 (1000 Paise)</span>
                </div>
                <div className="flex justify-between text-emerald-400">
                  <span>Winner Prize Pool (70%):</span>
                  <span className="font-bold">₹7.00 per player</span>
                </div>
                <div className="flex justify-between text-amber-400">
                  <span>Tea Stall Commission (20%):</span>
                  <span className="font-bold">₹2.00 per player</span>
                </div>
              </div>

              {/* Big High-Contrast Thumb-Friendly Pay Button */}
              <button
                type="submit"
                disabled={isProcessingPayment}
                className="w-full h-14 rounded-2xl font-black text-sm tracking-wide bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 shadow-xl shadow-emerald-500/20 active:scale-[0.98] transition flex items-center justify-center gap-2 disabled:opacity-50"
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

        {/* ================= STEP 2.5: SIMULATED UPI APP MODAL ================= */}
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
                    { id: "gpay", name: "Google Pay", color: "bg-blue-600/20 border-blue-500/40" },
                    { id: "phonepe", name: "PhonePe", color: "bg-purple-600/20 border-purple-500/40" },
                    { id: "paytm", name: "Paytm UPI", color: "bg-sky-600/20 border-sky-500/40" },
                    { id: "bhim", name: "BHIM UPI", color: "bg-orange-600/20 border-orange-500/40" },
                  ].map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => setSelectedUpiApp(app.id)}
                      className={`p-3 rounded-xl border text-xs font-bold text-left transition flex items-center justify-between ${
                        selectedUpiApp === app.id
                          ? "bg-brand-500/20 border-brand-500 text-white shadow-md shadow-brand-500/20"
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

              {/* UPI Intent link representation */}
              {upiIntentUrl && (
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400 break-all">
                  <span className="text-slate-500 block">NPCI Intent URI:</span>
                  {upiIntentUrl}
                </div>
              )}

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
                    <span>Confirm ₹10 Payment & Join Lobby</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 3: LIVE LOBBY & SPEED ARENA ================= */}
        {currentStep === "ARENA_LOBBY" && (
          <div className="flex-1 flex flex-col justify-between space-y-4">
            {/* LOBBY WAITING STAGE */}
            {lobbyState?.stage === "WAITING_FOR_PLAYERS" && (
              <div className="space-y-4 my-auto">
                <div className="p-5 rounded-3xl bg-gradient-to-b from-[#182338] to-[#101726] border border-slate-800 text-center space-y-3 shadow-2xl">
                  <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30">
                    <CheckCircle2 className="w-3.5 h-3.5" /> ₹10 Entry Confirmed
                  </div>

                  <h2 className="text-xl font-black text-white">{shop?.name}</h2>
                  <p className="text-xs text-slate-400">
                    Waiting for stall opponents. Match starts automatically when 2+ players join!
                  </p>

                  {/* Pot Summary */}
                  <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800 grid grid-cols-2 gap-2 text-center">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Total Pot</span>
                      <p className="text-xl font-black text-amber-400">
                        {formatPaiseToRupees(lobbyState.pot.totalPotPaise)}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">1st Prize (70%)</span>
                      <p className="text-xl font-black text-emerald-400">
                        {formatPaiseToRupees(lobbyState.pot.winnerPrizePoolPaise)}
                      </p>
                    </div>
                  </div>

                  {/* Joined Competitors */}
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
                          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between"
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

                  {/* Local Testing Action Buttons */}
                  <div className="pt-2 border-t border-slate-800 space-y-2">
                    <button
                      onClick={handleSimulateRival}
                      className="w-full py-2.5 px-3 text-xs font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition flex items-center justify-center gap-1.5"
                    >
                      <Users className="w-3.5 h-3.5 text-brand-400" /> Simulate Rival Player Joining
                    </button>
                    <button
                      onClick={handleForceStart}
                      className="w-full py-2.5 px-3 text-xs font-bold rounded-xl bg-brand-600 hover:bg-brand-500 text-white transition flex items-center justify-center gap-1.5"
                    >
                      <Zap className="w-3.5 h-3.5 fill-current" /> Instant Start Round
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* COUNTDOWN STAGE */}
            {(lobbyState?.stage === "LOBBY_COUNTDOWN" || countdownRemaining !== null) && (
              <div className="my-auto text-center space-y-4">
                <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-brand-600 to-amber-500 flex items-center justify-center mx-auto shadow-2xl shadow-brand-500/30 animate-pulse">
                  <span className="text-4xl font-black text-white">{countdownRemaining ?? 5}</span>
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-black text-white">Round Starting!</h3>
                  <p className="text-xs text-slate-400">10 seconds per question. Speed earns bonuses!</p>
                </div>
              </div>
            )}

            {/* LIVE QUESTION ARENA */}
            {(lobbyState?.stage === "QUESTION_ACTIVE" || lobbyState?.stage === "QUESTION_INTERMISSION") &&
              activeQuestion && (
                <div className="space-y-4 my-auto">
                  {/* Status Bar */}
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                    <span className="bg-slate-800 px-2.5 py-1 rounded-lg text-brand-400 font-bold">
                      Question {questionIndex + 1} of {totalQuestions}
                    </span>
                    <span className="flex items-center gap-1 text-amber-400 font-mono font-bold bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                      <Timer className="w-3.5 h-3.5" /> {timerSecondsLeft}s
                    </span>
                  </div>

                  {/* Timer Bar */}
                  <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
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

                  {/* Question Card */}
                  <div className="p-5 rounded-3xl bg-gradient-to-br from-[#182339] to-[#111827] border border-slate-800 shadow-xl min-h-[120px] flex items-center justify-center text-center">
                    <p className="text-base font-bold text-white leading-snug">
                      {activeQuestion.questionText}
                    </p>
                  </div>

                  {/* 4 Answer Options */}
                  <div className="grid grid-cols-1 gap-2.5">
                    {activeQuestion.options.map((option, idx) => {
                      const isSelected = selectedOption === idx;
                      const isCorrect = correctOptionIndex === idx;
                      const isRevealed = correctOptionIndex !== null;

                      let btnStyle =
                        "p-4 rounded-2xl border text-left font-semibold text-sm transition flex items-center justify-between ";

                      if (isRevealed) {
                        if (isCorrect) {
                          btnStyle += "bg-emerald-600/30 border-emerald-500 text-emerald-200 shadow-lg shadow-emerald-500/20 ";
                        } else if (isSelected && !isCorrect) {
                          btnStyle += "bg-rose-600/30 border-rose-500 text-rose-200 ";
                        } else {
                          btnStyle += "bg-slate-900/60 border-slate-800 text-slate-500 opacity-60 ";
                        }
                      } else if (isSelected) {
                        btnStyle += "bg-brand-500/30 border-brand-500 text-white shadow-md shadow-brand-500/20 ";
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
                            <span className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center">
                              {["A", "B", "C", "D"][idx]}
                            </span>
                            <span>{option}</span>
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

                  {/* Interim Standings */}
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

            {/* MATCH FINISHED PODIUM */}
            {lobbyState?.stage === "MATCH_FINISHED" && (
              <div className="space-y-4 my-auto text-center">
                <div className="p-6 rounded-3xl bg-gradient-to-b from-[#1c273e] to-[#111827] border border-amber-500/30 shadow-2xl space-y-3">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/30">
                    <Trophy className="w-8 h-8 text-slate-950 fill-current" />
                  </div>

                  <div>
                    <span className="text-xs uppercase font-bold text-amber-400 tracking-wider">
                      Speed Match Winner
                    </span>
                    <h2 className="text-2xl font-black text-white">{matchWinner?.displayName || "Champion"}</h2>
                    <p className="text-xs text-slate-400">Score: {matchWinner?.score || 0} pts</p>
                  </div>

                  {settledPot && (
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5 text-xs text-left">
                      <div className="flex justify-between text-emerald-400 font-bold">
                        <span>Winner UPI Payout (70%):</span>
                        <span>{formatPaiseToRupees(settledPot.winnerPrizePoolPaise)}</span>
                      </div>
                      <div className="flex justify-between text-amber-400 font-semibold">
                        <span>Stall Vendor Commission (20%):</span>
                        <span>{formatPaiseToRupees(settledPot.vendorSharePaise)}</span>
                      </div>
                    </div>
                  )}

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
                      setCurrentStep("PLAYER_PAYMENT");
                      setMatchWinner(null);
                      setSettledPot(null);
                    }}
                    className="w-full py-3 px-4 rounded-xl font-bold text-xs bg-brand-500 hover:bg-brand-600 text-white transition"
                  >
                    Play Another ₹10 Round
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Branding */}
      <footer className="text-center text-[10px] text-slate-500 p-4 border-t border-slate-900">
        GullyQuiz QR • Instant ₹10 Rural Trivia Arenas
      </footer>
    </main>
  );
}
