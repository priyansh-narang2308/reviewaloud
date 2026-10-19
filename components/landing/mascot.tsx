"use client";

import Link from "next/link";
import { useState } from "react";

const TIPS = [
  { text: "Psst. Don't type your review. Say it." },
  { text: "Click a line, hold your Wispr key, talk." },
  { text: "Did the agent actually fix it? I check.", href: "/demo#ledger", cta: "See the ledger →" },
  { text: "Try it without signing in!", href: "/demo", cta: "Open the demo →" },
] as const;

/**
 * Landing-page mascot peeking in from the bottom-left corner. Decorative
 * motion only: a one-time peek, a slow idle sway, a hover perk-up. Clicking
 * cycles short tips. Motion is disabled under prefers-reduced-motion.
 */
export function Mascot() {
  const [tip, setTip] = useState<number | null>(null);
  const current = tip === null ? null : TIPS[tip];

  return (
    <div className="mascot pointer-events-none fixed bottom-0 left-0 z-30 select-none" data-testid="mascot">
      {current && (
        <div
          role="status"
          key={tip}
          className="mascot-bubble pointer-events-auto absolute bottom-[78%] left-[62%] w-max max-w-[220px] rounded-2xl rounded-bl-sm border border-border-strong bg-surface-2/95 px-3.5 py-2.5 text-sm leading-snug text-text shadow-xl shadow-black/40 backdrop-blur"
        >
          {current.text}
          {"href" in current && (
            <Link href={current.href} className="mt-1 block text-xs font-medium text-accent hover:underline">
              {current.cta}
            </Link>
          )}
        </div>
      )}
      <button
        type="button"
        aria-label={current ? "Show the next tip" : "Say hi to the mascot"}
        onClick={() => setTip((t) => (t === null ? 0 : (t + 1) % TIPS.length))}
        className="mascot-body pointer-events-auto block w-[84px] origin-bottom-left outline-none sm:w-[120px] lg:w-[136px] 2xl:w-[176px]"
      >
        <span className="mascot-sway block">
          {/* eslint-disable-next-line @next/next/no-img-element -- static decorative SVG */}
          <img src="/mascot.svg" alt="" width={176} height={176} className="block h-auto w-full -scale-x-100" draggable={false} />
        </span>
      </button>
    </div>
  );
}
