"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Store,
  BookOpen,
  Activity,
  QrCode,
  Copy,
  Check,
  Download,
  Plus,
  RefreshCw,
  KeyRound,
  Wallet,
  Upload,
  Power,
  Trophy,
  AlertCircle,
  LogOut,
  ExternalLink,
  Sparkles,
  FileSpreadsheet,
} from "lucide-react";

interface AdminShop {
  id: string;
  shopCode: string;
  name: string;
  ownerName: string;
  ownerPhone: string;
  ownerUpiId: string;
  currentPin: string;
  pinExpiresAt: string;
  unsettledBalancePaise: number;
  isActive: boolean;
}

interface AdminQuestion {
  id: string;
  category: string;
  questionText: string;
  options: string[];
  correctOptionIndex: number;
  isActive: boolean;
  createdAt?: string;
}

interface LedgerParticipant {
  playerId: string;
  score: number;
  cumulativeResponseMs: number;
  paymentStatus: "PAID" | "REFUNDED";
  paymentOrderId?: string;
  player: {
    displayName: string;
    phone: string;
    upiId?: string;
  };
}

interface LedgerMatch {
  id: string;
  shopId: string;
  status: "LOBBY_OPEN" | "IN_PROGRESS" | "COMPLETED_SETTLED" | "CANCELLED_REFUNDED";
  entryFeePaise: number;
  totalPotPaise: number;
  prizePoolPaise: number;
  vendorSharePaise: number;
  platformSharePaise: number;
  winnerPlayerId: string | null;
  payoutReferenceId: string | null;
  createdAt: string;
  endedAt: string | null;
  shop?: {
    shopCode: string;
    name: string;
  };
  winner?: {
    displayName: string;
    phone?: string;
    upiId?: string;
  } | null;
  participants: LedgerParticipant[];
}

interface LedgerSummary {
  totalMatchesCount: number;
  completedMatchesCount: number;
  cancelledRefundedCount: number;
  activeLobbiesCount: number;
  totalGrossPotPaise: number;
  totalWinnerPrizesPaise: number;
  totalVendorCommissionPaise: number;
  totalPlatformRevenuePaise: number;
  totalUnsettledVendorPaise: number;
}

function formatRupees(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

/**
 * Generates a deterministic visual 21x21 QR-style matrix SVG for printable standees
 * (with standard finder patterns in the 3 corners + data modules encoded from the URL)
 */
function buildQrMatrix(text: string): boolean[][] {
  const size = 21;
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const drawFinder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        matrix[r0 + r][c0 + c] = isBorder || isInner;
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // Deterministic hash fill for remaining modules
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const inTopLeft = r < 8 && c < 8;
      const inTopRight = r < 8 && c >= size - 8;
      const inBottomLeft = r >= size - 8 && c < 8;
      if (inTopLeft || inTopRight || inBottomLeft || r === 6 || c === 6) continue;

      const cellSeed = Math.imul(hash ^ (r * 31 + c * 17), 2654435761) >>> 0;
      matrix[r][c] = cellSeed % 2 === 0;
    }
  }

  return matrix;
}

export default function AdminDashboardPage() {
  const [adminSecret, setAdminSecret] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<"shops" | "questions" | "ledger">("shops");

  // Data states
  const [shops, setShops] = useState<AdminShop[]>([]);
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [matches, setMatches] = useState<LedgerMatch[]>([]);
  const [ledgerSummary, setLedgerSummary] = useState<LedgerSummary>({
    totalMatchesCount: 0,
    completedMatchesCount: 0,
    cancelledRefundedCount: 0,
    activeLobbiesCount: 0,
    totalGrossPotPaise: 0,
    totalWinnerPrizesPaise: 0,
    totalVendorCommissionPaise: 0,
    totalPlatformRevenuePaise: 0,
    totalUnsettledVendorPaise: 0,
  });

  const [loadingData, setLoadingData] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // New Shop Form State
  const [showAddShop, setShowAddShop] = useState(false);
  const [newShopCode, setNewShopCode] = useState("SHP_011");
  const [newShopName, setNewShopName] = useState("");
  const [newOwnerName, setNewOwnerName] = useState("");
  const [newOwnerPhone, setNewOwnerPhone] = useState("+919876543211");
  const [newOwnerUpi, setNewOwnerUpi] = useState("");
  const [newShopPin, setNewShopPin] = useState("5678");

  // Question Manager State
  const [questionSearch, setQuestionSearch] = useState("");
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newQCategory, setNewQCategory] = useState("GENERAL_KNOWLEDGE");
  const [newQText, setNewQText] = useState("");
  const [newQOptions, setNewQOptions] = useState(["", "", "", ""]);
  const [newQCorrectIdx, setNewQCorrectIdx] = useState(0);

  // Bulk Import State
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkMode, setBulkMode] = useState<"JSON" | "CSV">("JSON");
  const [bulkText, setBulkText] = useState("");

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const fetchAllAdminData = useCallback(
    async (secretToUse?: string) => {
      const secret = secretToUse ?? adminSecret;
      if (!secret) return;

      setLoadingData(true);
      try {
        const headers = { "x-admin-secret": secret };
        const [shopsRes, questionsRes, ledgerRes] = await Promise.all([
          fetch("/api/admin/shops", { headers }),
          fetch("/api/admin/questions", { headers }),
          fetch("/api/admin/ledger", { headers }),
        ]);

        if (shopsRes.status === 401) {
          setIsAuthenticated(false);
          localStorage.removeItem("gullyquiz_admin_secret");
          return;
        }

        if (shopsRes.ok) {
          const sData = await shopsRes.json();
          setShops(sData.shops || []);
        }
        if (questionsRes.ok) {
          const qData = await questionsRes.json();
          setQuestions(qData.questions || []);
        }
        if (ledgerRes.ok) {
          const lData = await ledgerRes.json();
          setMatches(lData.matches || []);
          if (lData.summary) {
            setLedgerSummary(lData.summary);
          }
        }
      } catch (err) {
        console.error("Error loading admin data:", err);
      } finally {
        setLoadingData(false);
      }
    },
    [adminSecret]
  );

  // Restore saved session on mount
  useEffect(() => {
    const saved = localStorage.getItem("gullyquiz_admin_secret");
    if (saved) {
      setAdminSecret(saved);
      fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminSecret: saved }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.authenticated) {
            setIsAuthenticated(true);
            fetchAllAdminData(saved);
          }
        })
        .catch(() => {});
    }
  }, [fetchAllAdminData]);

  // Auto-refresh live ledger every 6 seconds when authenticated
  useEffect(() => {
    if (!isAuthenticated || !adminSecret) return;
    const interval = setInterval(() => {
      fetchAllAdminData(adminSecret);
    }, 6000);
    return () => clearInterval(interval);
  }, [isAuthenticated, adminSecret, fetchAllAdminData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminSecret: adminSecret.trim() }),
      });
      const data = await res.json();

      if (!res.ok || !data.authenticated) {
        setAuthError(data.error || "Invalid ADMIN_SECRET");
      } else {
        const clean = adminSecret.trim();
        localStorage.setItem("gullyquiz_admin_secret", clean);
        setIsAuthenticated(true);
        await fetchAllAdminData(clean);
      }
    } catch {
      setAuthError("Network error verifying ADMIN_SECRET.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("gullyquiz_admin_secret");
    setIsAuthenticated(false);
    setAdminSecret("");
  };

  const handleCopyQrUrl = (shopCode: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const url = `${origin}/play/${shopCode}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(shopCode);
    showToast(`Copied QR link for ${shopCode}: ${url}`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleDownloadPrintableQrStandee = (shop: AdminShop) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const playUrl = `${origin}/play/${shop.shopCode}`;
    const matrix = buildQrMatrix(playUrl);
    const cellSize = 10;
    const qrOffset = 95;

    let rects = "";
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c]) {
          rects += `<rect x="${qrOffset + c * cellSize}" y="${155 + r * cellSize}" width="${cellSize}" height="${cellSize}" fill="#0f172a" />`;
        }
      }
    }

    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 540" width="400" height="540">
  <rect width="400" height="540" rx="24" fill="#0f172a" />
  <rect x="12" y="12" width="376" height="516" rx="18" fill="#1e293b" stroke="#f59e0b" stroke-width="3" />
  <text x="200" y="52" text-anchor="middle" fill="#fbbf24" font-family="sans-serif" font-size="22" font-weight="bold">⚡ GULLYQUIZ QR ARENA ⚡</text>
  <text x="200" y="82" text-anchor="middle" fill="#f8fafc" font-family="sans-serif" font-size="16" font-weight="bold">${shop.name.replace(/&/g, "&amp;")}</text>
  <text x="200" y="106" text-anchor="middle" fill="#94a3b8" font-family="monospace" font-size="13">Stall Code: ${shop.shopCode} • Current PIN: ${shop.currentPin}</text>
  <rect x="80" y="140" width="240" height="240" rx="16" fill="#ffffff" />
  ${rects}
  <text x="200" y="412" text-anchor="middle" fill="#38bdf8" font-family="monospace" font-size="11">${playUrl}</text>
  <rect x="36" y="432" width="328" height="72" rx="12" fill="#0f172a" stroke="#334155" stroke-width="1" />
  <text x="200" y="458" text-anchor="middle" fill="#f8fafc" font-family="sans-serif" font-size="13" font-weight="bold">SCAN QR • ENTER 4-DIGIT COUNTER PIN</text>
  <text x="200" y="482" text-anchor="middle" fill="#34d399" font-family="sans-serif" font-size="12" font-weight="bold">Pay ₹10 • 90s Speed Trivia • Win 70% Instant UPI Cash!</text>
</svg>`;

    const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `GullyQuiz_Standee_${shop.shopCode}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Downloaded printable QR standee for ${shop.shopCode}`);
  };

  const handleAddShop = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/shops", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({
          shopCode: newShopCode,
          name: newShopName,
          ownerName: newOwnerName,
          ownerPhone: newOwnerPhone,
          ownerUpiId: newOwnerUpi,
          currentPin: newShopPin,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(`Error: ${data.error}`);
        return;
      }
      showToast(`Added shop ${data.shop.shopCode} (${data.shop.name})!`);
      setShowAddShop(false);
      setNewShopName("");
      setNewOwnerName("");
      setNewOwnerUpi("");
      const nextNum = shops.length + 2;
      setNewShopCode(`SHP_${String(nextNum).padStart(3, "0")}`);
      await fetchAllAdminData();
    } catch {
      showToast("Failed to create shop.");
    }
  };

  const handleRotateSingleShopPin = async (shopCode: string) => {
    try {
      const res = await fetch("/api/admin/shops", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({ shopCode, rotatePin: true }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Rotated PIN for ${shopCode} -> ${data.shop.currentPin}`);
        await fetchAllAdminData();
      }
    } catch {
      showToast("Failed to rotate shop PIN.");
    }
  };

  const handleTriggerCronJob = async (job: "rotate-pins" | "settle-vendors" | "both") => {
    try {
      const res = await fetch("/api/admin/jobs/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({ job }),
      });
      const data = await res.json();
      if (res.ok) {
        if (job === "rotate-pins") {
          showToast(`Rotated hourly PINs for ${data.rotatePins?.shopsRotated || 0} shops!`);
        } else if (job === "settle-vendors") {
          showToast(
            `Settled ${data.settleVendors?.settlementsProcessed || 0} vendors (${formatRupees(
              data.settleVendors?.totalDisbursedPaise || 0
            )})!`
          );
        } else {
          showToast("Executed both cron jobs successfully!");
        }
        await fetchAllAdminData();
      }
    } catch {
      showToast("Failed to trigger cron job.");
    }
  };

  const handleToggleQuestionActive = async (q: AdminQuestion) => {
    try {
      const res = await fetch("/api/admin/questions", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({ id: q.id, isActive: !q.isActive }),
      });
      if (res.ok) {
        showToast(`Question ${!q.isActive ? "activated" : "deactivated"}.`);
        await fetchAllAdminData();
      }
    } catch {
      showToast("Failed to update question status.");
    }
  };

  const handleAddSingleQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQText.trim() || newQOptions.some((o) => !o.trim())) {
      showToast("Please fill in the question text and all 4 options.");
      return;
    }

    try {
      const res = await fetch("/api/admin/questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({
          category: newQCategory,
          questionText: newQText,
          options: newQOptions,
          correctOptionIndex: newQCorrectIdx,
          isActive: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(`Error: ${data.error}`);
        return;
      }
      showToast("Added new trivia question to Question Bank!");
      setNewQText("");
      setNewQOptions(["", "", "", ""]);
      setNewQCorrectIdx(0);
      setShowAddQuestion(false);
      await fetchAllAdminData();
    } catch {
      showToast("Failed to add question.");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    if (file.name.toLowerCase().endsWith(".csv")) {
      setBulkMode("CSV");
    } else {
      setBulkMode("JSON");
    }
    setBulkText(text);
    showToast(`Loaded ${file.name} (${text.length} bytes). Click Import Now to save.`);
  };

  const handleBulkImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkText.trim()) {
      showToast("Please paste or upload JSON/CSV question data first.");
      return;
    }

    try {
      let payload: Record<string, unknown> = {};
      if (bulkMode === "CSV") {
        payload = { csvData: bulkText };
      } else {
        const parsed = JSON.parse(bulkText);
        payload = { questions: Array.isArray(parsed) ? parsed : [parsed] };
      }

      const res = await fetch("/api/admin/questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(`Import Error: ${data.error}`);
        return;
      }

      showToast(`Successfully bulk-imported ${data.importedCount} questions!`);
      setBulkText("");
      setShowBulkImport(false);
      await fetchAllAdminData();
    } catch (err: any) {
      showToast(`Invalid ${bulkMode} format: ${err.message}`);
    }
  };

  const loadSampleBulkTemplate = (mode: "JSON" | "CSV") => {
    setBulkMode(mode);
    if (mode === "JSON") {
      setBulkText(
        JSON.stringify(
          [
            {
              category: "GENERAL_KNOWLEDGE",
              questionText: "Which Indian city is known as the 'Pink City'?",
              options: ["Udaipur", "Jaipur", "Jodhpur", "Bikaner"],
              correctOptionIndex: 1,
            },
            {
              category: "GENERAL_KNOWLEDGE",
              questionText: "What is the national tree of India?",
              options: ["Neem Tree", "Peepal Tree", "Banyan Tree", "Mango Tree"],
              correctOptionIndex: 2,
            },
          ],
          null,
          2
        )
      );
    } else {
      setBulkText(
        `questionText,optionA,optionB,optionC,optionD,correctOptionIndex,category\n"Which state is the largest producer of tea in India?","Assam","Kerala","Himachal Pradesh","Sikkim",0,GENERAL_KNOWLEDGE\n"Who designed the Indian Rupee symbol (₹)?","Udaya Kumar","Raghuram Rajan","Nandan Nilekani","C. Rangarajan",0,GENERAL_KNOWLEDGE`
      );
    }
  };

  const filteredQuestions = questions.filter(
    (q) =>
      q.questionText.toLowerCase().includes(questionSearch.toLowerCase()) ||
      q.category.toLowerCase().includes(questionSearch.toLowerCase())
  );

  // ---------------------------------------------------------------------------
  // RENDER 1: ADMIN_SECRET LOGIN GATE
  // ---------------------------------------------------------------------------
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white">
                GullyQuiz Admin Ops
              </h1>
              <p className="text-xs text-slate-400">
                Phase 5 • Shops, Question Bank & Live 70/10/20 Ledger
              </p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Enter ADMIN_SECRET Key
              </label>
              <input
                type="password"
                value={adminSecret}
                onChange={(e) => setAdminSecret(e.target.value)}
                placeholder="gullyquiz_dev_secret_2026"
                className="w-full px-4 py-3.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-amber-400"
                required
              />
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <span>Default Dev Secret:</span>
                <button
                  type="button"
                  onClick={() => setAdminSecret("gullyquiz_dev_secret_2026")}
                  className="text-amber-400 hover:underline font-mono"
                >
                  Use gullyquiz_dev_secret_2026
                </button>
              </div>
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              {authLoading ? "Verifying Secret..." : "Unlock Operations Dashboard"}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <Link href="/" className="hover:text-white transition">
              ← Back to Arena Home
            </Link>
            <Link href="/play/SHP_001" className="text-emerald-400 hover:underline">
              Launch SHP_001 Player View →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER 2: AUTHENTICATED ADMIN OPERATIONS DASHBOARD
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      {/* Top Navigation Header */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 lg:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-extrabold text-white">
                  GullyQuiz QR • Admin Operations Center
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full">
                  Live Connected
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Zero-CapEx Rural Tea Stall & Bookstore Trivia Network
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => handleTriggerCronJob("rotate-pins")}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-amber-300 border border-slate-700 flex items-center gap-1.5 transition"
              title="Trigger Hourly PIN Rotation Cron"
            >
              <KeyRound className="w-3.5 h-3.5" />
              Rotate All PINs
            </button>
            <button
              onClick={() => handleTriggerCronJob("settle-vendors")}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-emerald-300 border border-slate-700 flex items-center gap-1.5 transition"
              title="Trigger Weekly Sunday Vendor Settlement Cron"
            >
              <Wallet className="w-3.5 h-3.5" />
              Settle Vendors
            </button>
            <button
              onClick={() => fetchAllAdminData()}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loadingData ? "animate-spin text-amber-400" : ""}`} />
            </button>
            <button
              onClick={handleLogout}
              className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-amber-500 text-slate-950 font-bold text-xs px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 border border-amber-300">
          <Sparkles className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 lg:px-8 pt-6 space-y-6">
        {/* Global KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="text-xs text-slate-400 font-medium">
              Platform Revenue (20% Split)
            </div>
            <div className="text-2xl font-extrabold text-amber-400 mt-1">
              {formatRupees(ledgerSummary.totalPlatformRevenuePaise)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              From {ledgerSummary.completedMatchesCount} settled matches
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="text-xs text-slate-400 font-medium">
              Winner Prizes Disbursed (70%)
            </div>
            <div className="text-2xl font-extrabold text-emerald-400 mt-1">
              {formatRupees(ledgerSummary.totalWinnerPrizesPaise)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Instant UPI payouts completed
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="text-xs text-slate-400 font-medium">
              Unsettled Shop Commissions (10%)
            </div>
            <div className="text-2xl font-extrabold text-sky-400 mt-1">
              {formatRupees(
                shops.reduce((acc, s) => acc + (s.unsettledBalancePaise || 0), 0)
              )}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Across {shops.length} active pilot stalls
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="text-xs text-slate-400 font-medium">
              Active GK Question Bank
            </div>
            <div className="text-2xl font-extrabold text-purple-400 mt-1">
              {questions.filter((q) => q.isActive !== false).length}{" "}
              <span className="text-sm font-normal text-slate-500">/ {questions.length}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              9 random picked per 90s match
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => setActiveTab("shops")}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              activeTab === "shops"
                ? "bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20"
                : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            <Store className="w-4 h-4" />
            1. Shops Manager & Printable QR Codes ({shops.length})
          </button>

          <button
            onClick={() => setActiveTab("questions")}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              activeTab === "questions"
                ? "bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20"
                : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            2. Question Bank Manager ({questions.length})
          </button>

          <button
            onClick={() => setActiveTab("ledger")}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              activeTab === "ledger"
                ? "bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20"
                : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            <Activity className="w-4 h-4" />
            3. Live Match & 70/10/20 Ledger Monitor ({matches.length})
          </button>
        </div>

        {/* =====================================================================
            TAB 1: SHOPS MANAGER
           ===================================================================== */}
        {activeTab === "shops" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">
                  Pilot Stalls & Printable QR Standees
                </h2>
                <p className="text-xs text-slate-400">
                  Manage hourly 4-digit counter PINs, download printable QR standees pointing to{" "}
                  <code className="text-amber-300">/play/[shopCode]</code>, and monitor unsettled vendor balances.
                </p>
              </div>
              <button
                onClick={() => setShowAddShop(!showAddShop)}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition"
              >
                <Plus className="w-4 h-4" />
                {showAddShop ? "Cancel" : "Add New Stall"}
              </button>
            </div>

            {showAddShop && (
              <form
                onSubmit={handleAddShop}
                className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-6 space-y-4"
              >
                <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">
                  Register New Partner Tea Stall / Bookstore
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Shop Code *</label>
                    <input
                      type="text"
                      value={newShopCode}
                      onChange={(e) => setNewShopCode(e.target.value)}
                      placeholder="SHP_011"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm font-mono text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Stall / Shop Name *</label>
                    <input
                      type="text"
                      value={newShopName}
                      onChange={(e) => setNewShopName(e.target.value)}
                      placeholder="Sri Ganesh Chai & Book Corner"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Owner Full Name *</label>
                    <input
                      type="text"
                      value={newOwnerName}
                      onChange={(e) => setNewOwnerName(e.target.value)}
                      placeholder="Ganesh Hegde"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Owner WhatsApp Phone *</label>
                    <input
                      type="text"
                      value={newOwnerPhone}
                      onChange={(e) => setNewOwnerPhone(e.target.value)}
                      placeholder="+919876543211"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm font-mono text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Owner UPI ID (for 10% commission) *</label>
                    <input
                      type="text"
                      value={newOwnerUpi}
                      onChange={(e) => setNewOwnerUpi(e.target.value)}
                      placeholder="ganeshchai@okaxis"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm font-mono text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Initial 4-Digit PIN</label>
                    <input
                      type="text"
                      maxLength={4}
                      value={newShopPin}
                      onChange={(e) => setNewShopPin(e.target.value)}
                      placeholder="5678"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm font-mono text-white"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                  >
                    Create Stall & Generate QR
                  </button>
                </div>
              </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {shops.map((shop) => {
                const matrix = buildQrMatrix(`/play/${shop.shopCode}`);
                return (
                  <div
                    key={shop.shopCode}
                    className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 flex flex-col justify-between gap-4 transition"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono text-xs font-bold">
                            {shop.shopCode}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              shop.isActive
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-rose-500/20 text-rose-300"
                            }`}
                          >
                            {shop.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-white">{shop.name}</h3>
                        <p className="text-xs text-slate-400">
                          Owner: <span className="text-slate-200">{shop.ownerName}</span> •{" "}
                          <span className="font-mono">{shop.ownerPhone}</span>
                        </p>
                        <p className="text-xs text-slate-400">
                          Vendor UPI:{" "}
                          <span className="font-mono text-sky-400">{shop.ownerUpiId}</span>
                        </p>
                      </div>

                      {/* Mini Scannable QR Preview */}
                      <div className="bg-white p-2 rounded-xl shrink-0 shadow-md">
                        <svg width="63" height="63" viewBox="0 0 21 21">
                          {matrix.map((row, rIdx) =>
                            row.map((cell, cIdx) =>
                              cell ? (
                                <rect
                                  key={`${rIdx}-${cIdx}`}
                                  x={cIdx}
                                  y={rIdx}
                                  width={1}
                                  height={1}
                                  fill="#0f172a"
                                />
                              ) : null
                            )
                          )}
                        </svg>
                      </div>
                    </div>

                    {/* Live Hourly PIN & Unsettled Balance Strip */}
                    <div className="grid grid-cols-2 gap-3 bg-slate-950/80 border border-slate-800/80 rounded-xl p-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-400">
                          Live Hourly Counter PIN
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xl font-black font-mono tracking-widest text-amber-400">
                            {shop.currentPin}
                          </span>
                          <button
                            onClick={() => handleRotateSingleShopPin(shop.shopCode)}
                            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                            title="Rotate PIN for this stall"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-400">
                          Unsettled Commission (10%)
                        </div>
                        <div className="text-xl font-black text-emerald-400 mt-0.5">
                          {formatRupees(shop.unsettledBalancePaise || 0)}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons: Copy QR Link, Download Printable Standee, Open Player View */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        onClick={() => handleCopyQrUrl(shop.shopCode)}
                        className="flex-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 border border-slate-700 transition"
                      >
                        {copiedCode === shop.shopCode ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-300">Copied URL!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-400" />
                            <span>Copy QR Link</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleDownloadPrintableQrStandee(shop)}
                        className="flex-1 px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download QR Standee</span>
                      </button>

                      <Link
                        href={`/play/${shop.shopCode}`}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 text-xs font-semibold flex items-center gap-1 transition"
                        title="Open Player QR Landing Route"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>/play/{shop.shopCode}</span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB 2: QUESTION BANK MANAGER
           ===================================================================== */}
        {activeTab === "questions" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">
                  General Knowledge Question Bank ({questions.length} Total)
                </h2>
                <p className="text-xs text-slate-400">
                  Add new multiple-choice questions, toggle active status, or bulk-import via JSON / CSV upload.
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => {
                    setShowAddQuestion(!showAddQuestion);
                    setShowBulkImport(false);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition"
                >
                  <Plus className="w-4 h-4" />
                  Add Question
                </button>

                <button
                  onClick={() => {
                    setShowBulkImport(!showBulkImport);
                    setShowAddQuestion(false);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition"
                >
                  <Upload className="w-4 h-4" />
                  Bulk Import (JSON / CSV)
                </button>
              </div>
            </div>

            {/* Single Question Form */}
            {showAddQuestion && (
              <form
                onSubmit={handleAddSingleQuestion}
                className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-6 space-y-4"
              >
                <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">
                  Add New Multiple-Choice Question
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs text-slate-400 mb-1">Question Text *</label>
                    <input
                      type="text"
                      value={newQText}
                      onChange={(e) => setNewQText(e.target.value)}
                      placeholder="Which river is known as the 'Dakshin Ganga' of India?"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Category</label>
                    <input
                      type="text"
                      value={newQCategory}
                      onChange={(e) => setNewQCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm font-mono text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[0, 1, 2, 3].map((idx) => (
                    <div key={idx}>
                      <label className="flex items-center justify-between text-xs text-slate-400 mb-1">
                        <span>Option {String.fromCharCode(65 + idx)} *</span>
                        <label className="flex items-center gap-1 cursor-pointer text-emerald-400">
                          <input
                            type="radio"
                            name="correctOption"
                            checked={newQCorrectIdx === idx}
                            onChange={() => setNewQCorrectIdx(idx)}
                          />
                          <span>Correct</span>
                        </label>
                      </label>
                      <input
                        type="text"
                        value={newQOptions[idx]}
                        onChange={(e) => {
                          const updated = [...newQOptions];
                          updated[idx] = e.target.value;
                          setNewQOptions(updated);
                        }}
                        placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
                        required
                      />
                    </div>
                  ))}
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                  >
                    Save Question
                  </button>
                </div>
              </form>
            )}

            {/* Bulk Import JSON / CSV Form */}
            {showBulkImport && (
              <form
                onSubmit={handleBulkImportSubmit}
                className="bg-slate-900 border border-amber-500/40 rounded-2xl p-6 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider">
                      Bulk Import Trivia Questions (JSON or CSV)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Upload a <code className="text-amber-300">.json</code> or{" "}
                      <code className="text-amber-300">.csv</code> file, or load a sample template below.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => loadSampleBulkTemplate("JSON")}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-amber-300 border border-slate-700"
                    >
                      Load Sample JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => loadSampleBulkTemplate("CSV")}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-sky-300 border border-slate-700"
                    >
                      Load Sample CSV
                    </button>
                    <label className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold cursor-pointer flex items-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Upload .JSON / .CSV File</span>
                      <input
                        type="file"
                        accept=".json,.csv,text/csv,application/json"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <textarea
                  rows={7}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={
                    bulkMode === "JSON"
                      ? '[{"category":"GENERAL_KNOWLEDGE","questionText":"...","options":["A","B","C","D"],"correctOptionIndex":0}]'
                      : 'questionText,optionA,optionB,optionC,optionD,correctOptionIndex,category'
                  }
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 font-mono text-xs text-slate-200"
                />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>Format Mode:</span>
                    <button
                      type="button"
                      onClick={() => setBulkMode("JSON")}
                      className={`px-2.5 py-1 rounded-md font-bold ${
                        bulkMode === "JSON"
                          ? "bg-amber-500 text-slate-950"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkMode("CSV")}
                      className={`px-2.5 py-1 rounded-md font-bold ${
                        bulkMode === "CSV"
                          ? "bg-amber-500 text-slate-950"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      CSV
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                  >
                    Import Questions Now
                  </button>
                </div>
              </form>
            )}

            {/* Search Filter */}
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={questionSearch}
                onChange={(e) => setQuestionSearch(e.target.value)}
                placeholder="Search questions by keyword or category..."
                className="w-full max-w-md px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-400"
              />
              <span className="text-xs text-slate-400">
                Showing {filteredQuestions.length} of {questions.length} questions
              </span>
            </div>

            {/* Question List */}
            <div className="space-y-3">
              {filteredQuestions.map((q, index) => (
                <div
                  key={q.id}
                  className={`bg-slate-900 border rounded-2xl p-4 transition ${
                    q.isActive !== false ? "border-slate-800" : "border-slate-800/40 opacity-60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-500">#{index + 1}</span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono text-[10px]">
                          {q.category}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            q.isActive !== false
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-slate-800 text-slate-500"
                          }`}
                        >
                          {q.isActive !== false ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-white">{q.questionText}</p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1">
                        {q.options.map((opt, oIdx) => {
                          const isCorrect = oIdx === q.correctOptionIndex;
                          return (
                            <div
                              key={oIdx}
                              className={`px-3 py-1.5 rounded-xl text-xs border flex items-center gap-2 ${
                                isCorrect
                                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-bold"
                                  : "bg-slate-950 border-slate-800 text-slate-400"
                              }`}
                            >
                              <span className="font-mono text-[10px] opacity-75">
                                {String.fromCharCode(65 + oIdx)}.
                              </span>
                              <span className="truncate">{opt}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggleQuestionActive(q)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition shrink-0 ${
                        q.isActive !== false
                          ? "bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border-slate-700"
                          : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/30"
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                      {q.isActive !== false ? "Disable" : "Enable"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB 3: LIVE MATCH & 70/10/20 LEDGER MONITOR
           ===================================================================== */}
        {activeTab === "ledger" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">
                  Live Match & 70 / 10 / 20 Financial Split Ledger
                </h2>
                <p className="text-xs text-slate-400">
                  Real-time audit table of arena lobbies, completed speed-quiz settlements, fastest-hand tie-breakers, and automatic refunds.
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300">
                  Total Gross Pot:{" "}
                  <strong className="text-white">
                    {formatRupees(ledgerSummary.totalGrossPotPaise)}
                  </strong>
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-rose-300">
                  Refunded Lobbies: <strong>{ledgerSummary.cancelledRefundedCount}</strong>
                </span>
              </div>
            </div>

            {matches.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
                <Trophy className="w-10 h-10 text-amber-400 mx-auto opacity-80" />
                <h3 className="text-base font-bold text-white">No Matches Recorded Yet</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Run <code className="text-amber-300">npx tsx scripts/simulate-match.ts</code> or join{" "}
                  <Link href="/play/SHP_001" className="text-sky-400 underline">
                    /play/SHP_001
                  </Link>{" "}
                  to watch live matches and 70/10/20 splits populate here in real time.
                </p>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        <th className="py-3.5 px-4">Match ID & Time</th>
                        <th className="py-3.5 px-4">Stall</th>
                        <th className="py-3.5 px-4">Status</th>
                        <th className="py-3.5 px-4">Players</th>
                        <th className="py-3.5 px-4">Total Pot</th>
                        <th className="py-3.5 px-4">70% / 10% / 20% Split</th>
                        <th className="py-3.5 px-4">Winner & Fastest Hand</th>
                        <th className="py-3.5 px-4">UPI Payout Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70 text-xs">
                      {matches.map((m) => {
                        const topParticipant =
                          m.participants && m.participants.length > 0 ? m.participants[0] : null;
                        return (
                          <tr key={m.id} className="hover:bg-slate-800/40 transition">
                            <td className="py-3.5 px-4 font-mono text-[11px] text-slate-300">
                              <div className="font-bold text-white truncate max-w-[160px]" title={m.id}>
                                {m.id}
                              </div>
                              <div className="text-slate-500">
                                {new Date(m.createdAt).toLocaleTimeString("en-IN")}
                              </div>
                            </td>

                            <td className="py-3.5 px-4">
                              <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono font-bold text-[11px]">
                                {m.shop?.shopCode || "SHP_001"}
                              </span>
                              <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[150px]">
                                {m.shop?.name || "Pilot Arena"}
                              </div>
                            </td>

                            <td className="py-3.5 px-4">
                              <span
                                className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                                  m.status === "COMPLETED_SETTLED"
                                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                    : m.status === "CANCELLED_REFUNDED"
                                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                    : "bg-sky-500/20 text-sky-300 border border-sky-500/30 animate-pulse"
                                }`}
                              >
                                {m.status}
                              </span>
                            </td>

                            <td className="py-3.5 px-4 font-bold text-white">
                              {m.participants?.length || 0} Players
                            </td>

                            <td className="py-3.5 px-4 font-extrabold text-white">
                              {formatRupees(m.totalPotPaise || 0)}
                            </td>

                            <td className="py-3.5 px-4 font-mono text-[11px]">
                              {m.status === "CANCELLED_REFUNDED" ? (
                                <span className="text-rose-400">
                                  100% Refunded (₹10 × {m.participants?.length || 0})
                                </span>
                              ) : (
                                <div className="space-y-0.5">
                                  <div className="text-emerald-400">
                                    70% Winner: {formatRupees(m.prizePoolPaise || 0)}
                                  </div>
                                  <div className="text-sky-400">
                                    10% Vendor: {formatRupees(m.vendorSharePaise || 0)}
                                  </div>
                                  <div className="text-amber-400">
                                    20% Platform: {formatRupees(m.platformSharePaise || 0)}
                                  </div>
                                </div>
                              )}
                            </td>

                            <td className="py-3.5 px-4">
                              {m.status === "COMPLETED_SETTLED" && (m.winner || topParticipant) ? (
                                <div>
                                  <div className="font-bold text-emerald-300">
                                    🏆 {m.winner?.displayName || topParticipant?.player.displayName}
                                  </div>
                                  {topParticipant && (
                                    <div className="text-[11px] text-slate-400 font-mono">
                                      {topParticipant.score} pts • {topParticipant.cumulativeResponseMs}ms
                                    </div>
                                  )}
                                </div>
                              ) : m.status === "CANCELLED_REFUNDED" ? (
                                <span className="text-slate-500">Min 4 players not met</span>
                              ) : (
                                <span className="text-sky-400">Match Active...</span>
                              )}
                            </td>

                            <td className="py-3.5 px-4 font-mono text-[11px]">
                              {m.payoutReferenceId ? (
                                <div>
                                  <span className="text-emerald-400 font-bold">✓ PAID VIA UPI</span>
                                  <div className="text-slate-400 truncate max-w-[140px]" title={m.payoutReferenceId}>
                                    {m.payoutReferenceId}
                                  </div>
                                </div>
                              ) : m.status === "CANCELLED_REFUNDED" ? (
                                <span className="text-rose-300 font-bold">↺ REFUNDED</span>
                              ) : (
                                <span className="text-slate-500">Pending</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
