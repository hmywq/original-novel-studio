import { describe, expect, it } from "vitest";
import { analyzeRankings } from "../electron/ranking-service";
import { analyzeMetrics, parseMetricsCsv, summarizeMetrics } from "../src/shared/metrics";
import { completeRankingSchedule, failRankingSchedule, nextRankingRun } from "../src/shared/ranking-schedule";
import type { RankingSnapshot } from "../src/shared/types";

describe("ranking analytics", () => {
  it("reports entrants, movers, distribution, range and confidence", () => {
    const snapshots: RankingSnapshot[] = [
      {
        id: "one",
        source: "test",
        listName: "榜单",
        capturedAt: "2026-07-29T00:00:00Z",
        status: "成功",
        error: null,
        entries: [
          {
            id: "a",
            snapshotId: "one",
            rank: 3,
            title: "甲",
            author: "作者",
            genre: "都市脑洞",
            words: 500000,
            status: "连载",
            tags: [],
            sourceUrl: "",
          },
        ],
      },
      {
        id: "two",
        source: "test",
        listName: "榜单",
        capturedAt: "2026-07-30T00:00:00Z",
        status: "成功",
        error: null,
        entries: [
          {
            id: "b",
            snapshotId: "two",
            rank: 1,
            title: "甲",
            author: "作者",
            genre: "都市脑洞",
            words: 600000,
            status: "连载",
            tags: [],
            sourceUrl: "",
          },
          {
            id: "c",
            snapshotId: "two",
            rank: 2,
            title: "乙",
            author: "作者乙",
            genre: "现言甜宠",
            words: 300000,
            status: "完结",
            tags: [],
            sourceUrl: "",
          },
        ],
      },
    ];
    const result = analyzeRankings(snapshots);
    expect(result.newEntrants).toContain("乙");
    expect(result.movers[0].change).toBe(2);
    expect(result.continuousAppearances[0].snapshots).toBe(2);
  });

  it("builds market opportunities only from repeated snapshots of the same list", () => {
    const makeEntry = (snapshotId: string, rank: number, title: string) => ({
      id: `${snapshotId}-${title}`,
      snapshotId,
      rank,
      title,
      author: "作者",
      genre: "都市脑洞",
      words: 500000,
      status: "连载",
      tags: [],
      sourceUrl: "",
    });
    const snapshots: RankingSnapshot[] = [
      {
        id: "old",
        source: "番茄小说官网",
        listName: "番茄男频阅读榜·都市脑洞",
        capturedAt: "2026-07-28T00:00:00Z",
        status: "成功",
        error: null,
        entries: [makeEntry("old", 3, "甲"), makeEntry("old", 2, "乙")],
      },
      {
        id: "other",
        source: "番茄小说官网",
        listName: "番茄女频阅读榜·年代",
        capturedAt: "2026-07-29T00:00:00Z",
        status: "成功",
        error: null,
        entries: [makeEntry("other", 1, "无关作品")],
      },
      {
        id: "new",
        source: "番茄小说官网",
        listName: "番茄男频阅读榜·都市脑洞",
        capturedAt: "2026-07-30T00:00:00Z",
        status: "成功",
        error: null,
        entries: [makeEntry("new", 1, "甲"), makeEntry("new", 2, "丙")],
      },
    ];
    const opportunity = analyzeRankings(snapshots).marketOpportunities.find((item) => item.categoryKey === "男频:262")!;
    expect(opportunity).toMatchObject({
      snapshots: 2,
      newEntrantRate: 50,
      stabilityRate: 50,
      averageRankChange: 2,
      genre: "都市脑洞",
    });
    expect(opportunity).toMatchObject({
      evidenceLevel: "暂定",
      dataSufficiency: 30,
      formulaVersion: "fanqie-opportunity-v2",
    });
    expect(opportunity.scoreRange).not.toBeNull();
  });

  it("treats a single ranking snapshot as a baseline without an opportunity score", () => {
    const snapshots: RankingSnapshot[] = [
      {
        id: "one",
        source: "番茄小说官网",
        listName: "番茄男频阅读榜·都市脑洞",
        capturedAt: "2026-07-30T00:00:00Z",
        status: "成功",
        error: null,
        entries: [
          {
            id: "a",
            snapshotId: "one",
            rank: 1,
            title: "甲",
            author: "作者",
            genre: "都市脑洞",
            words: 500000,
            status: "连载",
            tags: [],
            sourceUrl: "",
          },
        ],
      },
    ];
    const opportunity = analyzeRankings(snapshots).marketOpportunities[0];
    expect(opportunity).toMatchObject({
      evidenceLevel: "基线",
      opportunityScore: null,
      momentumScore: null,
      competition: "未知",
      confidence: "低",
    });
    expect(opportunity.sampleWarning).toContain("不能判断趋势");
  });

  it("does not label an unknown list as urban fantasy", () => {
    const snapshots: RankingSnapshot[] = [
      {
        id: "one",
        source: "test",
        listName: "未分类榜单",
        capturedAt: "2026-07-30T00:00:00Z",
        status: "成功",
        error: null,
        entries: [
          {
            id: "a",
            snapshotId: "one",
            rank: 1,
            title: "甲",
            author: "作者",
            genre: "未知小类",
            words: 500000,
            status: "连载",
            tags: [],
            sourceUrl: "",
          },
        ],
      },
    ];
    expect(analyzeRankings(snapshots).marketOpportunities[0].genre).toBe("待校对");
  });
});

describe("metric review", () => {
  it("turns declining retention into a review suggestion, not an automatic edit", () => {
    const metrics = [
      {
        id: "1",
        chapterNumber: 1,
        recordedAt: "2026-07-01",
        exposure: 1000,
        reads: 600,
        retention: 50,
        follows: 200,
        revenue: 10,
        comments: "",
      },
      {
        id: "2",
        chapterNumber: 2,
        recordedAt: "2026-07-08",
        exposure: 1000,
        reads: 580,
        retention: 42,
        follows: 150,
        revenue: 9,
        comments: "",
      },
    ];
    expect(analyzeMetrics(metrics).some((item) => item.category === "节奏")).toBe(true);
  });

  it("parses legacy and expanded CSV headers without shifting columns", () => {
    let sequence = 0;
    const legacy = parseMetricsCsv(
      "日期,章节,曝光,阅读,留存,追读,收益,评论摘要\n2026-07-01,3,1000,600,42,120,9.5,旧格式",
      () => `legacy-${++sequence}`,
    )[0];
    expect(legacy).toMatchObject({
      chapterNumber: 3,
      exposure: 1000,
      clicks: 0,
      reads: 600,
      retention: 42,
      follows: 120,
      revenue: 9.5,
      comments: "旧格式",
    });
    const expanded = parseMetricsCsv(
      "date,chapter,exposure,clicks,reads,firstChapterCompletion,threeChapterRetention,retention,follows,bookshelfAdds,revenue\n2026-07-02,4,2000,900,700,48%,31%,40,140,80,15",
      () => `new-${++sequence}`,
    )[0];
    expect(expanded).toMatchObject({
      clicks: 900,
      firstChapterCompletion: 48,
      threeChapterRetention: 31,
      bookshelfAdds: 80,
    });
  });

  it("summarizes the Fanqie funnel and attributes retention decline to the weakest later chapter", () => {
    const metrics = [
      {
        id: "1",
        chapterNumber: 1,
        recordedAt: "2026-07-01",
        exposure: 1000,
        clicks: 200,
        reads: 100,
        firstChapterCompletion: 30,
        threeChapterRetention: 20,
        retention: 55,
        follows: 10,
        bookshelfAdds: 2,
        revenue: 0,
        comments: "",
      },
      {
        id: "2",
        chapterNumber: 2,
        recordedAt: "2026-07-02",
        exposure: 1000,
        clicks: 180,
        reads: 90,
        firstChapterCompletion: 32,
        threeChapterRetention: 22,
        retention: 50,
        follows: 9,
        bookshelfAdds: 3,
        revenue: 0,
        comments: "",
      },
      {
        id: "3",
        chapterNumber: 7,
        recordedAt: "2026-07-03",
        exposure: 1000,
        clicks: 150,
        reads: 70,
        firstChapterCompletion: 25,
        threeChapterRetention: 18,
        retention: 28,
        follows: 4,
        bookshelfAdds: 1,
        revenue: 0,
        comments: "",
      },
    ];
    expect(summarizeMetrics(metrics).clickRate).toBeCloseTo(17.67, 1);
    expect(analyzeMetrics(metrics).find((item) => item.id === "retention-drop")?.recommendation).toContain("第7章");
  });
});

describe("ranking schedules", () => {
  const schedule = {
    id: "s",
    url: "https://example.com",
    listName: "榜单",
    frequency: "每日" as const,
    enabled: true,
    lastRunAt: null,
    nextRunAt: "2026-07-30T00:00:00.000Z",
    lastStatus: "未运行" as const,
    lastError: null,
  };

  it("advances successful and failed runs to the next cycle", () => {
    const from = new Date("2026-07-30T08:00:00.000Z");
    expect(nextRankingRun("每日", from)).toBe("2026-07-31T07:20:00.000Z");
    expect(nextRankingRun("每周", from)).toBe("2026-08-06T08:00:00.000Z");
    const snapshot: RankingSnapshot = {
      id: "r",
      source: "test",
      listName: "榜单",
      capturedAt: "2026-07-30T08:00:01.000Z",
      status: "成功",
      error: null,
      entries: [],
    };
    expect(completeRankingSchedule(schedule, snapshot, from)).toMatchObject({
      lastStatus: "成功",
      lastRunAt: snapshot.capturedAt,
      nextRunAt: "2026-07-31T07:20:00.000Z",
    });
    expect(failRankingSchedule(schedule, new Error("访问受限"), from)).toMatchObject({
      lastStatus: "失败",
      lastError: "访问受限",
      nextRunAt: "2026-07-31T07:20:00.000Z",
    });
  });
});
