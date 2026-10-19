"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { COMMENT_TYPES, type CommentType } from "@/lib/store/review-store";

export const TYPE_META: Record<CommentType, { label: string; hint: string; dot: string; chip: string }> = {
  blocking: { label: "Blocking", hint: "Must fix before merge", dot: "bg-rose-400", chip: "border-rose-500/50 text-rose-200 bg-rose-500/10" },
  suggestion: { label: "Suggestion", hint: "Optional improvement", dot: "bg-sky-400", chip: "border-sky-500/50 text-sky-200 bg-sky-500/10" },
  question: { label: "Question", hint: "Needs an answer", dot: "bg-violet-400", chip: "border-violet-500/50 text-violet-200 bg-violet-500/10" },
  nit: { label: "Nit", hint: "Minor, non-blocking", dot: "bg-zinc-400", chip: "border-border-strong text-muted bg-surface-2" },
  praise: { label: "Praise", hint: "Something done well", dot: "bg-emerald-400", chip: "border-emerald-500/50 text-emerald-200 bg-emerald-500/10" },
};

export function TypePicker({ value, onChange }: { value: CommentType | null; onChange: (t: CommentType | null) => void }) {
  const meta = value ? TYPE_META[value] : null;
  return (
    <Menu.Root>
      <Menu.Trigger
        data-testid="card-type"
        data-value={value ?? ""}
        aria-label={`Comment type: ${meta?.label ?? "none"}`}
        className={`group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent data-[state=open]:ring-2 data-[state=open]:ring-accent/60 ${
          meta ? meta.chip : "border-dashed border-border-strong text-faint hover:text-muted"
        }`}
      >
        {meta && <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />}
        {meta?.label ?? "Add type"}
        <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 opacity-60 transition-transform group-data-[state=open]:rotate-180">
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-[220px] origin-[var(--radix-dropdown-menu-content-transform-origin)] rounded-xl border border-border-strong bg-surface-2/95 p-1 shadow-2xl shadow-black/50 backdrop-blur data-[state=open]:animate-[ra-pop_150ms_var(--ease-out)]"
        >
          <Menu.RadioGroup value={value ?? ""} onValueChange={(v) => onChange((v || null) as CommentType | null)}>
            {COMMENT_TYPES.map((t) => (
              <Menu.RadioItem
                key={t}
                value={t}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-bg/70 data-[state=checked]:text-text"
              >
                <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${TYPE_META[t].dot}`} />
                <span className="flex flex-col">
                  <span>{TYPE_META[t].label}</span>
                  <span className="text-[11px] text-faint">{TYPE_META[t].hint}</span>
                </span>
                <Menu.ItemIndicator className="ml-auto text-accent">
                  <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3">
                    <path d="M2.5 6.5 5 9l4.5-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Menu.ItemIndicator>
              </Menu.RadioItem>
            ))}
            <Menu.Separator className="my-1 h-px bg-border" />
            <Menu.RadioItem value="" className="rounded-lg px-2.5 py-1.5 text-xs text-muted outline-none data-[highlighted]:bg-bg/70">
              No type
            </Menu.RadioItem>
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
