"use client";

import { createContext, useContext } from "react";
import type { Card, CommentType } from "@/lib/store/review-store";

export type TidyState =
  | { status: "loading" }
  | { status: "proposal"; body: string; type: CommentType | null; model: string }
  | { status: "error"; message: string };

export type CardActions = {
  update: (id: string, patch: { body?: string; type?: CommentType | null }) => void;
  remove: (id: string) => void;
  startMove: (id: string) => void;
  /** null when AI tidy isn't available (no key configured). */
  tidy: ((card: Card) => void) | null;
  tidyState: (id: string) => TidyState | undefined;
  resolveTidy: (id: string, accept: boolean) => void;
  movingId: string | null;
};

export const CardActionsContext = createContext<CardActions | null>(null);

export function useCardActions(): CardActions {
  const a = useContext(CardActionsContext);
  if (!a) throw new Error("CardActionsContext missing");
  return a;
}
