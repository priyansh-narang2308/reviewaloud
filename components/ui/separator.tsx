export function Separator({ className = "", vertical = false }: { className?: string; vertical?: boolean }) {
  return (
    <div
      role="separator"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      className={`shrink-0 bg-border ${vertical ? "h-full w-px" : "h-px w-full"} ${className}`}
    />
  );
}
