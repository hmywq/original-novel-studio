import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceDatabase } from "../electron/database";
import type { Chapter, ChapterQualityCheck, CheckedChapterQualityReview, QualityIssue } from "../src/shared/types";

const roots: string[] = [];
const databases: WorkspaceDatabase[] = [];
const at = "2026-11-19T00:00:00.000Z";

function fingerprint(chapter: Chapter): string {
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

function setup() {
  const root = mkdtempSync(path.join(os.tmpdir(), "novel-quality-check-"));
  roots.push(root);
  const db = new WorkspaceDatabase(root);
  databases.push(db);
  const project = db.createProject({
    title: "连续性测试",
    genre: "都市脑洞",
    targetWords: 100_000,
    updateCadence: "日更",
  });
  const chapter = db.saveChapter(project.id, {
    id: "",
    number: 1,
    title: "第一次退款",
    outline: "核对退款",
    content: "她已将这笔预付款退还给顾客。",
    wordCount: 0,
    status: "草稿",
    batchMode: "逐章",
    isKeyChapter: false,
    revision: 0,
    updatedAt: at,
  });
  const check: ChapterQualityCheck = {
    runId: "run-1",
    status: "检查中",
    chapterFingerprint: fingerprint(chapter),
    inputFingerprint: "input-1",
    checkedAt: null,
    issueIds: [],
    observations: [],
    reason: null,
  };
  return { db, root, projectId: project.id, chapter, check };
}

function result(check: ChapterQualityCheck, issues: QualityIssue[] = []): CheckedChapterQualityReview {
  return {
    issues,
    observations: ["统计观察"],
    check: {
      ...check,
      status: "已通过",
      checkedAt: at,
      issueIds: issues.map((issue) => issue.id),
      observations: ["统计观察"],
    },
  };
}

afterEach(() => {
  while (databases.length) databases.pop()?.close();
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("persisted chapter quality checks", () => {
  it("saves quality metadata and issues atomically without editing or versioning the manuscript", () => {
    const { db, projectId, chapter, check } = setup();
    db.beginChapterQualityCheck(projectId, chapter.id, check);
    expect(
      db.saveChapterQualityReview(projectId, chapter.id, check.runId, check.chapterFingerprint, result(check)),
    ).toBe(true);
    expect(db.getChapter(projectId, chapter.id)).toMatchObject({
      content: chapter.content,
      revision: chapter.revision,
      qualityCheck: { status: "已通过", observations: ["统计观察"] },
    });
    expect(db.getProject(projectId).chapters[0].qualityCheck?.status).toBe("已通过");
    expect(db.getProjectOverview(projectId).chapters[0].qualityCheck?.status).toBe("已通过");
  });

  it("does not let an old run or an edited chapter receive a passing result", () => {
    const { db, projectId, chapter, check } = setup();
    db.beginChapterQualityCheck(projectId, chapter.id, check);
    db.beginChapterQualityCheck(projectId, chapter.id, { ...check, runId: "run-2" });
    expect(
      db.saveChapterQualityReview(projectId, chapter.id, check.runId, check.chapterFingerprint, result(check)),
    ).toBe(false);
    db.saveChapter(projectId, { ...chapter, content: "作者改成了另一笔款项。" });
    expect(
      db.saveChapterQualityReview(
        projectId,
        chapter.id,
        "run-2",
        check.chapterFingerprint,
        result({ ...check, runId: "run-2" }),
      ),
    ).toBe(false);
    expect(db.getChapter(projectId, chapter.id).qualityCheck?.status).toBe("未完成检查");
  });

  it("ignores renderer qualityCheck fields and preserves pending hard issues after an incomplete review", () => {
    const { db, projectId, chapter, check } = setup();
    const hard: QualityIssue = {
      id: "hard-old",
      projectId,
      chapterId: chapter.id,
      severity: "硬性",
      category: "事实冲突",
      message: "同一笔预付款重复退款",
      evidence: "预付款",
      status: "待处理",
      createdAt: at,
    };
    db.saveIssues(projectId, chapter.id, [hard]);
    db.saveChapter(projectId, { ...chapter, qualityCheck: { ...check, status: "已通过" } });
    expect(db.getChapter(projectId, chapter.id).qualityCheck).toBeUndefined();
    db.beginChapterQualityCheck(projectId, chapter.id, check);
    db.saveChapterQualityReview(projectId, chapter.id, check.runId, check.chapterFingerprint, {
      ...result(check),
      check: { ...check, status: "未完成检查", checkedAt: at, reason: "任务已取消" },
    });
    expect(db.getProject(projectId).issues.find((issue) => issue.id === hard.id)?.status).toBe("待处理");
  });

  it("projects an interrupted check as incomplete after reopening without changing the saved manuscript", () => {
    const { db, root, projectId, chapter, check } = setup();
    db.beginChapterQualityCheck(projectId, chapter.id, check);
    db.close();
    databases.splice(databases.indexOf(db), 1);
    const reopened = new WorkspaceDatabase(root);
    databases.push(reopened);
    expect(reopened.getChapter(projectId, chapter.id)).toMatchObject({
      content: chapter.content,
      qualityCheck: { status: "未完成检查" },
    });
  });

  it("rolls back review metadata and issue replacement together if the transaction fails", () => {
    const { db, projectId, chapter, check } = setup();
    const oldHard: QualityIssue = {
      id: "hard-before-failure",
      projectId,
      chapterId: chapter.id,
      severity: "硬性",
      category: "事实冲突",
      message: "退款状态需要作者核对",
      evidence: "预付款",
      status: "待处理",
      createdAt: at,
    };
    const nextIssue: QualityIssue = {
      ...oldHard,
      id: "review-after-failure",
      severity: "警告",
      message: "新检查的建议",
    };
    db.saveIssues(projectId, chapter.id, [oldHard]);
    db.beginChapterQualityCheck(projectId, chapter.id, check);
    const previousFaults = process.env.NOVEL_STUDIO_FAULTS;
    try {
      process.env.NOVEL_STUDIO_FAULTS = "power-loss-before-commit";
      expect(() =>
        db.saveChapterQualityReview(
          projectId,
          chapter.id,
          check.runId,
          check.chapterFingerprint,
          result(check, [nextIssue]),
        ),
      ).toThrow();
    } finally {
      if (previousFaults === undefined) delete process.env.NOVEL_STUDIO_FAULTS;
      else process.env.NOVEL_STUDIO_FAULTS = previousFaults;
    }
    const stored = db.getChapter(projectId, chapter.id);
    const issues = db.getProject(projectId).issues;
    expect(stored).toMatchObject({
      content: chapter.content,
      revision: chapter.revision,
      qualityCheck: { status: "未完成检查", checkedAt: null },
    });
    expect(issues.find((issue) => issue.id === oldHard.id)?.status).toBe("待处理");
    expect(issues.some((issue) => issue.id === nextIssue.id)).toBe(false);
  });
});
