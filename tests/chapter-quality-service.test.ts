import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ChapterQualityDependencies, createChapterQualityService } from "../electron/chapter-quality-service";
import { WorkspaceDatabase } from "../electron/database";
import { compileProjectChapterContext } from "../src/shared/context-compiler";
import type { ContextPackage, QualityIssue } from "../src/shared/types";

const roots: string[] = [];
const databases: WorkspaceDatabase[] = [];
const at = "2026-11-19T00:00:00.000Z";
const context: ContextPackage = {
  contract: "契约",
  commercialGuidance: "",
  chapterIntent: "",
  expectationLedger: "",
  longTermMemory: "",
  volumeGoal: "",
  rollingOutline: "",
  recentSummary: "",
  relevantFacts: "",
  forbiddenKnowledge: "",
  authorStyle: "",
  estimatedTokens: 100,
};

function setup() {
  const root = mkdtempSync(path.join(os.tmpdir(), "novel-quality-service-"));
  roots.push(root);
  const database = new WorkspaceDatabase(root);
  databases.push(database);
  const project = database.createProject({
    title: "章后检查",
    genre: "都市脑洞",
    targetWords: 100_000,
    updateCadence: "日更",
  });
  const chapter = database.saveChapter(project.id, {
    id: "",
    number: 1,
    title: "封条",
    outline: "核对封条状态",
    content: "我剪断了柜上的封条。",
    wordCount: 0,
    status: "草稿",
    batchMode: "逐章",
    isKeyChapter: false,
    revision: 0,
    chapterPromise: "核对",
    expectedPayoff: "核实",
    crisis: "离场",
    endingExpectation: "照片日期",
    updatedAt: at,
  });
  const reviewChapter = vi.fn<ChapterQualityDependencies["ai"]["reviewChapter"]>(async () => ({
    issues: [],
    observations: ["离线模拟"],
  }));
  const runLocalQualityCheck = vi.fn(async () => ({ issues: [] as QualityIssue[], observations: ["本地观察"] }));
  const compileContext = vi.fn<ChapterQualityDependencies["compileContext"]>(() => ({ ...context }));
  let credential = true;
  let counter = 0;
  const service = createChapterQualityService({
    database,
    ai: { reviewChapter },
    compileContext,
    runLocalQualityCheck,
    hasAiCredential: () => credential,
    createId: () => `run-${++counter}`,
    currentTimestamp: () => at,
  });
  return {
    database,
    projectId: project.id,
    chapter,
    reviewChapter,
    runLocalQualityCheck,
    compileContext,
    service,
    setCredential: (value: boolean) => {
      credential = value;
    },
  };
}

afterEach(() => {
  while (databases.length) databases.pop()?.close();
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("shared chapter quality service", () => {
  it("persists incomplete status and releases active state when post-review compilation fails", async () => {
    const h = setup();
    h.compileContext.mockReturnValueOnce({ ...context }).mockImplementation(() => {
      throw new Error("复核上下文无法编译");
    });
    const result = await h.service.run(h.projectId, h.chapter.id, { trigger: "after-generation" });
    const saved = h.database.getChapter(h.projectId, h.chapter.id);
    expect(result.check.status).toBe("未完成检查");
    expect(saved.content).toBe(h.chapter.content);
    expect(saved.qualityCheck?.status).toBe("未完成检查");
    expect(saved.qualityCheck?.reason).toContain("复核上下文");
    expect(saved.qualityCheck?.checkedAt).toBe(at);
  });
  it("uses chapter-visible progress with the real compiler when future chapters cross a macro stage", async () => {
    const h = setup();
    const current = h.database.saveChapter(h.projectId, { ...h.chapter, number: 11, isKeyChapter: true });
    const future = h.database.saveChapter(h.projectId, { ...current, id: "", number: 12, content: "", revision: 0 });
    for (let index = 1; index <= 2; index++)
      h.database.savePlan(h.projectId, {
        id: "",
        kind: "宏观阶段",
        title: index === 1 ? "调查起步" : "全面追查",
        ordinal: index,
        goal: `目标${index}`,
        conflict: `冲突${index}`,
        outcome: `结果${index}`,
        targetWords: 100,
        status: "已批准",
        parentId: null,
      });
    h.compileContext.mockImplementation((project, chapter, facts) =>
      compileProjectChapterContext(project, chapter, facts),
    );
    await h.service.run(h.projectId, current.id, { trigger: "manual" });
    const before = h.service.reusable(h.projectId, current.id);
    h.database.saveChapter(h.projectId, { ...future, content: "后续章节增长。".repeat(100) });
    expect(h.database.getProject(h.projectId).summary.currentWords).toBeGreaterThan(100);
    expect(before?.check.status).toBe("已通过");
    expect(h.service.reusable(h.projectId, current.id)?.check.runId).toBe(before?.check.runId);
  });

  it("persists an incomplete check if review context preparation fails", async () => {
    const h = setup();
    h.compileContext.mockImplementation(() => {
      throw new Error("上下文超出模型窗口");
    });
    const result = await h.service.run(h.projectId, h.chapter.id, { trigger: "after-generation" });
    expect(result.check.status).toBe("未完成检查");
    expect(h.database.getChapter(h.projectId, h.chapter.id).qualityCheck?.reason).toContain("上下文");
    expect(h.reviewChapter).not.toHaveBeenCalled();
  });
  it("records a complete review and reuses only the identical saved input", async () => {
    const h = setup();
    const review = await h.service.run(h.projectId, h.chapter.id, { trigger: "after-generation" });
    expect(review.check.status).toBe("已通过");
    expect(h.database.getChapter(h.projectId, h.chapter.id).qualityCheck?.status).toBe("已通过");
    expect(h.service.reusable(h.projectId, h.chapter.id)?.check.runId).toBe(review.check.runId);
    expect(h.reviewChapter).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), undefined, {
      attemptPolicy: "single",
    });
    h.compileContext.mockReturnValue({ ...context, relevantFacts: "新的权威事实" });
    expect(h.service.reusable(h.projectId, h.chapter.id)).toBeNull();
  });

  it.each(["模型请求超时", "任务已取消", "额度不足"])("retains saved text and marks %s incomplete", async (error) => {
    const h = setup();
    h.reviewChapter.mockRejectedValueOnce(new Error(error));
    const result = await h.service.run(h.projectId, h.chapter.id, { trigger: "after-generation" });
    expect(result.check.status).toBe("未完成检查");
    expect(result.check.reason).toContain(error);
    expect(h.database.getChapter(h.projectId, h.chapter.id).content).toBe("我剪断了柜上的封条。");
    expect(h.service.reusable(h.projectId, h.chapter.id)).toBeNull();
  });

  it("does not treat a missing credential or local failure as a passed check", async () => {
    const h = setup();
    h.setCredential(false);
    expect((await h.service.run(h.projectId, h.chapter.id, { trigger: "manual" })).check.status).toBe("未完成检查");
    expect(h.reviewChapter).not.toHaveBeenCalled();
    h.setCredential(true);
    h.runLocalQualityCheck.mockRejectedValueOnce(new Error("worker failure"));
    expect((await h.service.run(h.projectId, h.chapter.id, { trigger: "manual" })).check.status).toBe("未完成检查");
  });

  it("does not apply a late result after the author edits the current chapter", async () => {
    const h = setup();
    h.reviewChapter.mockImplementationOnce(async () => {
      h.database.saveChapter(h.projectId, { ...h.chapter, content: "作者写出了第二张封条的编号。" });
      return { issues: [], observations: [] };
    });
    const result = await h.service.run(h.projectId, h.chapter.id, { trigger: "manual" });
    expect(result.check.status).toBe("未完成检查");
    expect(result.check.reason).toMatch(/变化|过期/);
    expect(h.database.getChapter(h.projectId, h.chapter.id).content).toBe("作者写出了第二张封条的编号。");
  });

  it("invalidates a review when the admitted prior-source context changes during the request", async () => {
    const h = setup();
    h.reviewChapter.mockImplementationOnce(async () => {
      h.compileContext.mockReturnValue({ ...context, recentSummary: "前文章节已被作者修改" });
      return { issues: [], observations: [] };
    });
    const result = await h.service.run(h.projectId, h.chapter.id, { trigger: "manual" });
    expect(result.check.status).toBe("未完成检查");
    expect(h.service.reusable(h.projectId, h.chapter.id)).toBeNull();
  });

  it("keeps hard issues open after an incomplete check and uses the manual attempt policy", async () => {
    const h = setup();
    const hard: QualityIssue = {
      id: "old-hard",
      projectId: h.projectId,
      chapterId: h.chapter.id,
      severity: "硬性",
      category: "事实冲突",
      message: "封条状态矛盾",
      evidence: "剪断了柜上的封条",
      status: "待处理",
      createdAt: at,
    };
    h.database.saveIssues(h.projectId, h.chapter.id, [hard]);
    h.reviewChapter.mockRejectedValueOnce(new Error("任务已取消"));
    await h.service.run(h.projectId, h.chapter.id, { trigger: "manual" });
    expect(h.database.getProject(h.projectId).issues.find((issue) => issue.id === hard.id)?.status).toBe("待处理");
    expect(h.reviewChapter.mock.calls[0][4]).toEqual({ attemptPolicy: "default" });
  });

  it("reuses the same override budget rather than comparing it with the default model context", async () => {
    const h = setup();
    h.compileContext.mockImplementation((_project, _chapter, _facts, override) => ({
      ...context,
      recentSummary: override?.model === "small-review" ? "短窗口承接" : "默认长窗口承接",
    }));
    const override = { model: "small-review" };
    await h.service.run(h.projectId, h.chapter.id, { trigger: "manual", override });
    expect(h.service.reusable(h.projectId, h.chapter.id, override)?.check.status).toBe("已通过");
    expect(h.service.reusable(h.projectId, h.chapter.id)).toBeNull();
  });
});
