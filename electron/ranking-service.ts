import { createHash, randomUUID } from "node:crypto";
import { FANQIE_CATEGORY_PROFILES } from "../src/shared/fanqie-taxonomy";
import { parseRankingCsv } from "../src/shared/ranking-csv";
import {
  GENRES,
  type MarketOpportunity,
  type RankingAnalytics,
  type RankingEntry,
  type RankingSnapshot,
} from "../src/shared/types";
import { assertPublicHttpUrlSyntax, fetchPublicHttpResponse } from "./netguard";

export const RANKING_CSV_BYTE_LIMIT = 5_000_000;
const RANKING_CSV_TIMEOUT_MS = 30_000;

export function assertRankingCsvUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("CSV 数据源地址无效");
  }
  const hostname = url.hostname.replace(/\.+$/, "");
  if (hostname === "fanqienovel.com" || hostname.endsWith(".fanqienovel.com"))
    throw new Error("番茄官网自动采集需要事先授权，请导入有权使用的榜单文件");
  if (url.protocol !== "https:") throw new Error("CSV 数据源必须使用 HTTPS 地址");
  assertPublicHttpUrlSyntax(url);
  return url;
}

async function fetchRankingCsv(url: URL): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RANKING_CSV_TIMEOUT_MS);
  try {
    const response = await fetchPublicHttpResponse(
      url,
      {
        signal: controller.signal,
        headers: {
          "User-Agent": "NovelStudio/0.7 authorized-ranking-reader",
          Accept: "text/csv,application/csv",
        },
      },
      { allowCrossOriginRedirect: false },
    );
    if (!response.ok) throw new Error(`CSV 数据源返回 HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    const mime = contentType.split(";", 1)[0].trim().toLowerCase();
    if (mime !== "text/csv" && mime !== "application/csv") throw new Error("数据源必须返回 CSV 格式");
    const charset = /;\s*charset\s*=\s*"?([^;"\s]+)/i.exec(contentType)?.[1].toLowerCase();
    if (charset && charset !== "utf-8" && charset !== "utf8") throw new Error("CSV 文件必须使用 UTF-8 编码");

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > RANKING_CSV_BYTE_LIMIT) throw new Error("CSV 文件超过 5MB 限制");
    if (!response.body) throw new Error("CSV 数据源未返回文件");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > RANKING_CSV_BYTE_LIMIT) throw new Error("CSV 文件超过 5MB 限制");
      chunks.push(value);
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, length));
    } catch {
      throw new Error("CSV 文件必须使用 UTF-8 编码");
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error("CSV 数据源请求超时（30 秒）");
    if (error instanceof Error && error.message === "模型服务不允许跨来源重定向")
      throw new Error("CSV 数据源不允许跨来源重定向");
    throw error;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

export interface PublicOpeningSample {
  title: string;
  author: string;
  sourceUrl: string;
  chapters: Array<{ title: string; content: string; wordCount: number }>;
}

export function captureFanqieOpeningSample(_sourceUrl: string): Promise<PublicOpeningSample> {
  return Promise.reject(new Error("在线采集试读样本需要事先授权，请导入有权使用的本地样本"));
}

export function parseAuthorizedRankingCsv(
  csv: string,
  listName: string,
  capturedAt = new Date().toISOString(),
): RankingSnapshot {
  if (Buffer.byteLength(csv) > RANKING_CSV_BYTE_LIMIT) throw new Error("CSV 文件超过 5MB 限制");
  const snapshot = parseRankingCsv(csv, listName, { createId: randomUUID, capturedAt, strict: true });
  const sourceVersion =
    snapshot.sourceVersion ??
    `sha256:${createHash("sha256")
      .update(csv.replace(/^\uFEFF/, ""))
      .digest("hex")}`;
  return { ...snapshot, sourceVersion };
}

export async function capturePublicRankingPage(url: string, listName: string): Promise<RankingSnapshot> {
  const capturedAt = new Date().toISOString();
  let source = "授权 CSV";
  try {
    const parsedUrl = assertRankingCsvUrl(url);
    source = `授权 CSV · ${parsedUrl.host}${parsedUrl.pathname}`;
    const csv = await fetchRankingCsv(parsedUrl);
    return { ...parseAuthorizedRankingCsv(csv, listName, capturedAt), source };
  } catch (error) {
    return {
      id: randomUUID(),
      source,
      listName,
      capturedAt,
      status: "失败",
      error: error instanceof Error ? error.message : String(error),
      entries: [],
    };
  }
}

export function analyzeRankings(snapshots: RankingSnapshot[]): RankingAnalytics {
  const successful = snapshots
    .filter((snapshot) => snapshot.entries.length > 0)
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const entries = successful.flatMap((snapshot) => snapshot.entries);
  const countBy = (values: string[]) =>
    [
      ...values.reduce(
        (map, value) => map.set(value || "未知", (map.get(value || "未知") ?? 0) + 1),
        new Map<string, number>(),
      ),
    ]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  const bands = entries.map((entry) =>
    entry.words === 0
      ? "未知"
      : entry.words < 300000
        ? "30万以下"
        : entry.words < 1000000
          ? "30–100万"
          : entry.words < 2000000
            ? "100–200万"
            : "200万以上",
  );
  const identity = (entry: RankingEntry) => `${entry.title}::${entry.author}`;
  const appearances = new Map<string, { title: string; snapshots: number }>();
  for (const snapshot of successful) {
    const once = new Set<string>();
    for (const entry of snapshot.entries) {
      const itemKey = identity(entry);
      if (once.has(itemKey)) continue;
      once.add(itemKey);
      const current = appearances.get(itemKey) ?? { title: entry.title, snapshots: 0 };
      current.snapshots += 1;
      appearances.set(itemKey, current);
    }
  }
  const range = successful.length
    ? `${successful[0].capturedAt.slice(0, 10)} 至 ${successful.at(-1)!.capturedAt.slice(0, 10)}`
    : "暂无数据";
  const profileForList = (listName: string) => {
    const profile = FANQIE_CATEGORY_PROFILES.find(
      (item) => listName.includes(item.channel) && listName.includes(item.name),
    );
    return profile;
  };
  const grouped = new Map<string, RankingSnapshot[]>();
  for (const snapshot of successful) {
    const key = JSON.stringify([snapshot.source, snapshot.listName]);
    const list = grouped.get(key) ?? [];
    list.push(snapshot);
    grouped.set(key, list);
  }
  const comparableLists = [...grouped.values()].filter((list) => list.length >= 2);
  const newEntrants = comparableLists.flatMap((list) => {
    const latest = list.at(-1)!;
    const previousKeys = new Set(list.at(-2)!.entries.map(identity));
    return latest.entries.filter((entry) => !previousKeys.has(identity(entry))).map((entry) => entry.title);
  });
  const movers = comparableLists
    .flatMap((list) => {
      const latest = list.at(-1)!;
      const previousMap = new Map(list.at(-2)!.entries.map((entry) => [identity(entry), entry]));
      return latest.entries.flatMap((entry) => {
        const before = previousMap.get(identity(entry));
        return before
          ? [{ title: entry.title, from: before.rank, to: entry.rank, change: before.rank - entry.rank }]
          : [];
      });
    })
    .filter((item) => item.change !== 0)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const marketOpportunities: MarketOpportunity[] = [...grouped.values()]
    .map((list) => {
      const latestSnapshot = list.at(-1)!;
      const { listName, source } = latestSnapshot;
      const previousSnapshot = list.at(-2);
      const latestEntries = latestSnapshot.entries;
      const previousEntries = previousSnapshot?.entries ?? [];
      const previousByIdentity = new Map(previousEntries.map((entry) => [identity(entry), entry]));
      const newRate = previousEntries.length
        ? latestEntries.filter((entry) => !previousByIdentity.has(identity(entry))).length / latestEntries.length
        : 0;
      const changes = latestEntries.flatMap((entry) => {
        const before = previousByIdentity.get(identity(entry));
        return before ? [before.rank - entry.rank] : [];
      });
      const averageRankChange = changes.length ? changes.reduce((sum, value) => sum + value, 0) / changes.length : 0;
      const previousIdentities = new Set(previousEntries.map(identity));
      const stabilityRate = latestEntries.length
        ? latestEntries.filter((entry) => previousIdentities.has(identity(entry))).length / latestEntries.length
        : 0;
      const hasTrend = list.length >= 2;
      const competition: MarketOpportunity["competition"] = !hasTrend
        ? "未知"
        : stabilityRate >= 0.7
          ? "高"
          : stabilityRate >= 0.4
            ? "中"
            : "低";
      const momentumScore = hasTrend
        ? Math.round(
            Math.max(
              0,
              Math.min(
                100,
                35 +
                  newRate * 45 +
                  Math.max(-5, Math.min(5, averageRankChange)) * 4 +
                  (listName.includes("新书榜") ? 5 : 0),
              ),
            ),
          )
        : null;
      const dataSufficiency =
        list.length === 1 ? 10 : list.length === 2 ? 30 : Math.min(100, 45 + (list.length - 3) * 10);
      const evidenceLevel: MarketOpportunity["evidenceLevel"] =
        list.length === 1 ? "基线" : list.length === 2 ? "暂定" : "可参考";
      const score =
        momentumScore === null
          ? null
          : Math.round(Math.max(0, Math.min(100, momentumScore * 0.75 + (100 - stabilityRate * 100) * 0.25)));
      const uncertainty = list.length >= 7 ? 8 : list.length >= 3 ? 13 : 20;
      const scoreRange: [number, number] | null =
        score === null ? null : [Math.max(0, score - uncertainty), Math.min(100, score + uncertainty)];
      const profile = profileForList(listName);
      const inferredGenre: MarketOpportunity["genre"] =
        GENRES.find((genre) => latestEntries.some((entry) => entry.genre === genre)) ?? "待校对";
      const confidence: MarketOpportunity["confidence"] = list.length >= 7 ? "高" : list.length >= 3 ? "中" : "低";
      const sampleWarning =
        list.length === 1
          ? "仅有一次快照，只能建立榜单基线，不能判断趋势。"
          : list.length === 2
            ? "仅有两个时间点，变化可能来自短期波动。"
            : list.length < 7
              ? "样本尚未覆盖完整周周期，结论需继续复核。"
              : null;
      const recommendation =
        score === null
          ? `先继续采集${profile?.name ?? "该榜单"}，当前不据单点数据判断机会。`
          : score >= 65
            ? `可作为${profile?.genre ?? "该题材"}候选方向：保留${profile?.coreFantasy ?? "题材核心幻想"}，用差异化主角、冲突发动机和开篇回报避开同质化。`
            : score >= 50
              ? `适合小规模验证：优先测试${profile?.openingFocus ?? "开篇承诺和首轮回报"}，连续采样后再决定是否扩张。`
              : "竞争或动能暂不突出，不建议仅凭单次榜单追热点。";
      return {
        listName,
        source,
        categoryKey: profile?.key,
        categoryName: profile?.name ?? listName,
        genre: profile?.genre ?? inferredGenre,
        snapshots: list.length,
        latestSampleSize: latestEntries.length,
        newEntrantRate: Math.round(newRate * 100),
        averageRankChange: Math.round(averageRankChange * 10) / 10,
        stabilityRate: Math.round(stabilityRate * 100),
        competition,
        momentumScore,
        dataSufficiency,
        evidenceLevel,
        opportunityScore: score,
        scoreRange,
        sampleWarning,
        formulaVersion: "fanqie-opportunity-v2",
        confidence,
        recommendation,
      };
    })
    .sort((a, b) => (b.opportunityScore ?? -1) - (a.opportunityScore ?? -1));
  return {
    snapshotCount: successful.length,
    sampleSize: entries.length,
    timeRange: range,
    confidence:
      successful.length >= 7 && entries.length >= 100
        ? "高"
        : successful.length >= 2 && entries.length >= 20
          ? "中"
          : "低",
    genreDistribution: countBy(entries.map((entry) => entry.genre)),
    wordBands: countBy(bands),
    statusDistribution: countBy(entries.map((entry) => entry.status)),
    newEntrants,
    movers,
    continuousAppearances: [...appearances.values()]
      .filter((item) => item.snapshots > 1)
      .sort((a, b) => b.snapshots - a.snapshots),
    marketOpportunities,
  };
}
