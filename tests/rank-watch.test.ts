import { describe, expect, it } from "vitest";
import { buildRankWatch, rankingTracks, watchTerms } from "../src/shared/rank-watch";
import type { RankingSnapshot } from "../src/shared/types";

function snapshot(
  id: string,
  capturedAt: string,
  tags: string[][],
  overrides: Partial<RankingSnapshot> = {},
): RankingSnapshot {
  return {
    id,
    capturedAt,
    source: "番茄小说官网",
    listName: "都市新书榜",
    status: "成功",
    error: null,
    entries: tags.map((entryTags, index) => ({
      id: id + index,
      snapshotId: id,
      rank: index + 1,
      author: "样本作者",
      title: ["旧城档案", "回声邮局", "无人旅馆"][index],
      genre: "都市",
      words: 10000,
      status: "连载",
      sourceUrl: `https://fanqienovel.com/page/${index + 1}`,
      tags: entryTags,
    })),
    ...overrides,
  };
}

describe("榜单热点关注", () => {
  it("在同一个榜单的不同北京时间日期之间计算变化，忽略失败和同日重复采集", () => {
    const old = snapshot("yesterday", "2026-11-17T07:20:00Z", [["群像"], [], []]);
    const first = snapshot("morning", "2026-11-17T23:20:00Z", [["群像"], ["群像"], []]);
    const latest = snapshot("latest", "2026-11-18T07:20:00Z", [["群像", "群像"], ["群像"], ["群像"]]);
    const failed = snapshot("failed", "2026-11-18T08:00:00Z", [], { status: "失败" });
    const imported = snapshot("csv", "2026-11-18T08:00:00Z", [["群像"]], { source: "CSV" });
    const tracks = rankingTracks([old, first, latest, failed, imported]);
    expect(tracks).toHaveLength(2);
    const track = tracks.find((item) => item.source === "番茄小说官网")!;
    const result = buildRankWatch(track.snapshots, ["群像", "邮局"]);
    expect(result.latest?.id).toBe("latest");
    expect(result.previous?.id).toBe("yesterday");
    expect(result.latestAttempt?.id).toBe("failed");
    expect(result.watched.map(({ term, hits, change }) => [term, hits.length, change])).toEqual([
      ["群像", 3, 2],
      ["邮局", 1, 0],
    ]);
    expect(result.topTags.map(({ term, hits }) => [term, hits.length])).toEqual([["群像", 3]]);
  });

  it("展示部分成功的实得书目，但不根据不完整或不等量样本判定上涨", () => {
    const previous = snapshot("previous", "2026-11-17T07:20:00Z", [["规则"], []]);
    const incomplete = snapshot("partial", "2026-11-18T07:20:00Z", [["规则"]], { status: "部分成功" });
    expect(buildRankWatch([previous, incomplete], ["规则"]).watched[0].change).toBeNull();
    expect(buildRankWatch([previous, { ...incomplete, status: "成功" }], ["规则"]).watched[0].change).toBeNull();
    expect(buildRankWatch([previous], ["规则"]).watched[0].hits).toHaveLength(1);
  });

  it("跨天读取同一版本时，使用更早的不同版本做对比", () => {
    const earlier = snapshot("earlier", "2026-11-16T07:20:00Z", [[], []], { sourceVersion: "第1期" });
    const previous = snapshot("previous", "2026-11-17T07:20:00Z", [["群像"], []], { sourceVersion: "第2期" });
    const latest = snapshot("latest", "2026-11-18T07:20:00Z", [["群像"], []], { sourceVersion: "第2期" });
    const result = buildRankWatch([earlier, latest, previous], ["群像"]);
    expect(result.previous?.id).toBe("earlier");
    expect(result.watched[0].change).toBe(1);
    expect(buildRankWatch([latest, previous], ["群像"]).watched[0].change).toBeNull();
  });

  it("依榜单期比较在同一天补录的两份快照，按实际采集时间保留最后一次尝试", () => {
    const latest = snapshot("latest", "2026-11-18T09:00:00Z", [["群像"], ["群像"]], {
      sourceVersion: "2026-11-18",
    });
    const archive = snapshot("archive", "2026-11-18T09:01:00Z", [["群像"], []], {
      sourceVersion: "2026-11-17",
    });
    const result = buildRankWatch([archive, latest], ["群像"]);
    expect(result.latestAttempt?.id).toBe("archive");
    expect(result.latest?.id).toBe("latest");
    expect(result.previous?.id).toBe("archive");
    expect(result.watched[0].change).toBe(1);
  });

  it("关注词忽略宽窄和大小写差异，去掉重复词与空项", () => {
    expect(watchTerms([" 群像 ", "群像", "ＡＩ", "ai", "", 7])).toEqual(["群像", "AI"]);
  });
});
