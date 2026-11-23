import { describe, expect, it } from "vitest";
import {
  buildChapterContinuityContext,
  resolveEndingReviewScope,
  validateContinuityEvidence,
} from "../src/shared/chapter-continuity";
import { estimateTextTokens } from "../src/shared/token-estimator";
import type { Chapter, StoryContract } from "../src/shared/types";

const contract: StoryContract = {
  premise: "守站人归还借灯",
  protagonistDesire: "交回工具",
  readerPromise: "查明登记册为何缺页",
  coreEmotion: "信任",
  ending: "归还工具并补齐登记册",
  immutableRules: [],
  prohibitedPatterns: [],
  version: 1,
  approved: true,
  updatedAt: "now",
};

function chapter(number: number, content = `第${number}章原文`, status: Chapter["status"] = "草稿"): Chapter {
  return {
    id: `c${number}`,
    number,
    title: `第${number}章`,
    outline: "核对工具",
    content,
    wordCount: content.length,
    status,
    batchMode: "逐章",
    isKeyChapter: false,
    revision: 1,
    updatedAt: "now",
  };
}

function project(chapters: Chapter[] = []) {
  return { summary: { targetWords: 10_000, wordsPerChapter: 2_000 }, contract, plans: [], chapters };
}

describe("bounded chapter continuity", () => {
  it("sorts and includes only the nearest three prior chapters with their authority", () => {
    const current = chapter(5, "本章不能作为前文");
    const prior = project([
      chapter(3),
      chapter(1, "过早原文"),
      chapter(6, "后章秘密"),
      chapter(4),
      chapter(2, "定稿依据", "已定稿"),
      current,
    ]);
    const result = buildChapterContinuityContext(prior, current, 20_000);
    expect(result.includedChapters).toEqual([2, 3, 4]);
    expect(result.text).not.toContain("本章不能作为前文");
    expect(result.text).not.toContain("后章秘密");
    expect(result.text).not.toContain("过早原文");
    expect(result.sources.find((source) => source.chapterNumber === 2)?.authority).toBe("定稿正文");
    expect(result.sources.find((source) => source.chapterNumber === 4)?.authority).toBe("待审前文");
    expect(result.omittedChapters).toBe(1);
  });

  it("keeps a chapter opening and ending as separate continuous sources", () => {
    const text = `我今晚同唐晖值班，宋澜早已去世。${"中".repeat(1500)}封条已经剪断，租灯预付款已经退清。`;
    const current = chapter(2);
    const result = buildChapterContinuityContext(project([chapter(1, text)]), current, 20_000);
    const head = result.sources.find((source) => source.id === "chapter:c1:head");
    const tail = result.sources.find((source) => source.id === "chapter:c1:tail");
    expect(head?.text).toHaveLength(300);
    expect(tail?.text).toHaveLength(700);
    expect(head?.text).toContain("同唐晖值班");
    expect(tail?.text).toContain("预付款已经退清");
    expect(result.text).toContain("中段省略");
    expect(result.truncated).toBe(true);
    expect(result.sources.reduce((sum, source) => sum + source.text.length, 0)).toBe(1000);
  });

  it("does not duplicate overlapping short excerpts", () => {
    const text = "唐晖把剪断的封条交给石骏。";
    const result = buildChapterContinuityContext(project([chapter(1, text)]), chapter(2), 20_000);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].text).toBe(text);
    expect(result.text.split(text)).toHaveLength(2);
  });

  it("counts source headings within character and token bounds and preserves the latest tail first", () => {
    const p = project([
      chapter(1, "旧".repeat(2000)),
      chapter(2, "次".repeat(2000)),
      chapter(3, `始${"近".repeat(1998)}终`),
    ]);
    const result = buildChapterContinuityContext(p, chapter(4), 1000);
    expect(result.text.length).toBeLessThanOrEqual(4800);
    expect(estimateTextTokens(result.text)).toBeLessThanOrEqual(250);
    expect(result.sources[0]?.id).toBe("chapter:c3:tail");
    expect(result.sources[0]?.text.endsWith("终")).toBe(true);
    expect(result.truncated).toBe(true);
    for (const source of result.sources) expect(result.text).toContain(source.text);
  });

  it("rejects empty and non-finite budgets without leaking source metadata", () => {
    for (const budget of [0, -1, Number.NaN]) {
      const result = buildChapterContinuityContext(project([chapter(1)]), chapter(2), budget);
      expect(result.text).toBe("");
      expect(result.sources).toEqual([]);
    }
  });

  it("adds the opening promise only for a planned final chapter and deduplicates overlap", () => {
    const p = {
      ...project([chapter(1, "九月十二日的交接记录被整页取走。"), chapter(2), chapter(3), chapter(4)]),
      contract: { ...contract, lengthShape: "万字短篇" },
    };
    const result = buildChapterContinuityContext(p, chapter(5), 20_000);
    expect(result.endingScope.mode).toBe("终章核对");
    expect(result.sources.find((source) => source.kind === "开篇承诺")?.text).toContain("九月十二日的交接记录");
    const short = buildChapterContinuityContext(
      { ...p, summary: { targetWords: 4000, wordsPerChapter: 2000 } },
      chapter(2),
      20_000,
    );
    expect(short.sources.filter((source) => source.chapterNumber === 1)).toHaveLength(1);
  });

  it("does not treat the last currently created chapter as the final chapter", () => {
    expect(resolveEndingReviewScope(project([chapter(1), chapter(2)]), chapter(2)).mode).toBe("到期期待");
    expect(
      resolveEndingReviewScope(
        { ...project(), contract: { ...contract, lengthShape: "万字短篇", approved: false } },
        chapter(5),
      ).mode,
    ).toBe("到期期待");
    expect(
      resolveEndingReviewScope(
        { ...project(), contract: { ...contract, lengthShape: "万字短篇", ending: " " } },
        chapter(5),
      ).mode,
    ).toBe("到期期待");
  });

  it("retains opening promises beyond character 300 when chapter one is still in the recent window", () => {
    const opening = `第一章开场${"甲".repeat(450)}九月十二日的交接记录为何缺页${"乙".repeat(1800)}`;
    const p = {
      ...project([chapter(1, opening), chapter(2), chapter(3)]),
      summary: { targetWords: 8000, wordsPerChapter: 2000 },
      contract: { ...contract, lengthShape: "万字短篇" },
    };
    const result = buildChapterContinuityContext(p, chapter(4), 20_000);
    expect(result.text).toContain("九月十二日的交接记录为何缺页");
    expect(result.sources.find((source) => source.kind === "开篇承诺")?.text).toHaveLength(1000);
    expect(result.sources.some((source) => source.id === "chapter:c1:head")).toBe(false);
  });

  it("requires approved volume coverage before reviewing a long-form finale", () => {
    const p = project();
    const volume = {
      id: "v",
      kind: "分卷" as const,
      title: "终卷",
      ordinal: 1,
      goal: "退清租灯预付款",
      conflict: "误会",
      outcome: "查明缺页",
      targetWords: 10_000,
      status: "已批准" as const,
      parentId: null,
    };
    expect(resolveEndingReviewScope({ ...p, plans: [volume] }, chapter(5))).toMatchObject({
      mode: "终章核对",
      expectedFinalChapter: 5,
    });
    expect(resolveEndingReviewScope({ ...p, plans: [{ ...volume, targetWords: 8000 }] }, chapter(4)).mode).toBe(
      "到期期待",
    );
    expect(resolveEndingReviewScope({ ...p, plans: [{ ...volume, status: "草稿" }] }, chapter(5)).mode).toBe(
      "到期期待",
    );
  });

  it("validates both continuous quotations against the selected source only", () => {
    const result = buildChapterContinuityContext(
      project([chapter(1, "唐晖已经退回预付款。封条放在证物袋里。")]),
      chapter(2),
      20_000,
    );
    const evidence = {
      sourceId: result.sources[0].id,
      previousQuote: "已经退回 预付款",
      currentQuote: "从未退回预付款",
      conflictKind: "动作" as const,
    };
    expect(validateContinuityEvidence(evidence, "我从未退回预付款。", result.sources)).toBe(true);
    expect(validateContinuityEvidence({ ...evidence, sourceId: "missing" }, "我从未退回预付款。", result.sources)).toBe(
      false,
    );
    expect(
      validateContinuityEvidence(
        { ...evidence, previousQuote: "唐晖封条放在证物袋里" },
        "我从未退回预付款。",
        result.sources,
      ),
    ).toBe(false);
    expect(
      validateContinuityEvidence(
        { ...evidence, currentQuote: "没有发生过的内容" },
        "我从未退回预付款。",
        result.sources,
      ),
    ).toBe(false);
    expect(
      validateContinuityEvidence({ ...evidence, previousQuote: "退回" }, "我从未退回预付款。", result.sources),
    ).toBe(false);
  });

  it("does not infer a conflict from aliases, memories or a legitimate state change", () => {
    const text = "唐晖的旧工牌上写着罗修。我想起宋澜生前说的话。登记后，我把剪断的封条装袋。";
    const result = buildChapterContinuityContext(project([chapter(1, text)]), chapter(2), 20_000);
    expect(result.sources[0].text).toBe(text);
    expect(result).not.toHaveProperty("issues");
  });
});
