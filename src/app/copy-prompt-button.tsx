"use client";

import { useRef, useState } from "react";

export function CopyPromptButton({
  prompt,
  label = "Copy agent prompt",
}: {
  prompt: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API blocked (permissions, non-secure context, automation).
      // Never fall back to window.prompt()/alert() — those are blocking
      // dialogs that can freeze the tab. Reveal a selectable textarea instead.
      setShowFallback(true);
      requestAnimationFrame(() => textareaRef.current?.select());
    }
  }

  return (
    <div className="inline-block">
      <button
        onClick={copy}
        className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
          copied
            ? "border-emerald-500 bg-emerald-500/15 text-emerald-400"
            : "border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--accent)]"
        }`}
        title="Copy a self-contained prompt for a browser-automation agent (e.g. Claude in Chrome) to apply this in the live app"
      >
        {copied ? "Copied ✓" : label}
      </button>
      {showFallback && (
        <div className="mt-2 w-80 rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
          <p className="text-[11px] text-amber-300">
            Clipboard access was blocked — select all below (already selected) and copy manually.
          </p>
          <textarea
            ref={textareaRef}
            readOnly
            value={prompt}
            className="mt-1 h-24 w-full resize-none rounded border border-[var(--border)] bg-[var(--panel)] p-1.5 text-[11px] text-[var(--text)]"
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      )}
    </div>
  );
}
