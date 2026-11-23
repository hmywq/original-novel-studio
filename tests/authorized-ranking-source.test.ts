import { afterEach, expect, it, vi } from "vitest";
import {
  captureFanqieOpeningSample,
  capturePublicRankingPage,
  parseAuthorizedRankingCsv,
} from "../electron/ranking-service";

const csvUrl = "https://publisher.example/feeds/ranking.csv?token=local-only";
const csv = "rank,title,author,words,readerCount,sourceVersion\n7,示例作品,示例作者,12.5万,23456,2026-11-17-v1";

function csvResponse(body: BodyInit = csv, headers: Record<string, string> = {}) {
  return new Response(body, { headers: { "content-type": "text/csv; charset=UTF-8", ...headers } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("saves the authorized CSV's supplied ranks and metadata without exposing the URL query", async () => {
  const fetch = vi.fn(async () => csvResponse());
  vi.stubGlobal("fetch", fetch);

  const snapshot = await capturePublicRankingPage(csvUrl, "站点导出榜");

  expect(snapshot).toMatchObject({
    status: "成功",
    source: "授权 CSV · publisher.example/feeds/ranking.csv",
    sourceVersion: "2026-11-17-v1",
    entries: [{ rank: 7, title: "示例作品", author: "示例作者", words: 125000, readerCount: 23456 }],
  });
  expect(JSON.stringify(snapshot)).not.toContain("local-only");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("gives identical CSV content the same source version when the export omits it", async () => {
  const fetch = vi.fn(async () => csvResponse("rank,title\n1,同一份榜单"));
  vi.stubGlobal("fetch", fetch);

  const first = await capturePublicRankingPage(csvUrl, "站点导出榜");
  const second = await capturePublicRankingPage(csvUrl, "站点导出榜");
  fetch.mockImplementation(async () => csvResponse("rank,title\n2,同一份榜单"));
  const changed = await capturePublicRankingPage(csvUrl, "站点导出榜");

  expect(first.sourceVersion).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(second.sourceVersion).toBe(first.sourceVersion);
  expect(changed.sourceVersion).not.toBe(first.sourceVersion);
});

it("identifies the same export across downloaded and local UTF-8 BOM input", async () => {
  const file = "\uFEFFrank,title\n3,导出的书目";
  vi.stubGlobal("fetch", async () => csvResponse(file));

  const local = parseAuthorizedRankingCsv(file, "本地文件");
  const downloaded = await capturePublicRankingPage(csvUrl, "同一导出");

  expect(local.sourceVersion).toBe(downloaded.sourceVersion);
});

it.each([
  ["https://fanqienovel.com/rank/1_2_1140", /番茄.*授权/],
  ["https://SUB.FANQIENOVEL.COM./ranking.csv", /番茄.*授权/],
  ["http://publisher.example/rank.csv", /HTTPS/],
  ["https://127.0.0.1/private.csv", /本机|私有/],
  ["https://publisher:local-only@publisher.example/rank.csv", /凭据/],
])("rejects invalid or unauthorized source %s before the first request", async (url, failure) => {
  const fetch = vi.fn(async () => csvResponse());
  vi.stubGlobal("fetch", fetch);

  const snapshot = await capturePublicRankingPage(url, "无效来源");

  expect(snapshot).toMatchObject({ status: "失败", entries: [] });
  expect(snapshot.error).toMatch(failure);
  expect(JSON.stringify(snapshot)).not.toContain("local-only");
  expect(fetch).not.toHaveBeenCalled();
});

it("rejects the official sample URL before retrieving any page", async () => {
  const fetch = vi.fn(async () => csvResponse());
  vi.stubGlobal("fetch", fetch);

  await expect(captureFanqieOpeningSample("https://fanqienovel.com/page/123")).rejects.toThrow(/授权/);
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["https://fanqienovel.com/rank", "https://cdn.publisher.example/rank.csv", "https://127.0.0.1/rank.csv"])(
  "refuses a source redirect to %s before requesting the target",
  async (location) => {
    const fetch = vi.fn(async () => new Response(null, { status: 302, headers: { location } }));
    vi.stubGlobal("fetch", fetch);

    const snapshot = await capturePublicRankingPage(csvUrl, "重定向来源");

    expect(snapshot).toMatchObject({ status: "失败", entries: [] });
    expect(snapshot.error).toMatch(/重定向/);
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

it("accepts a same-origin redirect to a CSV export", async () => {
  const fetch = vi
    .fn(async () => csvResponse())
    .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "/updated.csv" } }));
  vi.stubGlobal("fetch", fetch);

  const snapshot = await capturePublicRankingPage(csvUrl, "重定向来源");

  expect(snapshot).toMatchObject({ status: "成功", entries: [{ rank: 7, title: "示例作品" }] });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it.each([403, 429, 503])("returns actual HTTP %s without retrying", async (status) => {
  const fetch = vi.fn(async () => new Response(null, { status }));
  vi.stubGlobal("fetch", fetch);

  const snapshot = await capturePublicRankingPage(csvUrl, "受限来源");

  expect(snapshot).toMatchObject({ status: "失败", entries: [] });
  expect(snapshot.error).toContain(`HTTP ${status}`);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([
  ["HTML响应", () => new Response("<h1>登录后下载</h1>", { headers: { "content-type": "text/html" } }), /CSV/],
  ["错误表头", () => csvResponse("headline,other\n登录超时,请重试"), /书名|排名/],
  ["缺失榜位", () => csvResponse("rank,title\n,测试作品"), /排名/],
  ["无书目", () => csvResponse("rank,title\n"), /数据|书目/],
  ["非法 UTF-8", () => csvResponse(new Uint8Array([0xc3, 0x28])), /UTF-8/],
  ["超限响应声明", () => csvResponse(csv, { "content-length": "5000001" }), /5MB/],
])("rejects %s without recording any rows", async (_label, response, failure) => {
  vi.stubGlobal("fetch", async () => response());

  const snapshot = await capturePublicRankingPage(csvUrl, "异常来源");

  expect(snapshot).toMatchObject({ status: "失败", entries: [] });
  expect(snapshot.error).toMatch(failure);
});

it("enforces the byte cap while reading an unbounded stream", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(3_000_000));
      controller.enqueue(new Uint8Array(2_000_001));
      controller.close();
    },
  });
  vi.stubGlobal("fetch", async () => csvResponse(body));

  const snapshot = await capturePublicRankingPage(csvUrl, "超限来源");

  expect(snapshot).toMatchObject({ status: "失败", entries: [] });
  expect(snapshot.error).toContain("5MB");
});

it("records a timeout from a stalled export", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    async (_input: string | URL | Request, init?: RequestInit) =>
      await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
  );
  const capture = capturePublicRankingPage(csvUrl, "超时来源");

  await vi.runAllTimersAsync();
  const snapshot = await capture;

  expect(snapshot).toMatchObject({ status: "失败", entries: [] });
  expect(snapshot.error).toContain("超时");
});
