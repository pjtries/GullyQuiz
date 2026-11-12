"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Store, QrCode, ArrowLeft, RefreshCw, Zap, Wallet, Users, Clock } from "lucide-react";
import { formatPaiseToRupees } from "../../lib/types";

interface ShopData {
  id: string;
  shopCode: string;
  name: string;
  ownerName: string;
  currentPin: string;
  pinExpiresAt: string;
  unsettledBalancePaise: number;
}

export default function VendorDisplayPage() {
  const [shops, setShops] = useState<ShopData[]>([]);
  const [selectedShopCode, setSelectedShopCode] = useState<string>("SHP_001");
  const [loading, setLoading] = useState(true);

  const fetchShops = () => {
    fetch("/api/shops")
      .then((res) => res.json())
      .then((data) => {
        if (data.shops) {
          setShops(data.shops);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading shops:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchShops();
  }, []);

  const currentShop = shops.find((s) => s.shopCode === selectedShopCode) || shops[0];

  return (
    <main className="w-full max-w-lg mx-auto min-h-screen bg-[#0b0f19] text-white p-4 flex flex-col justify-between">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between py-3 border-b border-slate-800">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Player View
          </Link>

          <div className="flex items-center gap-1 text-xs text-brand-400 font-bold">
            <Store className="w-4 h-4" /> Stall Counter Display
          </div>
        </div>

        {/* Stall Selector */}
        <div className="mt-4">
          <label className="text-xs font-semibold text-slate-400 block mb-1.5">
            Select Vendor Counter:
          </label>
          <select
            value={selectedShopCode}
            onChange={(e) => setSelectedShopCode(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm font-semibold text-white focus:outline-none focus:border-brand-500"
          >
            {shops.map((s) => (
              <option key={s.shopCode} value={s.shopCode}>
                {s.shopCode} • {s.name} ({s.ownerName})
              </option>
            ))}
          </select>
        </div>

        {/* Counter Display Card */}
        {currentShop && (
          <div className="mt-6 p-6 rounded-3xl bg-gradient-to-b from-[#182339] to-[#0f1725] border border-slate-800 shadow-2xl flex flex-col items-center text-center space-y-4">
            <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Physical Stall QR & PIN Active
            </div>

            <div className="space-y-1">
              <h1 className="text-xl font-black text-white">{currentShop.name}</h1>
              <p className="text-xs text-slate-400 font-mono">Counter Code: {currentShop.shopCode}</p>
            </div>

            {/* Simulated Physical QR Code Box */}
            <div className="p-4 bg-white rounded-3xl shadow-xl">
              <QrCode className="w-48 h-48 text-slate-950" />
            </div>

            {/* 4-digit PIN */}
            <div className="w-full space-y-1">
              <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">
                Today&apos;s 4-Digit Counter PIN
              </span>
              <div className="text-5xl font-mono font-black tracking-widest text-amber-400 bg-amber-500/10 py-3 rounded-2xl border border-amber-500/30 shadow-inner">
                {currentShop.currentPin}
              </div>
              <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1 pt-1">
                <Clock className="w-3.5 h-3.5" /> Valid for 24 Hours
              </p>
            </div>

            {/* Vendor Commission Earnings */}
            <div className="w-full p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2 text-left">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-emerald-400" /> Unsettled Vendor Balance:
                </span>
                <span className="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">
                  20% Commission
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-3xl font-black text-emerald-400">
                  {formatPaiseToRupees(currentShop.unsettledBalancePaise)}
                </span>
                <button
                  onClick={() => alert(`Simulated instant settlement of ${formatPaiseToRupees(currentShop.unsettledBalancePaise)} to UPI: ${currentShop.shopCode}@upi`)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 transition"
                >
                  Settle to UPI
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Each ₹10 player adds ₹2.00 directly to your stall commission. No hardware or POS machine required!
              </p>
            </div>
          </div>
        )}
      </div>

      <footer className="py-4 text-center text-xs text-slate-500">
        GullyQuiz QR Stall Management • Zero-CapEx Rural Trivia Network
      </footer>
    </main>
  );
}
