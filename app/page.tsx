import { Suspense } from "react";
import { OpenPrForm } from "@/components/landing/open-pr-form";
import { parsePrInput } from "@/lib/github/url";

const EXAMPLE = "https://github.com/priyansh-narang2308/reviewaloud-sandbox/pull/1";
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Reads ?pr-url= set by the no-JS fallback (/open). Recomputes the error from
// the input rather than echoing a query parameter.
async function FormWithQuery({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const input = typeof sp["pr-url"] === "string" ? sp["pr-url"] : "";
  const parsed = input ? parsePrInput(input) : null;
  return <OpenPrForm example={EXAMPLE} initialValue={input} initialError={parsed && !parsed.ok ? parsed.error : null} />;
}

// Interim landing page; the full landing is Task 33.
export default function Home({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">ReviewAloud</h1>
      <p className="max-w-md text-muted">
        The agent wrote the code. You gave the feedback. Did the fix actually land?
      </p>
      <Suspense fallback={<OpenPrForm example={EXAMPLE} />}>
        <FormWithQuery searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
