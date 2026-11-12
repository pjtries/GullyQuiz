"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

export default function ShopRedirectPage() {
  const router = useRouter();
  const params = useParams();

  useEffect(() => {
    const code = params?.code as string;
    if (code) {
      router.replace(`/play/${encodeURIComponent(code)}`);
    } else {
      router.replace("/");
    }
  }, [params, router]);

  return (
    <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center text-white">
      <div className="flex flex-col items-center space-y-3">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-400 font-medium">Entering GullyQuiz Arena...</p>
      </div>
    </div>
  );
}
