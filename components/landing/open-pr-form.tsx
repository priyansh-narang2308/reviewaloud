"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { parsePrInput, workspacePath } from "@/lib/github/url";

export function OpenPrForm({
  example,
  initialValue = "",
  initialError = null,
}: {
  example: string;
  initialValue?: string;
  initialError?: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(initialError);

  return (
    <form
      action="/open"
      method="get"
      className="w-full max-w-xl"
      onSubmit={(e) => {
        e.preventDefault();
        const r = parsePrInput(value);
        if (!r.ok) return setError(r.error);
        setError(null);
        router.push(workspacePath(r.ref));
      }}
    >
      <label htmlFor="pr-url" className="mb-2 block text-left text-sm text-muted">
        Open a public pull request
      </label>
      <div className="flex gap-2">
        <input
          id="pr-url"
          name="pr-url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={example}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!!error}
          aria-describedby={error ? "pr-url-error" : undefined}
          className="min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-3 py-2 font-mono text-sm placeholder:text-faint"
        />
        <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black hover:brightness-110">
          Open
        </button>
      </div>
      {error ? (
        <p id="pr-url-error" role="alert" data-testid="pr-url-error" className="mt-2 text-left text-sm text-danger">
          {error}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setValue(example)}
          className="mt-2 block text-left text-sm text-faint hover:text-muted"
        >
          Try the sandbox PR →
        </button>
      )}
    </form>
  );
}
