"use client";

import type { WorkspaceFile } from "@/lib/workspace/types";

const STATUS_MARK: Record<string, { mark: string; cls: string; label: string }> = {
  added: { mark: "A", cls: "text-emerald-400", label: "added" },
  removed: { mark: "D", cls: "text-rose-400", label: "deleted" },
  renamed: { mark: "R", cls: "text-sky-400", label: "renamed" },
  copied: { mark: "C", cls: "text-sky-400", label: "copied" },
};

export function FileTree({
  files,
  current,
  onPick,
}: {
  files: WorkspaceFile[];
  current: number;
  onPick: (i: number) => void;
}) {
  return (
    <nav aria-label="Changed files" className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto">
      <h2 className="mb-2 px-2 text-xs font-medium uppercase tracking-wider text-muted">
        Files <span className="text-faint">{files.length}</span>
      </h2>
      <ol className="space-y-px">
        {files.map((f, i) => {
          const slash = f.path.lastIndexOf("/");
          const dir = slash >= 0 ? f.path.slice(0, slash + 1) : "";
          const name = f.path.slice(slash + 1);
          const s = STATUS_MARK[f.status] ?? { mark: "M", cls: "text-amber-300", label: "modified" };
          return (
            <li key={f.path}>
              <button
                type="button"
                onClick={() => onPick(i)}
                aria-current={i === current ? "true" : undefined}
                title={f.path}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2 ${
                  i === current ? "bg-surface-2 text-text" : "text-muted"
                }`}
              >
                <span className={`w-3 shrink-0 font-mono text-[11px] ${s.cls}`} aria-label={s.label}>
                  {s.mark}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono">
                  <span className="text-faint">{dir}</span>
                  <span className={i === current ? "text-text" : ""}>{name}</span>
                </span>
                <span className="shrink-0 font-mono text-[11px]">
                  <span className="text-emerald-400">+{f.additions}</span>{" "}
                  <span className="text-rose-400">−{f.deletions}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
