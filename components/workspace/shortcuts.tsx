"use client";

import { useEffect, useRef } from "react";
import { Kbd } from "./kbd";

export const SHORTCUTS: [string[], string][] = [
  [["click"], "Pin a line (focuses the comment box for Wispr Flow)"],
  [["shift", "click"], "Extend to a range within the hunk"],
  [["j"], "Next line"],
  [["k"], "Previous line"],
  [["shift", "j/k"], "Extend selection"],
  [["n"], "Next hunk"],
  [["p"], "Previous hunk"],
  [["]"], "Next file"],
  [["["], "Previous file"],
  [["c"], "Focus the comment box (also Enter)"],
  [["⌘", "↵"], "Save comment"],
  [["Esc"], "Leave the comment box · again to unpin"],
  [["?"], "Show this list"],
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby="shortcuts-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-full max-w-md rounded-xl border border-border bg-surface p-0 text-text backdrop:bg-black/60"
    >
      <div className="p-5">
        <h2 id="shortcuts-title" className="mb-3 text-base font-semibold">
          Keyboard shortcuts
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {SHORTCUTS.map(([keys, what]) => (
            <div key={what} className="contents">
              <dt className="flex gap-1">
                {keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </dt>
              <dd className="text-muted">{what}</dd>
            </div>
          ))}
        </dl>
        <button type="button" onClick={onClose} className="mt-5 rounded-md border border-border-strong px-3 py-1.5 text-sm hover:bg-surface-2">
          Close
        </button>
      </div>
    </dialog>
  );
}
