import type { Metadata } from "next";
import Link from "next/link";

import { LEAGUE } from "@/lib/league";

import "./globals.css";

export const metadata: Metadata = {
  title: `${LEAGUE.name} — 3-Team Manager`,
  description: `Build and manage 3 ${LEAGUE.shortName} Fantasy Challenge teams`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-[var(--border)] bg-[var(--panel)]">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3 text-sm">
            <Link href="/" className="font-semibold">
              {LEAGUE.name}
            </Link>
            <Link href="/teams" className="text-[var(--muted)] hover:text-[var(--text)]">
              Teams
            </Link>
            <Link href="/players" className="text-[var(--muted)] hover:text-[var(--text)]">
              Players
            </Link>
            <Link href="/trades" className="text-[var(--muted)] hover:text-[var(--text)]">
              Trades
            </Link>
            <Link href="/planner" className="text-[var(--muted)] hover:text-[var(--text)]">
              Planner
            </Link>
            <Link href="/history" className="text-[var(--muted)] hover:text-[var(--text)]">
              History
            </Link>
            <Link href="/settings" className="text-[var(--muted)] hover:text-[var(--text)]">
              Settings
            </Link>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
