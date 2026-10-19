// ReviewAloud brand mark: a speech bubble (your spoken review) holding a check
// (the fix, verified). Drawn on a 32px grid so it stays crisp at 16px.

const BUBBLE =
  "M11 7.5h10a4.5 4.5 0 0 1 4.5 4.5v4.5A4.5 4.5 0 0 1 21 21h-7l-4.6 3.9a.6.6 0 0 1-1-.46V20.6A4.5 4.5 0 0 1 6.5 16.5V12A4.5 4.5 0 0 1 11 7.5Z";
const CHECK = "M11.6 14.3l3 2.9 5.8-5.7";

/** App icon: amber tile with the bubble-check. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden focusable="false">
      <rect width="32" height="32" rx="8.5" fill="var(--accent, #F5A524)" />
      <path d={BUBBLE} fill="#0B0C0F" />
      <path d={CHECK} fill="none" stroke="var(--accent, #F5A524)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The bubble-check alone, in currentColor (used inline in display type). */
export function LogoGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="5 6 22 20" className={className} aria-hidden focusable="false">
      <path d={BUBBLE} fill="currentColor" />
      <path d={CHECK} fill="none" stroke="var(--bg, #0B0C0F)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Mark + wordmark. "Aloud" carries the accent: the product's verb. */
export function Logo({ size = 26, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      <span className="text-[17px] font-semibold tracking-[-0.02em] text-text">
        Review<span className="text-accent">Aloud</span>
      </span>
    </span>
  );
}
