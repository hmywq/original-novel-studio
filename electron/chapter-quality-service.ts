import type { TaskModelOverride } from "../src/shared/ai/types";
import type {
  Chapter,
  ChapterQualityCheck,
  CheckedChapterQualityReview,
  ContextPackage,
  ProjectDetail,
  QualityIssue,
} from "../src/shared/types";
import type { AiService } from "./ai-service";
import { chapterQualityFingerprint, chapterQualityInputFingerprint } from "./chapter-quality-fingerprint";
import type { WorkspaceDatabase } from "./database";

export interface LocalChapterQualityInput {
  projectId: string;
  chapter: Chapter;
  previousChapter: Chapter | undefined;
  recentChapters: Chapter[];
  facts: ProjectDetail["facts"];
  contract: ProjectDetail["contract"];
  genre: ProjectDetail["summary"]["genre"];
  originalityMatches: ReturnType<WorkspaceDatabase["findOriginalityMatches"]>;
  aiFlavorWhitelist?: string[];
}

export interface ChapterQualityDependencies {
  database: Pick<
    WorkspaceDatabase,
    | "getProject"
    | "getChapter"
    | "searchRelevantFacts"
    | "findOriginalityMatches"
    | "beginChapterQualityCheck"
    | "saveChapterQualityReview"
  >;
  ai: Pick<AiService, "reviewChapter">;
  compileContext: (
    project: ProjectDetail,
    chapter: Chapter,
    facts?: readonly ProjectDetail["facts"][number][],
    override?: TaskModelOverride,
  ) => ContextPackage;
  runLocalQualityCheck: (
    input: LocalChapterQualityInput,
  ) => Promise<{ issues: QualityIssue[]; observations: string[] }>;
  hasAiCredential: () => boolean;
  createId: () => string;
  currentTimestamp: () => string;
}

export interface ChapterQualityService {
  run(
    projectId: string,
    chapterId: string,
    options: { trigger: "manual" | "after-generation"; override?: TaskModelOverride },
  ): Promise<CheckedChapterQualityReview>;
  reusable(projectId: string, chapterId: string, override?: TaskModelOverride): CheckedChapterQualityReview | null;
}

/** Shared manual/automatic review. Draft text is never edited by this service. */
export function createChapterQualityService(deps: ChapterQualityDependencies): ChapterQualityService {
  const snapshot = (projectId: string, chapterId: string, override?: TaskModelOverride) => {
    const storedProject = deps.database.getProject(projectId);
    const storedChapter = storedProject.chapters.find((entry) => entry.id === chapterId);
    if (!storedChapter) throw new Error("章节不存在");
    // Reviewing chapter N must not change simply because later draft chapters increased book progress.
    const project = {
      ...storedProject,
      summary: {
        ...storedProject.summary,
        currentWords: storedProject.chapters
          .filter((entry) => entry.number <= storedChapter.number)
          .reduce((sum, entry) => sum + entry.wordCount, 0),
      },
    };
    const chapter = project.chapters.find((entry) => entry.id === chapterId);
    if (!chapter) throw new Error("章节不存在");
    const facts = deps.database.searchRelevantFacts(
      projectId,
      `${chapter.title} ${chapter.outline} ${chapter.content.slice(0, 500)}`,
      chapter.number,
    );
    const context = deps.compileContext(project, chapter, facts, override);
    const recentChapters = project.chapters
      .filter((entry) => entry.number < chapter.number)
      .sort((left, right) => left.number - right.number)
      .slice(-12);
    const localInputs = {
      genre: project.summary.genre,
      contract: project.contract,
      facts: project.facts,
      expectations: project.expectations.filter((entry) => entry.sourceChapter <= chapter.number),
      whitelist: project.aiFlavorWhitelist ?? [],
      recentChapters: recentChapters.map((entry) => [entry.id, chapterQualityFingerprint(entry)]),
    };
    return {
      project,
      chapter,
      facts,
      context,
      recentChapters,
      chapterFingerprint: chapterQualityFingerprint(chapter),
      inputFingerprint: chapterQualityInputFingerprint(context, localInputs),
    };
  };

  const reusable: ChapterQualityService["reusable"] = (projectId, chapterId, override) => {
    const current = snapshot(projectId, chapterId, override);
    const check = current.chapter.qualityCheck;
    if (
      !check ||
      !["已通过", "有冲突"].includes(check.status) ||
      check.chapterFingerprint !== current.chapterFingerprint ||
      check.inputFingerprint !== current.inputFingerprint
    )
      return null;
    return {
      check,
      observations: check.observations,
      issues: current.project.issues.filter(
        (issue) => issue.chapterId === chapterId && check.issueIds.includes(issue.id),
      ),
    };
  };

  const run: ChapterQualityService["run"] = async (projectId, chapterId, options) => {
    let input: ReturnType<typeof snapshot>;
    try {
      input = snapshot(projectId, chapterId, options.override);
    } catch (error) {
      const chapter = deps.database.getChapter(projectId, chapterId);
      const check: ChapterQualityCheck = {
        runId: deps.createId(),
        status: "未完成检查",
        chapterFingerprint: chapterQualityFingerprint(chapter),
        inputFingerprint: "",
        checkedAt: deps.currentTimestamp(),
        issueIds: [],
        observations: [],
        reason: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      };
      const review: CheckedChapterQualityReview = { issues: [], observations: [], check };
      try {
        deps.database.beginChapterQualityCheck(projectId, chapterId, { ...check, status: "检查中" });
        deps.database.saveChapterQualityReview(projectId, chapterId, check.runId, check.chapterFingerprint, review);
      } catch {
        /* The saved manuscript remains authoritative even if metadata storage is unavailable. */
      }
      return review;
    }
    const check: ChapterQualityCheck = {
      runId: deps.createId(),
      status: "检查中",
      chapterFingerprint: input.chapterFingerprint,
      inputFingerprint: input.inputFingerprint,
      checkedAt: null,
      issueIds: [],
      observations: [],
      reason: null,
    };
    let issues: QualityIssue[] = [];
    let observations: string[] = [];
    let reason: string | null = null;
    try {
      deps.database.beginChapterQualityCheck(projectId, chapterId, check);
      const local = await deps.runLocalQualityCheck({
        projectId,
        chapter: input.chapter,
        previousChapter: input.recentChapters.find((entry) => entry.number === input.chapter.number - 1),
        recentChapters: input.recentChapters,
        facts: input.project.facts,
        contract: input.project.contract,
        genre: input.project.summary.genre,
        originalityMatches: deps.database.findOriginalityMatches(input.chapter.content),
        aiFlavorWhitelist: input.project.aiFlavorWhitelist,
      });
      issues = [...local.issues];
      observations = [...local.observations];
      const intent = [
        ["本章承诺", input.chapter.chapterPromise],
        ["预期回报", input.chapter.expectedPayoff],
        ["当前危机", input.chapter.crisis],
        ["结尾期待", input.chapter.endingExpectation],
      ];
      const advisory = (category: string, message: string, evidence = ""): QualityIssue => ({
        id: deps.createId(),
        projectId,
        chapterId,
        severity: "建议",
        category,
        message,
        evidence,
        status: "待处理",
        createdAt: deps.currentTimestamp(),
      });
      issues.push(
        ...intent
          .filter(([, value]) => !String(value ?? "").trim())
          .map(([label]) => advisory("章节商业意图", `${label}尚未规划，建议在写作台补充后再判断本章闭环。`)),
      );
      issues.push(
        ...input.project.expectations
          .filter(
            (entry) =>
              entry.sourceChapter <= input.chapter.number &&
              ["待兑现", "部分兑现"].includes(entry.status) &&
              entry.expectedPayoffChapter !== null &&
              entry.expectedPayoffChapter <= input.chapter.number &&
              !input.chapter.linkedExpectationIds?.includes(entry.id),
          )
          .map((entry) =>
            advisory(
              "期待兑现",
              `“${entry.title}”已到预计兑现章，但本章未标记承接；请确认延期、部分兑现或调整目标章。`,
              `第${entry.sourceChapter}章提出`,
            ),
          ),
      );
      if (!deps.hasAiCredential()) throw new Error("未配置审稿凭据，语义检查未执行");
      const semantic = await deps.ai.reviewChapter(
        { ...input.project, facts: input.facts },
        input.chapter,
        input.context,
        options.override,
        { attemptPolicy: options.trigger === "after-generation" ? "single" : "default" },
      );
      issues.push(...semantic.issues);
      observations.push(...semantic.observations);
    } catch (error) {
      reason = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
    }
    const seen = new Set<string>();
    issues = issues.filter((issue) => {
      const key = `${issue.category}\n${issue.message}\n${issue.evidence}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const finish = (failure: string | null): CheckedChapterQualityReview => ({
      issues,
      observations,
      check: {
        ...check,
        status: failure
          ? "未完成检查"
          : issues.some((issue) => issue.severity === "硬性" && issue.status === "待处理")
            ? "有冲突"
            : "已通过",
        issueIds: issues.map((issue) => issue.id),
        observations,
        checkedAt: deps.currentTimestamp(),
        reason: failure,
      },
    });
    let review = finish(reason);
    try {
      // No await between re-reading the admitted inputs and the database CAS transaction.
      const current = snapshot(projectId, chapterId, options.override);
      if (
        current.chapterFingerprint !== input.chapterFingerprint ||
        current.inputFingerprint !== input.inputFingerprint
      ) {
        issues = [];
        observations = [];
        review = finish("稿件或检查依据已变化，请重新检查");
        // Persist an incomplete marker without applying conclusions from stale inputs.
        deps.database.saveChapterQualityReview(projectId, chapterId, check.runId, input.chapterFingerprint, {
          ...review,
          issues: [],
          observations: [],
        });
        return { ...review, issues: [] };
      }
      if (!deps.database.saveChapterQualityReview(projectId, chapterId, check.runId, input.chapterFingerprint, review))
        return { ...finish("稿件或检查任务已变化，旧结果未应用"), issues: [] };
    } catch (error) {
      issues = [];
      observations = [];
      review = finish(`检查结果未能保存：${error instanceof Error ? error.message : String(error)}`);
      // Preparation can fail before the CAS call; settle the registered run without applying unverified conclusions.
      try {
        deps.database.saveChapterQualityReview(projectId, chapterId, check.runId, input.chapterFingerprint, review);
      } catch {
        /* Database failure releases the active run and keeps the existing manuscript/issues. */
      }
    }
    return review;
  };
  return { run, reusable };
}
