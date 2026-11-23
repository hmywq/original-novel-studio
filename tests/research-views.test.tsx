// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchBooksView } from "../src/pages/ResearchBooksView";
import { ResearchInsightsView } from "../src/pages/ResearchInsightsView";
import { ResearchKnowledgeView } from "../src/pages/ResearchKnowledgeView";
import { RankingImportModal } from "../src/pages/ResearchRankingModals";
import { ResearchRankingView } from "../src/pages/ResearchRankingView";
import { PasteSampleModal } from "../src/pages/ResearchSampleModals";
import type { InsightPack, InsightPackEdits, ResearchBook } from "../src/shared/types";

afterEach(cleanup);

const book: ResearchBook = {
  id: "book-1",
  title: "公开样本",
  author: "作者",
  genre: "都市脑洞",
  sourceType: "公开试读",
  sampleScope: "官方公开前10章",
  chapterCount: 10,
  wordCount: 20_000,
  rightsConfirmed: false,
  cloudConsent: true,
  importedAt: "2026-07-31T00:00:00.000Z",
  status: "已拆解",
};

const insight: InsightPack = {
  id: "insight-1",
  name: "关系代价",
  genre: "都市脑洞",
  audienceNeed: "持续兑现能力代价",
  openingPromise: "开篇明确规则",
  conflictEngine: "救人与遗忘互相拉扯",
  emotionalRhythm: "递进",
  retentionDevices: "关系悬念",
  longFormEngine: "规则和组织逐层扩张",
  marketGap: "现实关系反馈",
  risks: "避免重复",
  evidenceCount: 10,
  confidence: "中",
  createdAt: "2026-07-31T00:00:00.000Z",
};

describe("research tab views", () => {
  it("routes the empty ranking action through its semantic callback", async () => {
    const onOpenPublicRanking = vi.fn();
    render(<ResearchRankingView analytics={null} rankings={[]} onOpenPublicRanking={onOpenPublicRanking} />);

    await userEvent.click(screen.getByRole("button", { name: "同步榜单源" }));
    expect(onOpenPublicRanking).toHaveBeenCalledOnce();
  });

  it("routes book analysis and deconstruction without owning workflow state", async () => {
    const onOpenAnalysis = vi.fn(async () => {});
    const onRequestDeconstruct = vi.fn(async () => {});
    render(
      <ResearchBooksView
        books={[book]}
        busyBookId={null}
        onChooseFile={vi.fn(async () => {})}
        onOpenAnalysis={onOpenAnalysis}
        onRequestDeconstruct={onRequestDeconstruct}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "查看分层" }));
    await userEvent.click(screen.getByRole("button", { name: "重新拆解" }));
    expect(onOpenAnalysis).toHaveBeenCalledWith(book);
    expect(onRequestDeconstruct).toHaveBeenCalledWith(book);
  });

  it("renders insight and commercial knowledge tabs independently", () => {
    const { rerender } = render(<ResearchInsightsView insights={[insight]} />);
    expect(screen.getByText("关系代价")).toBeTruthy();

    rerender(<ResearchKnowledgeView />);
    expect(screen.getByText("中国网文商业拆解")).toBeTruthy();
  });

  it("opens the human correction form and saves only editable insight fields", async () => {
    const onSave = vi.fn(async (_id: string, _edits: InsightPackEdits) => {});
    render(<ResearchInsightsView insights={[insight]} onSave={onSave} />);

    await userEvent.click(screen.getByRole("button", { name: "人工校正" }));
    const dialog = screen.getByRole("dialog", { name: "人工校正洞察" });
    for (const label of [
      "洞察名称",
      "题材",
      "可信度",
      "读者需求",
      "开篇承诺",
      "冲突发动机",
      "情绪节奏",
      "追读装置",
      "长篇发动机",
      "市场空位",
      "风险说明",
    ]) {
      expect(within(dialog).getByLabelText(label)).toBeTruthy();
    }
    expect(within(dialog).queryByLabelText("章节证据数")).toBeNull();
    expect(within(dialog).queryByLabelText("创建时间")).toBeNull();

    await userEvent.clear(within(dialog).getByLabelText("洞察名称"));
    await userEvent.type(within(dialog).getByLabelText("洞察名称"), "关系代价与信任");
    await userEvent.clear(within(dialog).getByLabelText("冲突发动机"));
    await userEvent.type(within(dialog).getByLabelText("冲突发动机"), "每次救人都会失去一段共同记忆");
    await userEvent.selectOptions(within(dialog).getByLabelText("可信度"), "高");
    await userEvent.click(within(dialog).getByRole("button", { name: "保存校正" }));

    expect(onSave).toHaveBeenCalledWith(
      insight.id,
      expect.objectContaining({
        name: "关系代价与信任",
        genre: insight.genre,
        confidence: "高",
        conflictEngine: "每次救人都会失去一段共同记忆",
      }),
    );
    const edits = onSave.mock.calls[0][1];
    expect(edits).not.toHaveProperty("evidenceCount");
    expect(edits).not.toHaveProperty("createdAt");
    expect(screen.queryByRole("dialog", { name: "人工校正洞察" })).toBeNull();
  });

  it("keeps edited values visible when saving a corrected insight fails", async () => {
    const onSave = vi.fn(async () => {
      throw new Error("保存失败，请重试");
    });
    render(<ResearchInsightsView insights={[insight]} onSave={onSave} />);

    await userEvent.click(screen.getByRole("button", { name: "人工校正" }));
    const dialog = screen.getByRole("dialog", { name: "人工校正洞察" });
    const nameInput = within(dialog).getByLabelText("洞察名称");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "作者修订后的洞察");
    await userEvent.click(within(dialog).getByRole("button", { name: "保存校正" }));

    expect(await within(dialog).findByText("保存失败，请重试")).toBeTruthy();
    expect((nameInput as HTMLInputElement).value).toBe("作者修订后的洞察");
    expect(screen.getByRole("dialog", { name: "人工校正洞察" })).toBeTruthy();
  });
});

describe("research workflow modals", () => {
  it("keeps the CSV import action behind a non-empty payload", async () => {
    const onSave = vi.fn();
    const { rerender } = render(
      <RankingImportModal
        open
        rankingName="番茄男频阅读榜·都市脑洞"
        rankingCsv=""
        onRankingNameChange={vi.fn()}
        onRankingCsvChange={vi.fn()}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    expect((screen.getByRole("button", { name: "保存快照" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(
      <RankingImportModal
        open
        rankingName="番茄男频阅读榜·都市脑洞"
        rankingCsv="排名,书名\n1,样本书"
        onRankingNameChange={vi.fn()}
        onRankingCsvChange={vi.fn()}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "保存快照" }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("builds the same chapter preview from pasted text", async () => {
    const onPreview = vi.fn();
    render(
      <PasteSampleModal
        open
        text={"第一章 开端\n这是第一章的正文内容。\n第二章 转折\n这是第二章的正文内容。"}
        onTextChange={vi.fn()}
        onClose={vi.fn()}
        onPreview={onPreview}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "预览切章" }));
    expect(onPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "粘贴样本",
        sourceType: "粘贴",
        warnings: [],
        chapters: [
          expect.objectContaining({ title: "第一章 开端" }),
          expect.objectContaining({ title: "第二章 转折" }),
        ],
      }),
    );
  });
});
