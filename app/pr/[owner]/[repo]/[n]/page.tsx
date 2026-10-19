import type { Metadata } from "next";
import { Workspace } from "@/components/workspace/workspace";
import { WorkspaceError } from "@/components/workspace/workspace-error";
import { loadWorkspace } from "@/lib/workspace/load";

type Params = { owner: string; repo: string; n: string };

const NAME = /^[\w.-]+$/;

function toRef({ owner, repo, n }: Params) {
  const number = Number(n);
  if (!NAME.test(owner) || !NAME.test(repo) || !Number.isInteger(number) || number < 1) return null;
  return { owner, repo, number };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { owner, repo, n } = await params;
  return { title: `${owner}/${repo}#${n} · ReviewAloud` };
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const ref = toRef(await params);
  if (!ref) return <WorkspaceError kind="not_found" message="That isn't a valid pull request address." />;
  const result = await loadWorkspace(ref);
  if (!result.ok) return <WorkspaceError kind={result.kind} message={result.message} resetAt={result.resetAt} />;
  return <Workspace data={result.data} />;
}
