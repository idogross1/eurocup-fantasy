import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "EuroCup Fantasy — 3-Team Manager",
  description: "Build and manage 3 EuroCup Fantasy Challenge teams",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-[var(--border)] bg-[var(--panel)]">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3 text-sm">
            <Link href="/" className="font-semibold">
              EuroCup Fantasy
            </Link>
            <Link href="/players" className="text-[var(--muted)] hover:text-[var(--text)]">
              Players
            </Link>
            <span className="text-[var(--muted)]/50">Teams · Trades · Planner (soon)</span>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
