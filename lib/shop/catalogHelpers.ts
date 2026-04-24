import type { PipelineStage } from "mongoose";

/** Shared with shop browse search and document matching. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Active catalog products (same semantics as shop listing). */
export function activeProductMatchStage(): PipelineStage {
  return {
    $match: {
      $or: [{ isActive: true }, { isActive: { $exists: false } }],
    },
  };
}
