import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserApi } from "../src/lib/browser-api";
import { seed } from "../src/lib/browser-demo";
import type { ImportPreview } from "../src/shared/types";

const preview = {
  fileName: "sample.txt",
  sourceType: "TXT",
  detectedEncoding: "UTF-8",
  chapters: [],
  totalWords: 0,
  warnings: [],
} satisfies ImportPreview;

beforeEach(() => {
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
  vi.unstubAllGlobals();
});

describe("browser research import workflow", () => {
  it("rejects private material until usage rights are confirmed", async () => {
    const api = createBrowserApi();
    const booksBefore = await api.listResearchBooks();

    await expect(api.importResearchBook(preview, "都市脑洞", false, false)).rejects.toThrow(
      "必须确认拥有材料的合法使用权",
    );

    expect(await api.listResearchBooks()).toEqual(booksBefore);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it("keeps local usage rights independent from cloud consent", async () => {
    const api = createBrowserApi();

    const imported = await api.importResearchBook(preview, "都市脑洞", true, false);

    expect(imported).toMatchObject({
      title: "sample",
      rightsConfirmed: true,
      cloudConsent: false,
      status: "待拆解",
    });
    expect(await api.listResearchBooks()).toContainEqual(imported);
    expect(localStorage.setItem).toHaveBeenCalledOnce();
  });

  it("loads older browser previews and carries saved selection metadata into a sample", async () => {
    vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify({ ...seed(), researchSelections: undefined }));
    const api = createBrowserApi();
    expect(await api.listResearchSelections()).toEqual([]);
    const selection = await api.saveResearchSelection({
      id: "browser-pick",
      platformId: "example",
      title: "借来的信封",
      author: "示例作者",
      url: "https://example.com/story/21",
      note: "关注物证出现的时机",
      tags: ["轻悬疑"],
      kind: "短篇",
      status: "已阅读",
      createdAt: "2026-11-18T08:00:00.000Z",
      updatedAt: "2026-11-18T08:00:00.000Z",
    });
    const savedState = vi.mocked(localStorage.setItem).mock.lastCall?.[1] ?? null;
    vi.mocked(localStorage.getItem).mockReturnValue(savedState);
    const reopened = createBrowserApi();
    expect(await reopened.listResearchSelections()).toEqual([selection]);
    const imported = await reopened.importResearchBook(
      {
        ...preview,
        reference: { title: selection.title, author: selection.author, url: selection.url, platform: "示例平台" },
      },
      "都市脑洞",
      true,
      false,
    );
    expect(imported).toMatchObject({
      title: selection.title,
      author: selection.author,
      sourceUrl: selection.url,
      sourcePlatform: "示例平台",
    });
  });

  it("edits a browser insight without changing its evidence metadata", async () => {
    const api = createBrowserApi();
    const original = (await api.listInsights())[0];
    const edits = {
      name: "人工校正后的标题",
      genre: original.genre,
      audienceNeed: "作者确认的读者需求",
      openingPromise: original.openingPromise,
      conflictEngine: original.conflictEngine,
      emotionalRhythm: original.emotionalRhythm,
      retentionDevices: original.retentionDevices,
      longFormEngine: original.longFormEngine,
      marketGap: original.marketGap,
      risks: original.risks,
      confidence: "高" as const,
    };

    const updated = await api.updateInsight(original.id, edits);

    expect(updated).toEqual({ ...original, ...edits });
    expect(localStorage.setItem).toHaveBeenCalledOnce();
    vi.mocked(localStorage.getItem).mockReturnValue(vi.mocked(localStorage.setItem).mock.lastCall?.[1] ?? null);
    expect(await createBrowserApi().listInsights()).toContainEqual(updated);
  });
});
