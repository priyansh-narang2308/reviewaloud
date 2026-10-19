"use client";

import { useEffect, useRef, useState } from "react";

// Excerpt of sandbox PR #1, src/cart.ts, first hunk (@@ -14,10 +14,15 @@).
type Line = { kind: "add" | "del" | "ctx"; oldNo?: number; newNo?: number; text: string };
const LINES: Line[] = [
  { kind: "ctx", oldNo: 14, newNo: 14, text: "  return { items: [] };" },
  { kind: "ctx", oldNo: 15, newNo: 15, text: "}" },
  { kind: "ctx", oldNo: 16, newNo: 16, text: "" },
  { kind: "add", newNo: 17, text: "const MAX_QUANTITY = 99;" },
  { kind: "add", newNo: 18, text: "" },
  { kind: "ctx", oldNo: 17, newNo: 19, text: "export function addItem(cart: Cart, item: CartItem): Cart {" },
  { kind: "add", newNo: 20, text: "  if (item.quantity <= 0) {" },
  { kind: "add", newNo: 21, text: '    throw new Error("Quantity must be positive");' },
  { kind: "add", newNo: 22, text: "  }" },
  { kind: "ctx", oldNo: 18, newNo: 23, text: "  const existing = cart.items.find((i) => i.sku === item.sku);" },
  { kind: "ctx", oldNo: 19, newNo: 24, text: "  if (existing) {" },
  { kind: "del", oldNo: 20, text: "    existing.quantity += item.quantity;" },
  { kind: "add", newNo: 25, text: "    existing.quantity = Math.min(existing.quantity + item.quantity, MAX_QUANTITY);" },
  { kind: "ctx", oldNo: 21, newNo: 26, text: "    return cart;" },
  { kind: "ctx", oldNo: 22, newNo: 27, text: "  }" },
];

type Anchor = { path: string; side: "LEFT" | "RIGHT"; line: number };
type Status = "no-anchor" | "anchor-set" | "text-received" | "typing" | "saved";
type LogEntry = { t: number; event: string; detail: string };
type Card = { anchor: Anchor; body: string; source: "paste" | "typed" | "mixed" };

const PATH = "src/cart.ts";

function anchorFor(l: Line): Anchor {
  return l.kind === "del"
    ? { path: PATH, side: "LEFT", line: l.oldNo! }
    : { path: PATH, side: "RIGHT", line: l.newNo! };
}

const anchorKey = (a: Anchor) => `${a.side}:${a.line}`;
const clock = () => performance.now();

export function CaptureSpike() {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("no-anchor");
  const [sources, setSources] = useState<Set<"paste" | "typed">>(new Set());
  const [cards, setCards] = useState<Card[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const t0 = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const record = (event: string, detail: string) => {
    const now = clock();
    if (!t0.current) t0.current = now;
    setLog((l) => [{ t: Math.round(now - t0.current), event, detail }, ...l].slice(0, 40));
  };

  const select = (l: Line) => {
    const a = anchorFor(l);
    setAnchor(a);
    setStatus("anchor-set");
    record("anchor", `${a.side} ${a.line}`);
  };

  // Focus after the render that enables the textarea (focusing a disabled
  // field is a no-op). Focusing never changes the anchor.
  useEffect(() => {
    if (anchor) textareaRef.current?.focus();
  }, [anchor]);

  const save = () => {
    if (!anchor || !text.trim()) return;
    const source = sources.size > 1 ? "mixed" : sources.has("paste") ? "paste" : "typed";
    setCards((c) => [...c, { anchor, body: text, source }]);
    record("saved", `${anchorKey(anchor)} · ${text.length} chars · ${source}`);
    setText("");
    setSources(new Set());
    setStatus("saved");
  };

  const statusLabel: Record<Status, string> = {
    "no-anchor": "Select a diff line to start",
    "anchor-set": "Anchor set · dictate with Wispr Flow or type",
    "text-received": "Text received",
    typing: "Typing",
    saved: "Saved · select another line",
  };

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 p-6 lg:grid-cols-[1fr_380px]">
      <section aria-label="Diff">
        <h1 className="mb-1 text-xl font-semibold">Capture spike (Task 4 · gate G1)</h1>
        <p className="mb-4 text-sm text-zinc-500">
          Click a line, hold your Wispr Flow shortcut, speak, release. The text should land in the box
          and the anchor should not change. ReviewAloud cannot see Wispr listening; it only sees the
          text when it arrives.
        </p>
        <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 font-mono text-[13px]">
          <div className="border-b border-zinc-800 px-3 py-2 text-zinc-400">{PATH}</div>
          {LINES.map((l, i) => {
            const a = anchorFor(l);
            const selected = anchor && anchorKey(anchor) === anchorKey(a);
            const hasCard = cards.some((c) => anchorKey(c.anchor) === anchorKey(a));
            return (
              <button
                key={i}
                type="button"
                data-testid={`line-${anchorKey(a)}`}
                aria-pressed={!!selected}
                onClick={() => select(l)}
                className={`flex w-full text-left whitespace-pre ${
                  l.kind === "add" ? "bg-emerald-950/60" : l.kind === "del" ? "bg-rose-950/60" : ""
                } ${selected ? "outline outline-2 -outline-offset-2 outline-sky-500" : "hover:bg-zinc-800/60"}`}
              >
                <span className="w-12 shrink-0 px-2 text-right text-zinc-600">{l.oldNo ?? ""}</span>
                <span className="w-12 shrink-0 px-2 text-right text-zinc-600">{l.newNo ?? ""}</span>
                <span className="w-5 shrink-0 text-zinc-500">
                  {l.kind === "add" ? "+" : l.kind === "del" ? "-" : " "}
                </span>
                <span className="pr-4 text-zinc-200">{l.text}</span>
                {hasCard && <span className="ml-auto pr-3 text-sky-400">●</span>}
              </button>
            );
          })}
        </div>
      </section>

      <aside className="flex flex-col gap-4">
        <div className="rounded-lg border border-zinc-800 p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span data-testid="anchor" className="font-mono">
              {anchor ? `${anchor.path} · ${anchor.side} ${anchor.line}` : "No anchor"}
            </span>
          </div>
          <p role="status" data-testid="status" className="mb-2 text-sm text-sky-400">
            {statusLabel[status]}
          </p>
          <label htmlFor="capture" className="sr-only">
            Review comment
          </label>
          <textarea
            id="capture"
            ref={textareaRef}
            data-testid="capture"
            value={text}
            disabled={!anchor}
            rows={6}
            placeholder={anchor ? "Dictate or type your comment…" : "Select a line first"}
            className="w-full resize-y rounded-md border border-zinc-700 bg-zinc-900 p-2 text-sm disabled:opacity-50"
            onBeforeInput={(e) => {
              const ne = e.nativeEvent as InputEvent;
              record("beforeinput", ne.inputType ?? "unknown");
            }}
            onPaste={(e) => record("paste", `${e.clipboardData.getData("text").length} chars`)}
            onChange={(e) => {
              const ne = e.nativeEvent as InputEvent;
              const kind = ne.inputType === "insertFromPaste" ? "paste" : "typed";
              setSources((s) => new Set(s).add(kind));
              setStatus(kind === "paste" ? "text-received" : "typing");
              record("input", ne.inputType ?? "unknown");
              setText(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                save();
              }
              if (e.key === "Escape") {
                setText("");
                setSources(new Set());
                setStatus(anchor ? "anchor-set" : "no-anchor");
              }
            }}
          />
          <button
            type="button"
            onClick={save}
            disabled={!anchor || !text.trim()}
            className="mt-2 w-full rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium disabled:opacity-40"
          >
            Save card (⌘↵)
          </button>
        </div>

        <div className="rounded-lg border border-zinc-800 p-4">
          <h2 className="mb-2 text-sm font-semibold">Cards ({cards.length})</h2>
          <ol data-testid="cards" className="space-y-2 text-sm">
            {cards.map((c, i) => (
              <li key={i} className="rounded border border-zinc-800 p-2">
                <div className="font-mono text-xs text-zinc-400">
                  {c.anchor.side} {c.anchor.line} · {c.source}
                </div>
                <div className="whitespace-pre-wrap">{c.body}</div>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-lg border border-zinc-800 p-4">
          <h2 className="mb-2 text-sm font-semibold">Event log</h2>
          <ol data-testid="log" className="max-h-64 overflow-y-auto font-mono text-xs text-zinc-400">
            {log.map((e, i) => (
              <li key={i}>
                +{e.t}ms {e.event} {e.detail}
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </main>
  );
}
