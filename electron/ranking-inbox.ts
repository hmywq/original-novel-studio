import { randomUUID } from "node:crypto";
import { constants, mkdirSync } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { join, relative } from "node:path";
import type { RankingSnapshot } from "../src/shared/types";
import { parseAuthorizedRankingCsv, RANKING_CSV_BYTE_LIMIT } from "./ranking-service";

const INBOX_PREFIX = "inbox:";
const DIRECTORY = "rank-inbox";

export function isRankingInboxSource(source: string): boolean {
  return source.startsWith(INBOX_PREFIX);
}

export function parseRankingInboxFilename(source: string): string {
  const filename = source.slice(INBOX_PREFIX.length);
  const stem = filename.split(".", 1)[0].trim();
  if (
    !isRankingInboxSource(source) ||
    filename.length <= 4 ||
    filename.length > 200 ||
    filename !== filename.trim() ||
    !/\.csv$/i.test(filename) ||
    /[<>:"/\\|?*\p{Cc}]/u.test(filename) ||
    /%(?:00|2e|2f|5c)/i.test(filename) ||
    /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])$/i.test(stem)
  )
    throw new Error("本地榜单来源应为 inbox:文件名.csv，文件名不能包含路径");
  return filename;
}

export function initializeRankingInbox(workspaceRoot: string): void {
  try {
    mkdirSync(join(workspaceRoot, DIRECTORY));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST")
      throw new RankingInboxError("无法创建榜单收件箱，请检查工作区权限");
  }
}

class RankingInboxError extends Error {}

async function readRankingInboxCsv(workspaceRoot: string, filename: string): Promise<string> {
  initializeRankingInbox(workspaceRoot);
  const directory = join(await realpath(workspaceRoot), DIRECTORY);
  if (!(await lstat(directory)).isDirectory() || relative(directory, await realpath(directory)))
    throw new RankingInboxError("榜单收件箱目录必须为工作区内的普通目录，不能使用链接");
  const filePath = join(directory, filename);
  const before = await lstat(filePath);
  const unsafeFile = "榜单收件箱只读取普通 CSV 文件，不能使用链接";
  if (!before.isFile() || before.nlink !== 1) throw new RankingInboxError(unsafeFile);

  const handle = await open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const opened = await handle.stat();
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      before.dev !== opened.dev ||
      before.ino !== opened.ino ||
      relative(filePath, await realpath(filePath))
    )
      throw new RankingInboxError(unsafeFile);
    if (opened.size > RANKING_CSV_BYTE_LIMIT) throw new RankingInboxError("榜单 CSV 文件超过 5MB 限制");

    const buffer = Buffer.alloc(RANKING_CSV_BYTE_LIMIT + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > RANKING_CSV_BYTE_LIMIT) throw new RankingInboxError("榜单 CSV 文件超过 5MB 限制");
    const after = await handle.stat();
    if (length !== opened.size || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs)
      throw new RankingInboxError("榜单 CSV 正在写入，请在文件保存完成后重试");
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, length));
    } catch {
      throw new RankingInboxError("榜单 CSV 文件必须使用 UTF-8 编码");
    }
  } finally {
    await handle.close();
  }
}

export async function captureRankingInbox(
  source: string,
  listName: string,
  workspaceRoot?: string,
): Promise<RankingSnapshot> {
  const capturedAt = new Date().toISOString();
  let sourceLabel = "本地 CSV 收件箱";
  try {
    const filename = parseRankingInboxFilename(source);
    sourceLabel += ` · ${filename}`;
    if (!workspaceRoot) throw new Error("当前工作区未启用榜单收件箱");
    let csv: string;
    try {
      csv = await readRankingInboxCsv(workspaceRoot, filename);
    } catch (error) {
      if (error instanceof RankingInboxError) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") throw new Error("榜单收件箱中找不到指定的 CSV 文件");
      if (code === "ELOOP") throw new Error("榜单收件箱不能读取链接");
      throw new Error("无法读取榜单收件箱中的 CSV，请检查文件与工作区权限");
    }
    return { ...parseAuthorizedRankingCsv(csv, listName, capturedAt), source: sourceLabel };
  } catch (error) {
    return {
      id: randomUUID(),
      source: sourceLabel,
      listName,
      capturedAt,
      status: "失败",
      error: error instanceof Error ? error.message : String(error),
      entries: [],
    };
  }
}
