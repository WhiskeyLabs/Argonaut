import type { Metadata } from "next";
import { Outfit, IBM_Plex_Mono, Barlow } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Argonaut Console",
  description: "Argonaut multi-agent security triage factory",
  icons: {
    icon: [
      { url: '/static/favicons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/static/favicons/favicon-16x16.png', sizes: '16x16', type: 'image/png' }
    ],
    shortcut: '/static/favicons/favicon.ico',
    apple: '/static/favicons/apple-touch-icon.png',
  },
  manifest: '/static/favicons/manifest.webmanifest',
};

import Script from "next/script";
import { TopNav } from "@/components/TopNav";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${outfit.variable} ${barlow.variable} ${plexMono.variable} antialiased min-h-screen bg-background text-foreground`}
      >
        <TopNav />
        <main className="pt-[56px] min-h-screen">
          {children}
        </main>
        <Script src="https://unpkg.com/lucide@0.469.0/dist/umd/lucide.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
