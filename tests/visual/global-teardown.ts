// Global teardown: shut down the suite's dev server (contract C1.3).
// Playwright contract: this module exports a single default function.
import { shutdownDevServer } from "./harness";

export default async function globalTeardown(): Promise<void> {
  shutdownDevServer();
}
