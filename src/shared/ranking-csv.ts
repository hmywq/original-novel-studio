import Papa from "papaparse";
import { parseStoryNumber } from "./story-constraints";
import type { RankingSnapshot } from "./types";

interface ParseRankingCsvOptions {
  createId: () => string;
  capturedAt: string;
  strict?: boolean;
}

const RANK_HEADERS = ["排名", "rank"];
const TITLE_HEADERS = ["书名", "title"];

function value(row: Record<string, string>, keys: string[], fallback = ""): string {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== "") return row[key];
  }
  return fallback;
}

function parseNumber(raw: string): number {
  const text = String(raw).replace(/[,，\s]/g, "");
  if (!text) return 0;
  // 与资源守恒共用同一套中英文数量解析，避免“3千”“十万”被吞值。
  const parsed = parseStoryNumber(text);
  if (parsed !== null && Number.isFinite(parsed)) return Math.round(parsed);
  const fallback = text.match(/[-+]?\d+(?:\.\d+)?/);
  const numeric = fallback ? Number(fallback[0]) : 0;
  return Number.isFinite(numeric) ? numeric : 0;
}

function safeHttpUrl(raw: string) {
  try {
    const url = new URL(raw);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.toString() : "";
  } catch {
    return "";
  }
}

function parseReaderCount(raw: string): number | undefined {
  const text = raw.replace(/[,，\s]/g, "").replace(/人$/, "");
  if (!/^(?:\d+(?:\.\d+)?[十百千万亿]?|[零〇一二两三四五六七八九十百千万亿]+)$/.test(text)) return undefined;
  const parsed = parseNumber(text);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function parseRankingCsv(csvText: string, listName: string, options: ParseRankingCsvOptions): RankingSnapshot {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: options.strict ? "greedy" : true,
  });
  if (options.strict) {
    const headers = parsed.meta.fields ?? [];
    if (!RANK_HEADERS.some((key) => headers.includes(key)) || !TITLE_HEADERS.some((key) => headers.includes(key)))
      throw new Error("榜单 CSV 缺少排名和书名列");
    if (!parsed.data.length) throw new Error("榜单 CSV 没有书目数据");
  }
  if (parsed.errors.length && (options.strict || !parsed.data.length)) {
    throw new Error(parsed.errors[0].message);
  }

  const versions = new Set(parsed.data.map((row) => value(row, ["榜单版本", "sourceVersion"]).trim()).filter(Boolean));
  if (options.strict && versions.size > 1) throw new Error("单份榜单 CSV 只能包含一个榜单版本");
  const sourceVersion = versions.size === 1 ? versions.values().next().value : undefined;
  const snapshotId = options.createId();
  return {
    id: snapshotId,
    source: "CSV 手动导入",
    listName,
    capturedAt: options.capturedAt,
    status: parsed.errors.length ? "部分成功" : "成功",
    error: parsed.errors.length ? parsed.errors.map((error) => error.message).join("；") : null,
    ...(sourceVersion ? { sourceVersion } : {}),
    entries: parsed.data.map((row, index) => {
      const rawRank = value(row, RANK_HEADERS, options.strict ? "" : String(index + 1)).trim();
      const rawTitle = value(row, TITLE_HEADERS, options.strict ? "" : "未命名");
      const rank = options.strict ? Number(rawRank) : parseNumber(rawRank);
      const title = options.strict ? rawTitle.trim() : rawTitle;
      if (options.strict && (!/^\d+$/.test(rawRank) || !Number.isSafeInteger(rank) || rank < 1))
        throw new Error(`榜单 CSV 第 ${index + 2} 行的排名须为正整数`);
      if (options.strict && !title) throw new Error(`榜单 CSV 第 ${index + 2} 行缺少书名`);
      const readerCount = parseReaderCount(value(row, ["在读", "在读人数", "readerCount"]));
      return {
        id: options.createId(),
        snapshotId,
        rank,
        title,
        author: value(row, ["作者", "author"], "未知"),
        genre: value(row, ["题材", "分类", "genre"], "未分类"),
        words: parseNumber(value(row, ["字数", "words"])),
        status: value(row, ["状态", "status"], "未知"),
        tags: value(row, ["标签", "tags"])
          .split(/[、,，]/)
          .filter(Boolean),
        sourceUrl: safeHttpUrl(value(row, ["链接", "url", "sourceUrl"])),
        ...(value(row, ["平台", "platform"]).trim() ? { platform: value(row, ["平台", "platform"]).trim() } : {}),
        ...(readerCount !== undefined ? { readerCount } : {}),
      };
    }),
  };
}
