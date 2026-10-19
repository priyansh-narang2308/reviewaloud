import type { Metadata } from "next";
import { CaptureSpike } from "./capture-spike";

export const metadata: Metadata = { title: "Capture spike · ReviewAloud" };

// Task 4 (gate G1): proves Wispr Flow text lands in our textarea while the
// selected diff anchor stays fixed. Throwaway page; not linked from the app.
export default function Page() {
  return <CaptureSpike />;
}
