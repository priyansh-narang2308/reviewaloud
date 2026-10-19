export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border-strong bg-surface-2 px-1.5 py-px font-mono text-[11px] text-text">
      {children}
    </kbd>
  );
}
