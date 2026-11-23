import { createHash } from "node:crypto";
import { PROMPT_VERSION } from "../src/shared/prompt-version";
import type { Chapter, ContextPackage } from "../src/shared/types";

/** Excludes workflow-only metadata so that recording a review does not invalidate itself. */
export function chapterQualityFingerprint(chapter: Chapter): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        chapter.number,
        chapter.title,
        chapter.outline,
        chapter.content,
        chapter.chapterFunction ?? null,
        chapter.targetWords ?? null,
        chapter.chapterPromise ?? "",
        chapter.expectedPayoff ?? "",
        chapter.crisis ?? "",
        chapter.endingExpectation ?? "",
        chapter.expectationTargetChapter ?? null,
        chapter.linkedExpectationIds ?? [],
      ]),
    )
    .digest("hex");
}

/** Hash only stable inputs that are actually used by this review, never diagnostic timestamps. */
export function chapterQualityInputFingerprint(context: ContextPackage, localInputs: unknown = null): string {
  const { diagnostics: _diagnostics, estimatedTokens: _tokens, ...input } = context;
  return createHash("sha256")
    .update(JSON.stringify({ promptVersion: PROMPT_VERSION, ...input, localInputs }))
    .digest("hex");
}
