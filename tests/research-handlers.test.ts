import { randomUUID } from "node:crypto";
import { linkSync, mkdirSync, mkdtempSync, rmdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceDatabase } from "../electron/database";
import { type ResearchHandlerDependencies, registerResearchHandlers } from "../electron/handlers/research-handlers";
import type { RegisterHandler } from "../electron/handlers/types";
import { validateIpcArgs } from "../electron/ipc-validation";
import { capturePublicRankingPage } from "../electron/ranking-service";
import type { AppApi, ImportPreview, RankingCaptureSchedule, RankingSnapshot } from "../src/shared/types";

vi.mock("../electron/ranking-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../electron/ranking-service")>()),
  capturePublicRankingPage: vi.fn(),
}));

function createDependencies() {
  // biome-ignore lint/suspicious/noExplicitAny: 测试桩回调参数宽松
  const handlers = new Map<string, (...args: any[]) => unknown>();
  const register: RegisterHandler = (channel, callback) => {
    handlers.set(channel, callback);
  };
  const workerRun = vi.fn(
    async () =>
      ({
        fileName: "sample.txt",
        sourceType: "TXT",
        detectedEncoding: "UTF-8",
        chapters: [],
        totalWords: 0,
        warnings: [],
      }) satisfies ImportPreview,
  );
  const database = {
    deleteRankingSchedule: vi.fn(),
    getResearchBook: vi.fn(),
    listInsights: vi.fn(() => []),
    listRankingSchedules: vi.fn(() => []),
    listRankings: vi.fn(() => []),
    listResearchAnalyses: vi.fn(() => []),
    listResearchBooks: vi.fn(() => []),
    listResearchSelections: vi.fn(() => []),
    saveInsight: vi.fn(),
    saveRanking: vi.fn(),
    saveRankingSchedule: vi.fn((schedule) => schedule),
    saveResearchAnalyses: vi.fn(),
    saveResearchBook: vi.fn(),
    saveResearchSelection: vi.fn((selection) => selection),
    updateResearchBook: vi.fn(),
  };
  const dependencies = {
    register,
    database,
    ai: { deconstruct: vi.fn() },
    worker: { run: workerRun },
    chooseResearchFile: vi.fn(async () => "C:/samples/sample.txt"),
  } as unknown as ResearchHandlerDependencies;
  return { dependencies, handlers, workerRun, database };
}

describe("research handlers", () => {
  it("parses quoted CSV fields, Chinese word units, tags, and source links", () => {
    const { dependencies, handlers, database } = createDependencies();
    registerResearchHandlers(dependencies);
    const snapshot = handlers.get("importRankingCsv")!(
      [
        "排名,书名,作者,题材,字数,状态,标签,链接",
        '1,"城,市回声",林舟,都市脑洞,1.2万,连载,"悬疑,成长",https://example.com/book',
      ].join("\n"),
      "测试榜",
    ) as RankingSnapshot;

    expect(snapshot).toMatchObject({
      source: "CSV 手动导入",
      listName: "测试榜",
      status: "成功",
      entries: [
        {
          rank: 1,
          title: "城,市回声",
          author: "林舟",
          genre: "都市脑洞",
          words: 12_000,
          status: "连载",
          tags: ["悬疑", "成长"],
          sourceUrl: "https://example.com/book",
        },
      ],
    });
    expect(snapshot.entries[0].snapshotId).toBe(snapshot.id);
    expect(database.saveRanking).toHaveBeenCalledWith(snapshot);
  });

  it("registers the complete research surface and delegates file parsing", async () => {
    const { dependencies, handlers, workerRun } = createDependencies();
    registerResearchHandlers(dependencies);

    expect([...handlers.keys()].sort()).toEqual([
      "capturePublicRanking",
      "createInsight",
      "deconstructResearchBook",
      "deleteRankingSchedule",
      "getRankingAnalytics",
      "importPublicResearchSample",
      "importRankingCsv",
      "importResearchBook",
      "listInsights",
      "listRankingSchedules",
      "listRankings",
      "listResearchAnalyses",
      "listResearchBooks",
      "listResearchSelections",
      "previewResearchFile",
      "runRankingSchedule",
      "saveRankingSchedule",
      "saveResearchSelection",
      "updateInsight",
    ]);

    await handlers.get("previewResearchFile")!();
    expect(workerRun).toHaveBeenCalledWith("parse-document", {
      filePath: "C:/samples/sample.txt",
    });
  });

  it("updates editable insight fields while preserving evidence metadata", () => {
    const { dependencies, handlers, database } = createDependencies();
    registerResearchHandlers(dependencies);
    const existing = {
      id: "insight-1",
      name: "旧标题",
      genre: "都市脑洞",
      audienceNeed: "旧需求",
      openingPromise: "旧承诺",
      conflictEngine: "旧冲突",
      emotionalRhythm: "旧节奏",
      retentionDevices: "旧追读",
      longFormEngine: "旧长篇",
      marketGap: "旧空位",
      risks: "旧风险",
      evidenceCount: 12,
      confidence: "中",
      createdAt: "2026-11-17T00:00:00.000Z",
    };
    database.listInsights.mockReturnValue([existing] as never);
    const edits = {
      name: "人工修订标题",
      genre: "都市脑洞",
      audienceNeed: "人工确认的读者需求",
      openingPromise: "新的开篇承诺",
      conflictEngine: "新的冲突",
      emotionalRhythm: "新的节奏",
      retentionDevices: "新的追读",
      longFormEngine: "新的长篇发动机",
      marketGap: "新的市场空位",
      risks: "新的风险",
      confidence: "高",
    };

    const result = handlers.get("updateInsight")!("insight-1", edits);

    expect(result).toEqual({ ...existing, ...edits, evidenceCount: 12, createdAt: existing.createdAt });
    expect(database.saveInsight).toHaveBeenCalledWith(result);
  });

  it("rejects updates for missing insights and uneditable or invalid fields", () => {
    const { dependencies, handlers, database } = createDependencies();
    registerResearchHandlers(dependencies);
    const edits = {
      name: "人工修订标题",
      genre: "都市脑洞",
      audienceNeed: "人工确认的读者需求",
      openingPromise: "新的开篇承诺",
      conflictEngine: "新的冲突",
      emotionalRhythm: "新的节奏",
      retentionDevices: "新的追读",
      longFormEngine: "新的长篇发动机",
      marketGap: "新的市场空位",
      risks: "新的风险",
      confidence: "高",
    };

    expect(() => handlers.get("updateInsight")!("missing", edits)).toThrow("洞察不存在");
    expect(() => validateIpcArgs("updateInsight", ["insight-1", { ...edits, evidenceCount: 99 }])).toThrow(/参数无效/);
    expect(() => validateIpcArgs("updateInsight", ["insight-1", { ...edits, genre: "未知题材" }])).toThrow(/参数无效/);
    expect(database.saveInsight).not.toHaveBeenCalled();
  });

  it("keeps the local research import behind explicit rights confirmation", () => {
    const { dependencies, handlers, database } = createDependencies();
    registerResearchHandlers(dependencies);
    const preview = {
      fileName: "sample.txt",
      sourceType: "TXT",
      detectedEncoding: "UTF-8",
      chapters: [],
      totalWords: 0,
      warnings: [],
    } satisfies ImportPreview;

    expect(() => handlers.get("importResearchBook")!(preview, "都市脑洞", false, false)).toThrow(
      "必须确认拥有材料的合法使用权",
    );
    expect(database.saveResearchBook).not.toHaveBeenCalled();
  });

  it("does not require cloud consent for an authorized local import", () => {
    const { dependencies, handlers, database } = createDependencies();
    registerResearchHandlers(dependencies);
    const preview = {
      fileName: "sample.txt",
      sourceType: "TXT",
      detectedEncoding: "UTF-8",
      chapters: [],
      totalWords: 0,
      warnings: [],
    } satisfies ImportPreview;

    const imported = handlers.get("importResearchBook")!(preview, "都市脑洞", true, false);

    expect(imported).toMatchObject({
      title: "sample",
      rightsConfirmed: true,
      cloudConsent: false,
      status: "待拆解",
    });
    expect(database.saveResearchBook).toHaveBeenCalledWith(imported, []);
  });

  it("keeps source metadata on authorized samples without changing the local import gate", () => {
    const { dependencies, handlers, database } = createDependencies();
    registerResearchHandlers(dependencies);
    const reference = {
      title: "借来的信封",
      author: "示例作者",
      url: "https://example.com/story/21",
      platform: "示例平台",
    };
    const preview = {
      fileName: "sample.txt",
      sourceType: "TXT",
      detectedEncoding: "UTF-8",
      chapters: [],
      totalWords: 0,
      warnings: [],
      reference,
    };
    expect(() => handlers.get("importResearchBook")!(preview, "都市脑洞", false, false)).toThrow(/使用权/);
    expect(database.saveResearchBook).not.toHaveBeenCalled();
    const args = validateIpcArgs("importResearchBook", [preview, "都市脑洞", true, false]);
    expect(handlers.get("importResearchBook")!(...args)).toMatchObject({
      title: reference.title,
      author: reference.author,
      sourceUrl: reference.url,
      sourcePlatform: reference.platform,
      sourceType: "TXT",
      rightsConfirmed: true,
      cloudConsent: false,
    });
    expect(() =>
      validateIpcArgs("importResearchBook", [
        { ...preview, reference: { ...reference, url: "https://user:pass@example.com/story/21" } },
        "都市脑洞",
        true,
        false,
      ]),
    ).toThrow(/参数无效/);
  });
});

describe("research selections", () => {
  const selection = {
    id: "selection-1",
    platformId: "example",
    title: "借来的信封",
    author: "示例作者",
    url: "https://example.com/story/21",
    note: "关注主角当场拒签的选择",
    tags: ["家庭", "轻悬疑"],
    kind: "短篇",
    status: "待阅读" as const,
    createdAt: "2026-11-17T08:30:00.000Z",
    updatedAt: "2026-11-17T08:30:00.000Z",
  };

  it("upgrades an existing research database and persists one row per selection across restarts", () => {
    const root = mkdtempSync(join(tmpdir(), "novel-research-selections-"));
    let database: WorkspaceDatabase | undefined;
    try {
      database = new WorkspaceDatabase(root);
      database.saveResearchBook(
        {
          id: "legacy-book",
          title: "已存在的样本",
          author: "未标注",
          genre: "都市脑洞",
          sourceType: "TXT",
          chapterCount: 0,
          wordCount: 0,
          rightsConfirmed: true,
          cloudConsent: false,
          importedAt: selection.createdAt,
          status: "待拆解",
        },
        [],
      );
      database.close();
      database = undefined;
      const legacyResearch = new DatabaseSync(join(root, "research", "research.sqlite"));
      try {
        legacyResearch.exec(`
          DROP TABLE IF EXISTS research_selections;
          DELETE FROM schema_migrations WHERE id = 'research-0004-selections';
          PRAGMA user_version = 3;
        `);
      } finally {
        legacyResearch.close();
      }
      database = new WorkspaceDatabase(root);
      expect(database.listResearchBooks().map((book) => book.title)).toEqual(["已存在的样本"]);
      expect(database.listResearchSelections()).toEqual([]);
      expect(database.saveResearchSelection(selection)).toEqual(selection);
      expect(database.saveResearchSelection(selection)).toEqual(selection);
      const updated = {
        ...selection,
        status: "已阅读" as const,
        createdAt: "2026-11-18T08:30:00.000Z",
        updatedAt: "2026-11-18T08:30:00.000Z",
      };
      database.saveResearchSelection(updated);
      database.close();
      database = undefined;
      database = new WorkspaceDatabase(root);
      expect(database.listResearchSelections()).toEqual([{ ...updated, createdAt: selection.createdAt }]);
    } finally {
      database?.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("checks the selection link and rejects credentialed or non-web references", () => {
    expect(validateIpcArgs("saveResearchSelection", [selection])).toEqual([selection]);
    for (const url of ["javascript:void(0)", "file:///tmp/book", "https://name:secret@example.com/"]) {
      expect(() => validateIpcArgs("saveResearchSelection", [{ ...selection, url }])).toThrow(/参数无效/);
    }
  });
});

describe("ranking schedule handlers", () => {
  let workspace: { path: string; database: WorkspaceDatabase } | undefined;
  const capture = vi.mocked(capturePublicRankingPage);
  const input: Parameters<AppApi["saveRankingSchedule"]>[0] = {
    url: "https://example.com/rank",
    listName: "测试榜",
    frequency: "每日",
    enabled: true,
  };

  function snapshot(listName: string): RankingSnapshot {
    return {
      id: randomUUID(),
      source: "example.com",
      listName,
      capturedAt: new Date().toISOString(),
      status: "成功",
      error: null,
      entries: [],
    };
  }

  function setup(clock: string) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(clock));
    const path = mkdtempSync(join(tmpdir(), "novel-ranking-schedule-"));
    const database = new WorkspaceDatabase(path);
    workspace = { path, database };
    const { dependencies, handlers } = createDependencies();
    const { runDueRankingSchedules } = registerResearchHandlers({ ...dependencies, database, workspaceRoot: path });
    capture.mockImplementation(async (_url, listName) => snapshot(listName));
    return {
      database,
      runDueRankingSchedules,
      captureSource: (source: string, listName: string) =>
        handlers.get("capturePublicRanking")!(source, listName) as Promise<RankingSnapshot>,
      importCsv: (csv: string, listName: string) => handlers.get("importRankingCsv")!(csv, listName) as RankingSnapshot,
      save: (overrides: Partial<typeof input> = {}) =>
        handlers.get("saveRankingSchedule")!({ ...input, ...overrides }) as RankingCaptureSchedule,
      run: (id: string) => handlers.get("runRankingSchedule")!(id) as Promise<RankingSnapshot>,
      remove: (id: string) => handlers.get("deleteRankingSchedule")!(id),
    };
  }

  function holdCapture(error?: Error) {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    capture.mockImplementation(async (_url, listName) => {
      await pending;
      if (error) throw error;
      return snapshot(listName);
    });
    return finish;
  }

  afterEach(() => {
    vi.useRealTimers();
    capture.mockReset();
    if (workspace) {
      workspace.database.close();
      rmSync(workspace.path, { recursive: true, force: true });
      workspace = undefined;
    }
  });

  it("schedules a new daily task for 15:20 Beijing time before the cutoff", () => {
    const { save } = setup("2026-07-30T06:00:00.000Z");
    expect(save().nextRunAt).toBe("2026-07-30T07:20:00.000Z");
  });

  it("makes a new daily task immediately due after the cutoff", async () => {
    const { database, runDueRankingSchedules, save } = setup("2026-07-30T09:30:00.000Z");
    expect(save().nextRunAt).toBe("2026-07-30T09:30:00.000Z");
    await runDueRankingSchedules();
    expect(database.listRankings()).toHaveLength(1);
    expect(database.listRankingSchedules()[0].nextRunAt).toBe("2026-07-31T07:20:00.000Z");
  });

  it("reads the inbox export manually and skips an identical scheduled version", async () => {
    const { captureSource, database, runDueRankingSchedules, save } = setup("2026-07-30T09:30:00.000Z");
    const exportPath = join(database.root, "rank-inbox", "授权榜单.csv");
    const source = "inbox:授权榜单.csv";
    writeFileSync(exportPath, "排名,书名,在读人数\n7,授权样例,2.5万", "utf8");

    const first = await captureSource(source, "测试榜");
    save({ url: source });
    await runDueRankingSchedules();

    expect(first).toMatchObject({
      source: "本地 CSV 收件箱 · 授权榜单.csv",
      status: "成功",
      entries: [{ rank: 7, title: "授权样例", readerCount: 25000 }],
    });
    expect(database.listRankings().map(({ id }) => id)).toEqual([first.id]);
    expect(database.listRankingSchedules()[0]).toMatchObject({
      lastStatus: "成功",
      nextRunAt: "2026-07-31T07:20:00.000Z",
    });
    expect(capture).not.toHaveBeenCalled();

    vi.setSystemTime(new Date("2026-07-31T07:20:00.000Z"));
    writeFileSync(exportPath, "排名,书名,在读人数\n3,授权样例,3万", "utf8");
    await runDueRankingSchedules();
    expect(database.listRankings().map((snapshot) => snapshot.entries[0].rank)).toEqual([3, 7]);
  });

  it("keeps source-version deduplication specific to the source and the list", async () => {
    const { database, runDueRankingSchedules, save } = setup("2026-07-30T09:30:00.000Z");
    save();
    capture.mockImplementation(async (_url, listName) => ({ ...snapshot(listName), sourceVersion: "2026-07-30" }));
    await runDueRankingSchedules();
    save({ listName: "独立榜单" });
    await runDueRankingSchedules();
    capture.mockImplementation(async (_url, listName) => ({
      ...snapshot(listName),
      source: "another.example",
      sourceVersion: "2026-07-30",
    }));
    save();
    await runDueRankingSchedules();
    vi.setSystemTime(new Date("2026-07-31T07:20:00.000Z"));
    await runDueRankingSchedules();

    expect(database.listRankings()).toHaveLength(4);
    expect(database.listRankingSchedules().every((entry) => entry.lastStatus === "成功")).toBe(true);
  });

  it("reuses a manual CSV only when the latest successful export has the same version", () => {
    const { database, importCsv } = setup("2026-07-30T09:30:00.000Z");
    const first = importCsv("排名,书名\n1,授权样例甲", "测试榜");
    expect(importCsv("排名,书名\n1,授权样例甲", "测试榜").id).toBe(first.id);
    const changed = importCsv("排名,书名\n1,授权样例乙", "测试榜");
    const reverted = importCsv("排名,书名\n1,授权样例甲", "测试榜");

    expect(reverted.sourceVersion).toBe(first.sourceVersion);
    expect(database.listRankings().map((entry) => entry.id)).toEqual([reverted.id, changed.id, first.id]);
    expect(importCsv("排名,书名\n1,授权样例甲", "测试榜").id).toBe(reverted.id);
  });

  it("returns the saved copy when a one-time source sync retrieves an unchanged version", async () => {
    const { captureSource, database } = setup("2026-07-30T09:30:00.000Z");
    capture.mockImplementation(async (_url, listName) => ({ ...snapshot(listName), sourceVersion: "2026-07-30" }));

    const first = await captureSource(input.url, input.listName);
    const repeated = await captureSource(input.url, input.listName);

    expect(repeated.id).toBe(first.id);
    expect(database.listRankings()).toHaveLength(1);
  });

  it("rejects an inbox junction pointing outside the inbox directory", async () => {
    const { captureSource, database } = setup("2026-07-30T09:30:00.000Z");
    const outside = join(database.root, "other-data");
    mkdirSync(outside);
    writeFileSync(join(outside, "榜单.csv"), "排名,书名\n1,不应导入", "utf8");
    const inbox = join(database.root, "rank-inbox");
    rmdirSync(inbox);
    symlinkSync(outside, inbox, "junction");

    const snapshot = await captureSource("inbox:榜单.csv", "测试榜");

    expect(snapshot).toMatchObject({ status: "失败", entries: [] });
    expect(snapshot.error).toMatch(/目录.*链接/);
    expect(snapshot.error).not.toContain(outside);
  });

  it("rejects linked, oversized, missing, and non-UTF-8 inbox files", async () => {
    const { captureSource, database } = setup("2026-07-30T09:30:00.000Z");
    const inbox = join(database.root, "rank-inbox");
    const outside = join(database.root, "outside.csv");
    writeFileSync(outside, "排名,书名\n1,不应导入", "utf8");
    linkSync(outside, join(inbox, "链接.csv"));
    writeFileSync(join(inbox, "大文件.csv"), Buffer.alloc(5_000_001));
    writeFileSync(join(inbox, "错误编码.csv"), new Uint8Array([0xc3, 0x28]));

    for (const [filename, expected] of [
      ["链接.csv", /链接/],
      ["大文件.csv", /5MB/],
      ["错误编码.csv", /UTF-8/],
      ["未放入.csv", /找不到/],
    ] as const) {
      const snapshot = await captureSource(`inbox:${filename}`, "测试榜");
      expect(snapshot).toMatchObject({ status: "失败", entries: [] });
      expect(snapshot.error).toMatch(expected);
      expect(snapshot.error).not.toContain(database.root);
    }
  });

  it("validates inbox filenames in the existing ranking IPC surface", () => {
    const source = "inbox:榜单导出 (1).CSV";
    expect(validateIpcArgs("capturePublicRanking", [source, "榜单"])).toEqual([source, "榜单"]);
    expect(validateIpcArgs("saveRankingSchedule", [{ ...input, url: source }])).toEqual([{ ...input, url: source }]);
    for (const invalid of ["inbox:../outside.csv", "inbox:..\\outside.csv", "inbox:C:\\outside.csv", "inbox:CON.csv"])
      expect(() => validateIpcArgs("capturePublicRanking", [invalid, "榜单"])).toThrow("参数无效");
  });

  it("defers a missed former daily schedule until today's Beijing cutoff", async () => {
    const { database, runDueRankingSchedules, save } = setup("2026-07-30T07:19:00.000Z");
    database.saveRankingSchedule({ ...save(), nextRunAt: "2026-07-29T04:00:00.000Z" });
    await runDueRankingSchedules();
    expect(database.listRankings()).toEqual([]);
    expect(database.listRankingSchedules()[0].nextRunAt).toBe("2026-07-30T07:20:00.000Z");

    vi.setSystemTime(new Date("2026-07-30T07:20:00.000Z"));
    await runDueRankingSchedules();
    expect(database.listRankings()).toHaveLength(1);
  });

  it("does not duplicate an in-flight capture across timer checks and manual runs", async () => {
    const { database, runDueRankingSchedules, run, save } = setup("2026-07-30T09:30:00.000Z");
    const schedule = save();
    database.saveRankingSchedule({ ...schedule, nextRunAt: "2026-07-30T07:20:00.000Z" });
    const finish = holdCapture();
    const automatic = runDueRankingSchedules();
    const repeatedTimer = runDueRankingSchedules();
    const manualResult = Promise.allSettled([run(schedule.id)]);
    finish();

    await Promise.all([automatic, repeatedTimer, manualResult]);
    expect(database.listRankings()).toHaveLength(1);
    expect(database.listRankingSchedules()[0].lastStatus).toBe("成功");
  });

  it.each([
    { enabled: false },
    { url: "https://example.com/another-rank", listName: "新榜单", frequency: "每周" as const },
  ])("discards a capture when its configuration changes to %o", async (changes) => {
    const { database, run, save } = setup("2026-07-30T09:30:00.000Z");
    const schedule = save();
    const finish = holdCapture();
    const result = Promise.allSettled([run(schedule.id)]);
    const updated = save({ id: schedule.id, ...changes });
    finish();

    await result;
    expect(database.listRankings()).toEqual([]);
    expect(database.listRankingSchedules()).toEqual([updated]);
  });

  it("does not recreate a deleted schedule when a timer capture throws", async () => {
    const { database, remove, runDueRankingSchedules, save } = setup("2026-07-30T09:30:00.000Z");
    const schedule = save();
    database.saveRankingSchedule({ ...schedule, nextRunAt: "2026-07-30T07:20:00.000Z" });
    const finish = holdCapture(new Error("访问受限"));
    const automatic = runDueRankingSchedules();
    remove(schedule.id);
    finish();

    await automatic;
    expect(database.listRankingSchedules()).toEqual([]);
  });

  it("records a thrown manual failure and the next sampling time", async () => {
    const { database, run, save } = setup("2026-07-30T09:30:00.000Z");
    const schedule = save();
    capture.mockRejectedValue(new Error("访问受限"));
    await expect(run(schedule.id)).rejects.toThrow("访问受限");
    expect(database.listRankingSchedules()[0]).toMatchObject({
      lastRunAt: "2026-07-30T09:30:00.000Z",
      lastStatus: "失败",
      lastError: "访问受限",
      nextRunAt: "2026-07-31T07:20:00.000Z",
    });
  });
});
