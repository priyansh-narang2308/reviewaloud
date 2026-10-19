export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col" aria-busy="true" aria-label="Loading pull request">
      <div className="h-[116px] border-b border-border bg-surface" />
      <div className="mx-auto grid w-full max-w-[1600px] gap-6 px-6 py-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-7 animate-pulse rounded-md bg-surface-2" />
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-lg border border-border bg-surface" />
          ))}
        </div>
      </div>
    </div>
  );
}
