"use server";

import { refresh } from "next/cache";
import { castVote } from "@/lib/votes";

export async function submitVote(formData: FormData): Promise<void> {
  const voter = String(formData.get("voter") || "").trim();
  const name = String(formData.get("name") || "");
  await castVote(voter, name);
  refresh();
}
