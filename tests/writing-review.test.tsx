// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserApi } from "../src/lib/browser-api";
import { WritingPage } from "../src/pages/WritingWorkspace";
import type { Chapter, ChapterQualityCheck, QualityIssue } from "../src/shared/types";

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(() => null),
    length: 0,
  });
});

afterEach(() => cleanup());

const text = "雨落在旧城的玻璃窗上，林舟把红伞线索写进了笔记。";

const checked = (status: ChapterQualityCheck["status"] = "已通过", issueIds: string[] = []): ChapterQualityCheck => ({
  runId: "check-1",
  status,
  chapterFingerprint: "chapter-snapshot",
  inputFingerprint: "input-snapshot",
  checkedAt: "2026-11-19T00:00:00.000Z",
  issueIds,
  observations: [],
  reason: status === "未完成检查" ? "审稿请求已取消，草稿已保留" : null,
});

async function mountWritingPage(
  overrides: Partial<AppApiLike> = {},
  options: { check?: ChapterQualityCheck; issues?: QualityIssue[]; reload?: () => Promise<void>; batch?: boolean } = {},
) {
  const baseApi = createBrowserApi();
  const project = await baseApi.getProject("demo-project");
  const target = project.chapters[0];
  target.status = "草稿";
  if (options.batch) target.batchMode = "五章批次";
  const generated: Chapter = { ...target, content: text.repeat(12), qualityCheck: options.check ?? checked() };
  const generatedIssues = options.issues ?? [];
  const api = {
    ...baseApi,
    getChapter: vi.fn(async (_id: string, chapterId: string) => project.chapters.find((item) => item.id === chapterId)),
    getProject: vi.fn(async () => ({ ...project, issues: generatedIssues })),
    generateChapterDraft: vi.fn(async () => generated),
    runQualityCheck: vi.fn(async () => ({ issues: [], observations: [], check: checked() })),
    transitionChapter: vi.fn(async (_id: string, _chapterId: string, status: string) => ({
      chapter: { ...generated, status },
      ledgerExtraction: { status: "不适用", candidateCount: 0 },
    })),
    saveChapter: vi.fn(async (_id: string, chapter: Chapter) => chapter),
    ...overrides,
  } as AppApiLike;
  const notify = vi.fn();
  const reload = options.reload ?? vi.fn(async () => {});
  const view = render(<WritingPage project={project} api={api as never} reload={reload} notify={notify} />);
  return { api, project, target, notify, ...view };
}

type AppApiLike = ReturnType<typeof createBrowserApi> & Record<string, unknown>;

const manuscriptParagraph = "她深吸一口气，推开铁门。";
const manuscriptReplacement = "她把钥匙攥进掌心，用肩顶开铁门。";

async function mountStyleReview(content: string) {
  const baseApi = createBrowserApi();
  const projectId = "demo-project";
  const initial = await baseApi.getProject(projectId);
  const chapter = await baseApi.saveChapter(projectId, { ...initial.chapters[1], status: "草稿", content });
  const project = await baseApi.getProject(projectId);
  const api = {
    ...baseApi,
    analyzeNovelRevision: vi.fn(baseApi.analyzeNovelRevision),
    applyNovelRevision: vi.fn(baseApi.applyNovelRevision),
    transitionChapter: vi.fn(baseApi.transitionChapter),
  };
  const notify = vi.fn();
  render(<WritingPage project={project} api={api} reload={vi.fn(async () => {})} notify={notify} />);
  const manuscript = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "章节正文" });
  await waitFor(() => expect(manuscript.disabled).toBe(false));
  await userEvent.click(screen.getByRole("button", { name: /回声的代价/ }));
  await waitFor(() => expect(manuscript.disabled).toBe(false));
  return { api, chapter, manuscript, notify };
}

describe("写作页文风检查", () => {
  it("定位未保存的正文并通过已有修订流程人工应用选区候选", async () => {
    const unchanged = "门缝漏出一道白光。\n\n";
    const { api, chapter, manuscript } = await mountStyleReview(unchanged);
    fireEvent.change(manuscript, { target: { value: unchanged + manuscriptParagraph } });

    await userEvent.click(screen.getByRole("button", { name: "文风检查" }));
    const panel = within(screen.getByRole("region", { name: "文风检查结果" }));
    expect(panel.getByText(manuscriptParagraph)).toBeTruthy();
    expect(panel.getByText(/套话动作/)).toBeTruthy();
    await userEvent.click(panel.getByRole("button", { name: "定位正文" }));
    expect(document.activeElement).toBe(manuscript);
    expect(manuscript.value.slice(manuscript.selectionStart, manuscript.selectionEnd)).toBe(manuscriptParagraph);
    expect(api.analyzeNovelRevision).not.toHaveBeenCalled();

    await userEvent.click(panel.getByRole("button", { name: "拟修订" }));
    const dialog = within(screen.getByRole("dialog", { name: "AI 修改意见" }));
    expect(dialog.getByText("仅选区")).toBeTruthy();
    const instruction = dialog.getByRole("textbox", { name: /修改意见/ });
    await userEvent.clear(instruction);
    fireEvent.change(instruction, { target: { value: `改为：${manuscriptReplacement}` } });
    await userEvent.click(dialog.getByRole("button", { name: "分析修改意见" }));

    const comparison = (await dialog.findByText("修改前")).closest("details");
    expect(comparison?.open).toBe(true);
    expect(dialog.getByText(manuscriptParagraph)).toBeTruthy();
    expect(dialog.getByText(manuscriptReplacement)).toBeTruthy();
    expect(api.analyzeNovelRevision).toHaveBeenCalledWith(
      "demo-project",
      expect.objectContaining({
        chapterId: chapter.id,
        scope: "仅选区",
        authority: "设定为准",
        selectionStart: unchanged.length,
        selectionEnd: unchanged.length + manuscriptParagraph.length,
        selectedText: manuscriptParagraph,
      }),
    );
    expect(api.applyNovelRevision).not.toHaveBeenCalled();
    expect(manuscript.value).toBe(unchanged + manuscriptParagraph);

    await userEvent.click(dialog.getByRole("button", { name: "应用所选 1 项" }));
    await waitFor(() => expect(manuscript.value).toBe(unchanged + manuscriptReplacement));
    const applied = await api.getChapter("demo-project", chapter.id);
    expect(applied.content).toBe(unchanged + manuscriptReplacement);
    expect(applied.status).toBe("草稿");
    expect(api.transitionChapter).not.toHaveBeenCalled();
  });

  it("正文偏移变化后需要重新检查，Windows 换行定位对应正文选区", async () => {
    const opening = "灯灭了。\r\n\r\n　";
    const { manuscript, api } = await mountStyleReview(opening + manuscriptParagraph);
    await userEvent.click(screen.getByRole("button", { name: "文风检查" }));
    const panel = within(screen.getByRole("region", { name: "文风检查结果" }));
    await userEvent.click(panel.getByRole("button", { name: "定位正文" }));
    expect(manuscript.value.slice(manuscript.selectionStart, manuscript.selectionEnd)).toBe(manuscriptParagraph);

    await userEvent.click(screen.getByRole("button", { name: "修改意见" }));
    const dialog = within(screen.getByRole("dialog", { name: "AI 修改意见" }));
    expect(dialog.getByText(manuscriptParagraph)).toBeTruthy();
    await userEvent.click(dialog.getByRole("button", { name: "取消" }));

    fireEvent.change(manuscript, { target: { value: `窗框轻响。\n${manuscript.value}` } });
    expect(panel.queryByRole("button", { name: "拟修订" })).toBeNull();
    await userEvent.click(panel.getByRole("button", { name: "重新检查" }));
    await userEvent.click(panel.getByRole("button", { name: "定位正文" }));
    expect(manuscript.value.slice(manuscript.selectionStart, manuscript.selectionEnd)).toBe(manuscriptParagraph);
    expect(api.analyzeNovelRevision).not.toHaveBeenCalled();
  });

  it("分析后正文章节继续变化时，避免将旧候选套到新稿", async () => {
    const { manuscript, api, notify } = await mountStyleReview(manuscriptParagraph);
    await userEvent.click(screen.getByRole("button", { name: "文风检查" }));
    await userEvent.click(screen.getByRole("button", { name: "拟修订" }));
    const dialog = within(screen.getByRole("dialog", { name: "AI 修改意见" }));
    fireEvent.change(dialog.getByRole("textbox", { name: /修改意见/ }), {
      target: { value: `改为：${manuscriptReplacement}` },
    });
    await userEvent.click(dialog.getByRole("button", { name: "分析修改意见" }));

    const apply = await dialog.findByRole("button", { name: "应用所选 1 项" });
    const changed = `${manuscriptParagraph}\n楼梯上有人走动。`;
    fireEvent.change(manuscript, { target: { value: changed } });
    await userEvent.click(apply);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("正文已更新"), "error");
    expect(api.applyNovelRevision).not.toHaveBeenCalled();
    expect(manuscript.value).toBe(changed);
  });
});

describe("AI generated draft review (director mode)", () => {
  it("opens the review panel and accepts into 待定稿 when clean", async () => {
    const { api, target, notify, unmount } = await mountWritingPage();
    try {
      await userEvent.click(await screen.findByRole("button", { name: "AI 生成草稿" }));
      await screen.findByRole("dialog", { name: /审阅 AI 产出/ });
      await waitFor(() => expect(document.body.textContent ?? "").toContain("未发现硬性问题"));
      const accept = screen.getByRole("button", { name: "采纳并进入待定稿" }) as HTMLButtonElement;
      expect(accept.disabled).toBe(false);
      await userEvent.click(accept);
      await waitFor(() =>
        expect(api.transitionChapter as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
          "demo-project",
          target.id,
          "待定稿",
        ),
      );
      expect(notify).toHaveBeenCalledWith("已采纳 AI 产出并进入待定稿");
    } finally {
      unmount();
    }
  });

  it("reverts to the previous content when the author rejects the draft", async () => {
    const { api, target, unmount } = await mountWritingPage();
    try {
      await userEvent.click(await screen.findByRole("button", { name: "AI 生成草稿" }));
      await screen.findByRole("dialog", { name: /审阅 AI 产出/ });
      await waitFor(() => expect(document.body.textContent ?? "").toContain("未发现硬性问题"));
      await userEvent.click(screen.getByRole("button", { name: "打回重写" }));
      await waitFor(() => expect(api.saveChapter).toHaveBeenCalled());
      const restored = (api.saveChapter as ReturnType<typeof vi.fn>).mock.calls[0][1] as Chapter;
      expect(restored.content).toBe(target.content);
    } finally {
      unmount();
    }
  });

  it("blocks acceptance when a hard issue exists", async () => {
    const hardIssue: QualityIssue = {
      id: "issue-1",
      projectId: "demo-project",
      chapterId: "demo-chapter-1",
      severity: "硬性",
      category: "设定冲突",
      message: "主角能力与契约不符",
      evidence: "第3段",
      status: "待处理",
      createdAt: "2026-09-03T00:00:00.000Z",
    };
    const { api, unmount } = await mountWritingPage(
      {},
      { check: checked("有冲突", [hardIssue.id]), issues: [hardIssue] },
    );
    try {
      await userEvent.click(await screen.findByRole("button", { name: "AI 生成草稿" }));
      await screen.findByRole("dialog", { name: /审阅 AI 产出/ });
      await waitFor(() => expect(document.body.textContent ?? "").toContain("存在硬性问题"));
      expect(screen.queryByRole("button", { name: "采纳并进入待定稿" })).toBeNull();
      expect(screen.getByRole("button", { name: "去质检中心处理问题" })).toBeTruthy();
      await userEvent.click(screen.getByRole("button", { name: "去质检中心处理问题" }));
      await waitFor(() => expect(screen.queryByRole("dialog", { name: /审阅 AI 产出/ })).toBeNull());
      expect(api.transitionChapter).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });
});

describe("保存后连续性检查结果", () => {
  it("生成只展示主进程已有检查，不会再次发起收费质检", async () => {
    const { api } = await mountWritingPage();
    await userEvent.click(await screen.findByRole("button", { name: "AI 生成草稿" }));
    const dialog = within(await screen.findByRole("dialog", { name: /审阅 AI 产出/ }));
    await dialog.findByText(/连续性检查：已通过/);
    expect(api.runQualityCheck).not.toHaveBeenCalled();
    expect(dialog.getByRole<HTMLTextAreaElement>("textbox", { name: /AI 生成正文/ }).value).toBe(text.repeat(12));
  });

  it("检查取消仍保留草稿并禁止按空问题列表采纳", async () => {
    await mountWritingPage({}, { check: checked("未完成检查") });
    await userEvent.click(await screen.findByRole("button", { name: "AI 生成草稿" }));
    const dialog = within(await screen.findByRole("dialog", { name: /审阅 AI 产出/ }));
    await dialog.findByText(/连续性检查：未完成检查/);
    expect(dialog.queryByText(/未发现硬性问题/)).toBeNull();
    expect(dialog.queryByRole("button", { name: "采纳并进入待定稿" })).toBeNull();
    expect(dialog.getByText(/审稿请求已取消/)).toBeTruthy();
    expect(dialog.getByRole<HTMLTextAreaElement>("textbox", { name: /AI 生成正文/ }).value).toBe(text.repeat(12));
  });

  it("刷新失败时不会把已保存的新稿恢复成生成前正文", async () => {
    const { notify } = await mountWritingPage(
      {},
      {
        reload: vi.fn(async () => {
          throw new Error("刷新失败");
        }),
      },
    );
    await userEvent.click(await screen.findByRole("button", { name: "AI 生成草稿" }));
    await waitFor(() =>
      expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "章节正文" }).value).toBe(text.repeat(12)),
    );
    expect(await screen.findByRole("dialog", { name: /审阅 AI 产出/ })).toBeTruthy();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("草稿已保留"), "error");
  });

  it("人工检查未完成不转待定稿，修改本地正文后提示重新检查", async () => {
    const incomplete = checked("未完成检查");
    const { api } = await mountWritingPage({
      runQualityCheck: vi.fn(async () => ({ issues: [], observations: [], check: incomplete })),
    });
    await userEvent.click(await screen.findByRole("button", { name: "运行质检" }));
    await screen.findByText(/连续性检查：未完成检查/);
    expect(api.transitionChapter).not.toHaveBeenCalled();
    expect(screen.queryByText(/质检完成，未发现问题/)).toBeNull();
    const manuscript = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "章节正文" });
    fireEvent.change(manuscript, { target: { value: "人物走到了车站。" } });
    await screen.findByText(/稿件已修改.*重新.*质检/);
  });

  it("人工完整检查只请求一次，警告与观察不阻止原有待定稿流程", async () => {
    const warning: QualityIssue = {
      id: "repeat-warning",
      projectId: "demo-project",
      chapterId: "demo-chapter-1",
      severity: "警告",
      category: "重复说理",
      message: "同一原则解释重复，可自行斟酌删减",
      evidence: "材料所有人共同确认",
      status: "待处理",
      createdAt: "2026-11-19T00:00:00.000Z",
    };
    const { api } = await mountWritingPage({
      runQualityCheck: vi.fn(async () => ({ issues: [warning], observations: ["长度只作观察"], check: checked() })),
    });
    await userEvent.click(await screen.findByRole("button", { name: "运行质检" }));
    await waitFor(() => expect(api.transitionChapter).toHaveBeenCalledWith("demo-project", "demo-chapter-1", "待定稿"));
    expect(api.runQualityCheck).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("region", { name: "连续性检查" }).textContent).toContain("已通过");
  });

  it("已通过的稿件在本地继续编辑后立即显示需重查", async () => {
    await mountWritingPage();
    await userEvent.click(await screen.findByRole("button", { name: "AI 生成草稿" }));
    const dialog = within(await screen.findByRole("dialog", { name: /审阅 AI 产出/ }));
    await userEvent.click(dialog.getByRole("button", { name: "关闭" }));
    const panel = within(screen.getByRole("region", { name: "连续性检查" }));
    expect(panel.getByText(/连续性检查：已通过/)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "章节正文" }), { target: { value: "我换了人物姓名。" } });
    expect(await panel.findByText(/连续性检查：未完成检查/)).toBeTruthy();
    expect(panel.queryByText(/连续性检查：已通过/)).toBeNull();
  });

  it("人工检查请求失败不能继续展示上一次通过", async () => {
    await mountWritingPage({
      runQualityCheck: vi.fn(async () => {
        throw new Error("检查连接中断");
      }),
    });
    await userEvent.click(await screen.findByRole("button", { name: "AI 生成草稿" }));
    const dialog = within(await screen.findByRole("dialog", { name: /审阅 AI 产出/ }));
    await userEvent.click(dialog.getByRole("button", { name: "关闭" }));
    await userEvent.click(screen.getByRole("button", { name: "运行质检" }));
    const panel = within(screen.getByRole("region", { name: "连续性检查" }));
    expect(await panel.findByText(/连续性检查：未完成检查/)).toBeTruthy();
    expect(panel.getByText(/检查连接中断/)).toBeTruthy();
  });

  it("载入检查问题失败时保留草稿并关闭采纳入口", async () => {
    await mountWritingPage({
      getProject: vi.fn(async () => {
        throw new Error("读取问题失败");
      }),
    });
    await userEvent.click(await screen.findByRole("button", { name: "AI 生成草稿" }));
    const dialog = within(await screen.findByRole("dialog", { name: /审阅 AI 产出/ }));
    await dialog.findByText(/检查结果未能完整载入/);
    expect(dialog.queryByRole("button", { name: "采纳并进入待定稿" })).toBeNull();
    expect(dialog.getByRole<HTMLTextAreaElement>("textbox", { name: /AI 生成正文/ }).value).toBe(text.repeat(12));
  });

  it.each(["已解决", "已忽略"] as const)("完整报告的问题已%s时无需再次审稿即可采纳", async (status) => {
    const issue: QualityIssue = {
      id: "handled-conflict",
      projectId: "demo-project",
      chapterId: "demo-chapter-1",
      severity: "硬性",
      category: "事实冲突",
      message: "作者已经处理此冲突",
      evidence: "本章原句",
      status,
      createdAt: "2026-11-19T00:00:00.000Z",
    };
    const { api } = await mountWritingPage({}, { check: checked("有冲突", [issue.id]), issues: [issue] });
    await userEvent.click(await screen.findByRole("button", { name: "AI 生成草稿" }));
    const dialog = within(await screen.findByRole("dialog", { name: /审阅 AI 产出/ }));
    await userEvent.click(await dialog.findByRole("button", { name: "采纳并进入待定稿" }));
    await waitFor(() => expect(api.transitionChapter).toHaveBeenCalledWith("demo-project", "demo-chapter-1", "待定稿"));
    expect(api.runQualityCheck).not.toHaveBeenCalled();
  });

  it("当前问题状态刷新后解除旧审阅快照的硬问题阻挡", async () => {
    const issue: QualityIssue = {
      id: "pending-conflict",
      projectId: "demo-project",
      chapterId: "demo-chapter-1",
      severity: "硬性",
      category: "事实冲突",
      message: "等待作者处理",
      evidence: "本章原句",
      status: "待处理",
      createdAt: "2026-11-19T00:00:00.000Z",
    };
    const { api, project, rerender } = await mountWritingPage(
      {},
      { check: checked("有冲突", [issue.id]), issues: [issue] },
    );
    await userEvent.click(await screen.findByRole("button", { name: "AI 生成草稿" }));
    const dialog = within(await screen.findByRole("dialog", { name: /审阅 AI 产出/ }));
    await dialog.findByText("存在硬性问题");
    rerender(
      <WritingPage
        project={{ ...project, issues: [{ ...issue, status: "已解决" }] }}
        api={api as never}
        reload={vi.fn(async () => {})}
        notify={vi.fn()}
      />,
    );
    await userEvent.click(await dialog.findByRole("button", { name: "采纳并进入待定稿" }));
    await waitFor(() => expect(api.transitionChapter).toHaveBeenCalledTimes(1));
    expect(api.runQualityCheck).not.toHaveBeenCalled();
  });

  it("离开审阅处理问题后可从本章人工采纳，不强制再次检查", async () => {
    const issue: QualityIssue = {
      id: "resolved-in-center",
      projectId: "demo-project",
      chapterId: "demo-chapter-1",
      severity: "硬性",
      category: "事实冲突",
      message: "等待作者确认",
      evidence: "本章原句",
      status: "待处理",
      createdAt: "2026-11-19T00:00:00.000Z",
    };
    const { api, project, rerender } = await mountWritingPage(
      {},
      { check: checked("有冲突", [issue.id]), issues: [issue] },
    );
    await userEvent.click(await screen.findByRole("button", { name: "AI 生成草稿" }));
    const dialog = within(await screen.findByRole("dialog", { name: /审阅 AI 产出/ }));
    await userEvent.click(await dialog.findByRole("button", { name: "去质检中心处理问题" }));
    const refreshed = {
      ...project,
      issues: [{ ...issue, status: "已解决" as const }],
      chapters: project.chapters.map((chapter) =>
        chapter.id === issue.chapterId ? { ...chapter, qualityCheck: checked("有冲突", [issue.id]) } : chapter,
      ),
    };
    rerender(<WritingPage project={refreshed} api={api as never} reload={vi.fn(async () => {})} notify={vi.fn()} />);
    const panel = within(screen.getByRole("region", { name: "连续性检查" }));
    await userEvent.click(await panel.findByRole("button", { name: "采纳并进入待定稿" }));
    await waitFor(() => expect(api.transitionChapter).toHaveBeenCalledTimes(1));
    expect(api.runQualityCheck).not.toHaveBeenCalled();
  });

  it("展示前文和本章两侧证据及前文章号", async () => {
    const issue: QualityIssue = {
      id: "conflict-sleeve",
      projectId: "demo-project",
      chapterId: "demo-chapter-1",
      severity: "硬性",
      category: "事实冲突",
      message: "同一封条的状态前后矛盾",
      evidence: "柜上的封条一直完好",
      status: "待处理",
      createdAt: "2026-11-19T00:00:00.000Z",
      continuityEvidence: {
        sourceId: "chapter:prior-id:tail",
        previousQuote: "我已剪断柜上的封条",
        currentQuote: "柜上的封条一直完好",
        conflictKind: "动作",
      },
    };
    const { project, rerender, api } = await mountWritingPage(
      {},
      { check: checked("有冲突", [issue.id]), issues: [issue] },
    );
    project.chapters.push({ ...project.chapters[1], id: "prior-id", number: 4 });
    rerender(<WritingPage project={project} api={api as never} reload={vi.fn(async () => {})} notify={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "AI 生成草稿" }));
    const dialog = within(await screen.findByRole("dialog", { name: /审阅 AI 产出/ }));
    await dialog.findByText(/前文依据.*第4章/);
    expect(dialog.getByText("我已剪断柜上的封条")).toBeTruthy();
    expect(dialog.getByText("柜上的封条一直完好")).toBeTruthy();
  });

  it("批次暂停展示已保存的部分草稿且不再次自动审稿", async () => {
    const chapter = (await createBrowserApi().getProject("demo-project")).chapters[0];
    const partial = { ...chapter, content: "已保留的批次草稿。", qualityCheck: checked("未完成检查") };
    const { api } = await mountWritingPage(
      {
        previewChapterBatch: vi.fn(async () => ({
          chapters: [{ id: chapter.id, number: 1, title: chapter.title }],
          inputTokens: 10,
          outputTokens: 10,
          estimatedCost: null,
          reviewCalls: 1,
          reviewInputTokens: 10,
          reviewOutputTokens: 10,
          costEstimateComplete: false,
          canRun: true,
          blockingReason: null,
        })),
        generateChapterBatch: vi.fn(async () => ({
          chapters: [partial],
          status: "paused",
          stoppedAtChapter: 1,
          reason: "已保留1章草稿；第1章检查未完成，后续尚未生成",
        })),
      },
      { batch: true },
    );
    await waitFor(() => expect(screen.getAllByRole("button", { name: "五章批次" }).length).toBe(2));
    await userEvent.click(screen.getAllByRole("button", { name: "五章批次" })[1]);
    await userEvent.click(await screen.findByRole("button", { name: "确认生成" }));
    const dialog = within(await screen.findByRole("dialog", { name: "审阅五章批次产出" }));
    expect(await dialog.findByText(/已保留1章草稿/)).toBeTruthy();
    expect(dialog.getByText("已保留的批次草稿。")).toBeTruthy();
    expect(api.runQualityCheck).not.toHaveBeenCalled();
    expect(dialog.queryByRole("button", { name: "采纳" })).toBeNull();
  });
});

describe("new chapter without a saved record", () => {
  it("生成前自动落库，不再要求先点建立版本", async () => {
    const saveChapter = vi.fn(async (_id: string, chapter: Chapter) => ({
      ...chapter,
      id: chapter.id || "chapter-new",
    }));
    const { api, unmount } = await mountWritingPage({ saveChapter });
    try {
      await userEvent.click(screen.getByRole("button", { name: "新建章节（Alt+N）" }));
      const generate = await screen.findByRole("button", { name: "AI 生成草稿" });
      expect((generate as HTMLButtonElement).disabled).toBe(false);
      await userEvent.click(generate);
      await waitFor(() => expect(saveChapter).toHaveBeenCalled());
      expect(saveChapter.mock.calls[0][1].id).toBe("");
      await waitFor(() =>
        expect((api.generateChapterDraft as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe("chapter-new"),
      );
    } finally {
      unmount();
    }
  });
});
