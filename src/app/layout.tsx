import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { TelegramScript } from "@/components/telegram-script";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RetPAP — Telegram Mini App",
  description:
    "Tap a photo to drop emoji reactions, drag the vertical slider to score it, and flip through cards.",
  applicationName: "RetPAP",
  openGraph: {
    title: "RetPAP — Telegram Mini App",
    description: "Tap untuk bereaksi, geser untuk menilai, usap untuk pindah foto.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0b0f19",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark h-full ${inter.variable}`}>
      <body className="h-full antialiased">
        {children}
        <TelegramScript />
      </body>
    </html>
  );
}
