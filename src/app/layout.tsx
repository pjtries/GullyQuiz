import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GullyQuiz QR | Zero-CapEx Speed Trivia",
  description:
    "Decentralized mobile trivia arenas for rural tea stalls and bookstores. ₹10 entry, hourly PINs, real-time speed competition.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GullyQuiz",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0b0f19",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0b0f19] text-white flex flex-col justify-between selection:bg-brand-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
