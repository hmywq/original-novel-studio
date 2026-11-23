import { approvedVolumeRanges } from "./planning";
import { estimateTextTokens } from "./token-estimator";
import type { Chapter, ContinuityEvidence, PlanNode, ProjectSummary, StoryContract } from "./types";

export const CONTINUITY_PRIOR_CHAPTER_LIMIT = 3;
export const CONTINUITY_EXCERPT_MAX_CHARACTERS = 1000;
export const CONTINUITY_EXCERPT_HEAD_CHARACTERS = 300;
export const CONTINUITY_EXCERPT_TAIL_CHARACTERS = 700;
export const CONTINUITY_OPENING_MAX_CHARACTERS = 1000;
export const CONTINUITY_MAX_CHARACTERS = 4800;
export const CONTINUITY_MAX_TOKENS = 3000;

export interface ContinuitySource {
  id: string;
  kind: "前文" | "已确认事实" | "作者设定" | "开篇承诺";
  chapterNumber: number | null;
  authority: "已确认" | "定稿正文" | "待审前文";
  text: string;
}

export interface EndingReviewScope {
  mode: "终章核对" | "到期期待";
  expectedFinalChapter: number | null;
  reason: string;
}

export interface ChapterContinuityContext {
  text: string;
  sources: ContinuitySource[];
  endingScope: EndingReviewScope;
  includedChapters: number[];
  omittedChapters: number;
  truncated: boolean;
}

export type ContinuityChapter = Pick<Chapter, "number" | "content"> & Partial<Pick<Chapter, "id" | "status">>;

/** 只接收连续性所需投影；完整 ProjectDetail 可直接传入，不复制整本账本。 */
export interface ContinuityProject {
  summary: Pick<ProjectSummary, "targetWords"> & { wordsPerChapter?: number };
  contract: StoryContract;
  plans: readonly PlanNode[];
  chapters: readonly ContinuityChapter[];
}

/** 只有明确批准的有限结构才启动终章核对，滚动窗口的末章不等于结局。 */
export function resolveEndingReviewScope(project: ContinuityProject, chapter: Chapter): EndingReviewScope {
  const pending = (reason: string): EndingReviewScope => ({ mode: "到期期待", expectedFinalChapter: null, reason });
  if (!project.contract.approved || !project.contract.ending.trim()) return pending("尚无已批准的明确结局");
  const target = project.summary.targetWords;
  const wordsPerChapter = project.summary.wordsPerChapter ?? 2500;
  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(wordsPerChapter) || wordsPerChapter <= 0) {
    return pending("篇幅目标不足以确定计划终章");
  }
  let finalChapter: number;
  if (project.contract.lengthShape === "万字短篇") {
    finalChapter = Math.ceil(target / wordsPerChapter);
  } else {
    const volumes = approvedVolumeRanges([...project.plans], wordsPerChapter);
    const coveredWords = volumes.reduce((sum, range) => sum + range.plan.targetWords, 0);
    if (!volumes.length || coveredWords < target) return pending("已批准分卷尚未覆盖全书目标");
    finalChapter = volumes.at(-1)!.toChapter;
  }
  return chapter.number === finalChapter
    ? {
        mode: "终章核对",
        expectedFinalChapter: finalChapter,
        reason: "当前章是已批准结构的计划终章，按作者约定核对主线承诺与到期期待",
      }
    : { mode: "到期期待", expectedFinalChapter: finalChapter, reason: "当前章尚非计划终章，只核对本章承接与到期期待" };
}

function sourceFor(
  chapter: ContinuityChapter,
  part: "full" | "head" | "tail" | "opening",
  text: string,
): ContinuitySource {
  return {
    id: `chapter:${chapter.id ?? chapter.number}:${part}`,
    kind: part === "opening" ? "开篇承诺" : "前文",
    chapterNumber: chapter.number,
    authority: ["已定稿", "待发布", "已发布"].includes(chapter.status ?? "") ? "定稿正文" : "待审前文",
    text,
  };
}

function renderSource(source: ContinuitySource): string {
  const part = source.id.endsWith(":head")
    ? "章首，中段省略"
    : source.id.endsWith(":tail")
      ? "章末，中段省略"
      : source.kind;
  return `[来源 ${source.id}｜第${source.chapterNumber}章｜${source.authority}｜${part}]\n${source.text}`;
}

/** 原文片段只负责保留依据，不以关键词判断身份、生死、退款等语义冲突。 */
export function buildChapterContinuityContext(
  project: ContinuityProject,
  chapter: Chapter,
  budgetTokens: number,
): ChapterContinuityContext {
  const endingScope = resolveEndingReviewScope(project, chapter);
  const prior = project.chapters
    .filter((item) => item.number < chapter.number && item.content.trim())
    .sort((a, b) => a.number - b.number);
  const nearest = prior.slice(-CONTINUITY_PRIOR_CHAPTER_LIMIT).reverse();
  const candidates: ContinuitySource[] = [];
  let excerpted = false;
  for (const item of nearest) {
    if (item.content.length <= CONTINUITY_EXCERPT_MAX_CHARACTERS) {
      candidates.push(sourceFor(item, "full", item.content));
    } else {
      candidates.push(sourceFor(item, "tail", item.content.slice(-CONTINUITY_EXCERPT_TAIL_CHARACTERS)));
      candidates.push(sourceFor(item, "head", item.content.slice(0, CONTINUITY_EXCERPT_HEAD_CHARACTERS)));
      excerpted = true;
    }
  }
  if (endingScope.mode === "终章核对") {
    const opening = prior.find((item) => item.number === 1);
    if (opening) {
      const openingText = opening.content.slice(0, CONTINUITY_OPENING_MAX_CHARACTERS);
      // 第一章仍在近期窗口时，用完整开篇片段替代短章首；章末只保留不重叠部分。
      for (let index = candidates.length - 1; index >= 0; index -= 1) {
        const candidate = candidates[index];
        if (candidate.chapterNumber !== 1) continue;
        if (candidate.id.endsWith(":tail") && opening.content.length > openingText.length) {
          const start = Math.max(openingText.length, opening.content.length - CONTINUITY_EXCERPT_TAIL_CHARACTERS);
          candidates[index] = { ...candidate, text: opening.content.slice(start) };
        } else {
          candidates.splice(index, 1);
        }
      }
      // 紧随上章片段，早于其他较早章节，确保结局能看见开篇承诺。
      const index = candidates.findIndex((source) => source.chapterNumber !== nearest[0]?.number);
      candidates.splice(index < 0 ? candidates.length : index, 0, sourceFor(opening, "opening", openingText));
      excerpted ||= opening.content.length > CONTINUITY_OPENING_MAX_CHARACTERS;
    }
  }
  const tokenLimit = Number.isFinite(budgetTokens)
    ? Math.min(CONTINUITY_MAX_TOKENS, Math.max(0, Math.floor(budgetTokens * 0.25)))
    : 0;
  const header = `作者已批准规则和已确认事实优先，其次定稿正文；待审前文仅供承接，矛盾须核对，不能自动改写设定。\n核对范围：${endingScope.mode}；${endingScope.reason}`;
  let text = "";
  const sources: ContinuitySource[] = [];
  const fits = (value: string) => value.length <= CONTINUITY_MAX_CHARACTERS && estimateTextTokens(value) <= tokenLimit;
  if (tokenLimit > 0 && fits(header)) {
    text = header;
    for (const candidate of candidates) {
      let source = { ...candidate };
      const append = (item: ContinuitySource) => `${text}\n\n${renderSource(item)}`;
      if (!fits(append(source))) {
        let low = 0;
        let high = source.text.length;
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          const value = candidate.id.endsWith(":tail")
            ? candidate.text.slice(-middle)
            : candidate.text.slice(0, middle);
          if (fits(append({ ...source, text: value }))) low = middle;
          else high = middle - 1;
        }
        if (low < 4) continue;
        source = {
          ...source,
          text: candidate.id.endsWith(":tail") ? candidate.text.slice(-low) : candidate.text.slice(0, low),
        };
      }
      text = append(source);
      sources.push(source);
    }
  }
  const includedChapters = [
    ...new Set(sources.map((source) => source.chapterNumber).filter((value): value is number => value !== null)),
  ].sort((a, b) => a - b);
  return {
    text,
    sources,
    endingScope,
    includedChapters,
    omittedChapters: prior.filter((item) => !includedChapters.includes(item.number)).length,
    truncated:
      excerpted ||
      sources.length < candidates.length ||
      sources.some((source) => source.text !== candidates.find((item) => item.id === source.id)?.text) ||
      prior.length > includedChapters.length,
  };
}

/** 只证明双引文来自本次实际选用的连续原文，不能单独证明语义矛盾。 */
export function validateContinuityEvidence(
  evidence: ContinuityEvidence,
  chapterText: string,
  sources: readonly ContinuitySource[],
): boolean {
  const normalize = (value: string) => value.replace(/\s+/gu, "");
  const previousQuote = normalize(evidence.previousQuote);
  const currentQuote = normalize(evidence.currentQuote);
  if (previousQuote.length < 4 || currentQuote.length < 4) return false;
  const source = sources.find((item) => item.id === evidence.sourceId);
  return Boolean(
    source && normalize(source.text).includes(previousQuote) && normalize(chapterText).includes(currentQuote),
  );
}
