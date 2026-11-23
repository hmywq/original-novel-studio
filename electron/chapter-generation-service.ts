import type { ModelPricing, TaskModelOverride } from "../src/shared/ai/types";
import { buildChapterBatchPreview, type ChapterReviewEstimate } from "../src/shared/chapter-batch-service";
import { assertNoHardStoryConstraint, evaluateStoryConstraints } from "../src/shared/story-constraints";
import type {
  BatchGenerationPreview,
  Chapter,
  ChapterBatchGenerationResult,
  ChapterDraftStreamEvent,
  CheckedChapterQualityReview,
  ContextPackage,
  ProjectDetail,
} from "../src/shared/types";
import { createChapterGenerationGuard, serializeChapterAiRetryContext } from "./ai-retry";
import type { AiCachePolicy, AiService, StartedAiTask } from "./ai-service";
import type { ChapterQualityService } from "./chapter-quality-service";
import type { WorkspaceDatabase } from "./database";

export type ChapterGenerationDatabase = Pick<
  WorkspaceDatabase,
  "getAiSettings" | "getProject" | "saveGeneratedChapter" | "searchRelevantFacts"
> &
  Partial<Pick<WorkspaceDatabase, "markAiJobApplicationFailed">>;

export type ChapterGenerationAi = Pick<AiService, "draftChapter" | "startDraftChapter">;

export interface ChapterGenerationDependencies {
  database: ChapterGenerationDatabase;
  ai: ChapterGenerationAi;
  /** 是否已配置可用的 AI 凭据（来源或旧版单密钥）。 */
  hasAiCredential: () => boolean;
  quality: ChapterQualityService;
  estimateReview: (project: ProjectDetail, chapter: Chapter, override?: TaskModelOverride) => ChapterReviewEstimate;
  draftPricing?: (override?: TaskModelOverride) => ModelPricing | null;
  compileContext: (
    project: ProjectDetail,
    chapter: Chapter,
    relevantFacts?: ReadonlyArray<ProjectDetail["facts"][number]>,
  ) => ContextPackage;
}

export interface ChapterGenerationCoordinator {
  isActive(projectId: string): boolean;
  markActive(projectId: string): void;
  markIdle(projectId: string): void;
  previewBatch(
    project: ProjectDetail,
    settings: ReturnType<WorkspaceDatabase["getAiSettings"]>,
    chapterId: string,
    override?: TaskModelOverride,
  ): BatchGenerationPreview;
  startOne(
    projectId: string,
    chapterId: string,
    onStream?: (event: ChapterDraftStreamEvent) => void,
    cachePolicy?: AiCachePolicy,
    override?: TaskModelOverride,
  ): StartedAiTask<Chapter>;
  generateOne(
    projectId: string,
    chapterId: string,
    onStream?: (event: ChapterDraftStreamEvent) => void,
    override?: TaskModelOverride,
  ): Promise<Chapter>;
  generateBatch(
    projectId: string,
    chapterId: string,
    override?: TaskModelOverride,
  ): Promise<ChapterBatchGenerationResult>;
}

export function createChapterGenerationCoordinator({
  database,
  ai,
  hasAiCredential,
  compileContext,
  quality,
  estimateReview,
  draftPricing,
}: ChapterGenerationDependencies): ChapterGenerationCoordinator {
  if (!quality?.run || !quality.reusable || !estimateReview) throw new Error("正文生成必须配置共享质检服务与审稿估算");
  const activeProjects = new Set<string>();

  const isActive = (projectId: string) => activeProjects.has(projectId);
  const markActive = (projectId: string) => {
    activeProjects.add(projectId);
  };
  const markIdle = (projectId: string) => {
    activeProjects.delete(projectId);
  };

  const previewBatch: ChapterGenerationCoordinator["previewBatch"] = (project, settings, chapterId, override) =>
    buildChapterBatchPreview(
      project,
      settings,
      chapterId,
      (chapter) => compileContext(project, chapter).estimatedTokens,
      {
        estimateReview: (chapter) => estimateReview(project, chapter, override),
        canReuseQuality: (chapter) => Boolean(quality.reusable(project.summary.id, chapter.id, override)),
        ...(draftPricing ? { draftPricing: draftPricing(override) } : {}),
      },
    );

  const checkedDraft = async (projectId: string, chapter: Chapter, override?: TaskModelOverride) => {
    let review: CheckedChapterQualityReview;
    try {
      review = await quality.run(projectId, chapter.id, { trigger: "after-generation", override });
    } catch (error) {
      review = {
        issues: [],
        observations: [],
        check: {
          runId: "",
          status: "未完成检查",
          chapterFingerprint: "",
          inputFingerprint: "",
          checkedAt: null,
          issueIds: [],
          observations: [],
          reason: error instanceof Error ? error.message : String(error),
        },
      };
    }
    let current = chapter;
    try {
      current = database.getProject(projectId).chapters.find((entry) => entry.id === chapter.id) ?? chapter;
    } catch (error) {
      review = {
        ...review,
        check: {
          ...review.check,
          status: "未完成检查",
          reason: `正文已保存，检查后重载失败：${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
    return { chapter: { ...current, qualityCheck: review.check }, review };
  };
  const pauseReason = (review: CheckedChapterQualityReview) => {
    if (!["已通过", "有冲突"].includes(review.check.status))
      return `未完成检查：${review.check.reason ?? "请手动重新检查"}`;
    if (review.issues.some((issue) => issue.severity === "硬性" && issue.status === "待处理"))
      return "存在未处理的硬性问题，请处理后继续";
    return null;
  };

  const startOne: ChapterGenerationCoordinator["startOne"] = (
    projectId,
    chapterId,
    onStream,
    cachePolicy = "use",
    override,
  ) => {
    if (isActive(projectId)) throw new Error("该作品已有正文生成任务正在运行");
    const project = database.getProject(projectId);
    if (!project.contract.approved) throw new Error("创作契约审批后才能生成正文");
    const chapter = project.chapters.find((item) => item.id === chapterId);
    if (!chapter) throw new Error("章节不存在");
    if (!chapter.outline.trim()) throw new Error("请先填写本章章纲");
    if (["已定稿", "待发布", "已发布"].includes(chapter.status))
      throw new Error("已定稿或进入发布流程的章节不能由 AI 覆写");
    assertNoHardStoryConstraint(evaluateStoryConstraints(project.facts, chapter));
    if (!hasAiCredential()) throw new Error("尚未配置 AI API 密钥");

    markActive(projectId);
    try {
      const facts = database.searchRelevantFacts(projectId, `${chapter.title} ${chapter.outline}`, chapter.number);
      const generationGuard = createChapterGenerationGuard(chapter);
      const task = ai.startDraftChapter(projectId, chapter, compileContext(project, chapter, facts), {
        retryContext: serializeChapterAiRetryContext("chapter", projectId, chapter),
        onStream,
        cachePolicy,
        override,
      });
      return {
        ...task,
        completion: task.completion
          .then(async (generated) => {
            let saved: Chapter;
            try {
              saved = database.saveGeneratedChapter(projectId, generated, generationGuard);
            } catch (error) {
              if (task.jobId) {
                const message = error instanceof Error ? error.message : String(error);
                database.markAiJobApplicationFailed?.(task.jobId, `模型输出未应用：${message}`);
              }
              throw error;
            }
            return (await checkedDraft(projectId, saved, override)).chapter;
          })
          .finally(() => markIdle(projectId)),
      };
    } catch (error) {
      markIdle(projectId);
      throw error;
    }
  };

  const generateOne: ChapterGenerationCoordinator["generateOne"] = (projectId, chapterId, onStream, override) =>
    startOne(projectId, chapterId, onStream, "use", override).completion;

  const generateBatch: ChapterGenerationCoordinator["generateBatch"] = async (projectId, chapterId, override) => {
    if (isActive(projectId)) throw new Error("该作品已有正文生成任务正在运行");
    const preview = previewBatch(database.getProject(projectId), database.getAiSettings(), chapterId, override);
    if (!preview.canRun) {
      if (preview.blockingReason?.includes("手动检查")) {
        const stoppedAtChapter = Number(preview.blockingReason.match(/^第(\d+)章/)?.[1]) || null;
        const chapters = database
          .getProject(projectId)
          .chapters.filter(
            (entry) =>
              preview.chapters.some((candidate) => candidate.id === entry.id) &&
              entry.content.trim() &&
              (stoppedAtChapter === null || entry.number <= stoppedAtChapter),
          );
        return {
          chapters,
          status: "paused",
          stoppedAtChapter,
          reason: `已保留${chapters.length}章正文；${preview.blockingReason}，后续尚未生成`,
        };
      }
      throw new Error(preview.blockingReason ?? "当前不能执行五章批次");
    }
    if (!hasAiCredential() && preview.reviewCalls > 0) throw new Error("尚未配置 AI API 密钥");

    markActive(projectId);
    try {
      const generated: Chapter[] = [];
      const paused = (number: number, reason: string): ChapterBatchGenerationResult => ({
        chapters: generated,
        status: "paused",
        stoppedAtChapter: number,
        reason: `第${number}章暂停，已保留${generated.length}章正文：${reason}`,
      });
      for (const candidate of preview.chapters) {
        const project = database.getProject(projectId);
        const freshPreview = previewBatch(project, database.getAiSettings(), chapterId, override);
        if (!freshPreview.canRun) return paused(candidate.number, freshPreview.blockingReason ?? "批次条件已变化");
        const chapter = project.chapters.find((item) => item.id === candidate.id);
        if (!chapter) throw new Error(`第${candidate.number}章不存在`);
        if (chapter.content.trim()) {
          const reusable = quality.reusable(projectId, chapter.id, override);
          if (!reusable) return paused(chapter.number, "已有正文缺少有效完整检查，请先手动检查");
          const reason = pauseReason(reusable);
          if (reason) return paused(chapter.number, reason);
          generated.push({ ...chapter, qualityCheck: reusable.check });
          continue;
        }
        assertNoHardStoryConstraint(evaluateStoryConstraints(project.facts, chapter));
        const facts = database.searchRelevantFacts(projectId, `${chapter.title} ${chapter.outline}`, chapter.number);
        const generationGuard = createChapterGenerationGuard(chapter);
        let jobId: string | null = null;
        let draft: Chapter;
        try {
          draft = await ai.draftChapter(
            projectId,
            chapter,
            compileContext(project, chapter, facts),
            serializeChapterAiRetryContext("batch", projectId, chapter),
            undefined,
            override,
            { onJobStarted: (started) => (jobId = started) },
          );
        } catch (error) {
          if (!generated.length) throw error;
          return paused(chapter.number, error instanceof Error ? error.message : String(error));
        }
        let saved: Chapter;
        try {
          saved = database.saveGeneratedChapter(projectId, draft, generationGuard);
        } catch (error) {
          // 与单章路径一致：保存失败要把任务改记失败，否则付费输出既没落盘又留着"成功"缓存。
          if (jobId) {
            const message = error instanceof Error ? error.message : String(error);
            database.markAiJobApplicationFailed?.(jobId, `模型输出未应用：${message}`);
          }
          throw error;
        }
        const checked = await checkedDraft(projectId, saved, override);
        generated.push(checked.chapter);
        const reason = pauseReason(checked.review);
        if (reason) return paused(chapter.number, reason);
      }
      return { chapters: generated, status: "completed", stoppedAtChapter: null, reason: null };
    } finally {
      markIdle(projectId);
    }
  };

  return {
    isActive,
    markActive,
    markIdle,
    previewBatch,
    startOne,
    generateOne,
    generateBatch,
  };
}
