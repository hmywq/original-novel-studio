import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserApi } from "../src/lib/browser-api";

const initialTime = "2026-07-31T00:00:00.000Z";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(initialTime);
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(() => null),
    length: 0,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("browser chapter workflow", () => {
  it("does not accept a renderer-supplied successful quality check", async () => {
    const api = createBrowserApi();
    const project = await api.getProject("demo-project");
    const saved = await api.saveChapter("demo-project", {
      ...project.chapters[1],
      content: "作者修改了人物身份。",
      qualityCheck: {
        runId: "forged",
        status: "已通过",
        chapterFingerprint: "forged",
        inputFingerprint: "forged",
        checkedAt: initialTime,
        issueIds: [],
        observations: [],
        reason: null,
      },
    });
    expect(saved.qualityCheck?.status).not.toBe("已通过");
    const checked = await api.runQualityCheck("demo-project", saved.id);
    const edited = await api.saveChapter("demo-project", {
      ...saved,
      content: "人物身份再次修改。",
      qualityCheck: checked.check,
    });
    expect(edited.qualityCheck?.status).not.toBe("已通过");
    expect(edited.qualityCheck?.reason).toContain("修改");
  });
  it("applies shared batch gates and versions status transitions", async () => {
    const api = createBrowserApi();
    const [summary] = await api.listProjects();
    const project = await api.getProject(summary.id);
    const chapter = project.chapters.find((item) => item.number === 2)!;

    const savedAt = "2026-08-02T01:00:00.000Z";
    vi.setSystemTime(savedAt);
    const saved = await api.saveChapter(summary.id, {
      ...chapter,
      content: "正文🙂 \n",
      batchMode: "五章批次",
      isKeyChapter: true,
    });
    const afterSave = await api.getProject(summary.id);

    expect(saved).toMatchObject({
      status: "草稿",
      wordCount: 3,
      revision: chapter.revision + 1,
      batchMode: "逐章",
      updatedAt: savedAt,
    });
    expect(afterSave.summary.updatedAt).toBe(savedAt);

    const transitionedAt = "2026-08-02T02:00:00.000Z";
    vi.setSystemTime(transitionedAt);
    const transitioned = await api.transitionChapter(summary.id, chapter.id, "待质检");
    const afterTransition = await api.getProject(summary.id);

    expect(transitioned.chapter).toMatchObject({
      status: "待质检",
      revision: saved.revision + 1,
      updatedAt: transitionedAt,
    });
    expect(afterTransition.summary.updatedAt).toBe(transitionedAt);

    await api.transitionChapter(summary.id, chapter.id, "待定稿");
    const finalizedAt = "2026-08-02T03:00:00.000Z";
    vi.setSystemTime(finalizedAt);
    await api.transitionChapter(summary.id, chapter.id, "已定稿");
    const finalized = await api.getProject(summary.id);

    expect(finalized.summaries.map((item) => item.layer)).toEqual(
      expect.arrayContaining(["场景", "章节", "十章阶段", "分卷", "全书"]),
    );
    expect(finalized.summaries.find((item) => item.layer === "章节")).toMatchObject({
      id: `chapter:${chapter.id}`,
      version: 1,
      updatedAt: finalizedAt,
    });
  });
});
