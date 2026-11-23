import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedAiRoute } from "../electron/ai/route-resolver";
import { AiService } from "../electron/ai-service";
import type { WorkspaceDatabase } from "../electron/database";
import type { Chapter, ContextPackage, ProjectDetail } from "../src/shared/types";

afterEach(() => vi.unstubAllGlobals());
const chapter: Chapter = {
  id: "chapter-2",
  number: 2,
  title: "封条",
  outline: "核对状态",
  content: "柜上的封条一直完好。",
  wordCount: 10,
  status: "待质检",
  batchMode: "逐章",
  isKeyChapter: false,
  revision: 1,
  updatedAt: "2026-11-19T00:00:00Z",
};
const project = { summary: { id: "project", genre: "都市脑洞" } } as ProjectDetail;
const context: ContextPackage = {
  contract: "",
  commercialGuidance: "",
  chapterIntent: "",
  expectationLedger: "",
  longTermMemory: "",
  volumeGoal: "",
  rollingOutline: "",
  recentSummary: "",
  relevantFacts: "",
  forbiddenKnowledge: "",
  authorStyle: "",
  estimatedTokens: 100,
  continuity: "我已经剪断了档案柜上的封条。",
  continuitySources: [
    { id: "prior-1", kind: "前文", authority: "待审前文", chapterNumber: 1, text: "我已经剪断了档案柜上的封条。" },
  ],
};
function database(): WorkspaceDatabase {
  return {
    getAiSettings: () => ({
      protocol: "openai-compatible",
      baseUrl: "https://api.example.com/v1",
      model: "deepseek-chat",
      hasApiKey: true,
      inputPricePerMillion: 0,
      outputPricePerMillion: 0,
    }),
    findAiJob: () => null,
    startAiJob: () => "quality-job",
    finishAiJob: vi.fn(),
  } as unknown as WorkspaceDatabase;
}
function response(value: unknown): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
const route = (contextWindow: number): ResolvedAiRoute => ({
  profileId: null,
  profileName: null,
  baseUrl: "https://api.example.com/v1",
  model: "review-small",
  apiKey: "secret",
  requiresKey: true,
  apiSurface: "openai-chat",
  authHeaders: {},
  extraHeaders: {},
  extraQuery: {},
  localEndpoint: false,
  contextWindow,
  maxOutputTokens: 4096,
  legacyProviderKey: null,
});

describe("automatic quality review request and evidence guards", () => {
  it("does not send HTTP when the full review request cannot fit the selected override window", async () => {
    const fetchMock = vi.fn(async () => response({ issues: [], observations: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const resolve = vi.fn((_role, override) => route(override?.model === "tiny" ? 512 : 32_000));
    const service = new AiService(database(), () => "secret", 120_000, 0, undefined, resolve);
    await expect(
      service.reviewChapter(project, chapter, context, { model: "tiny" }, { attemptPolicy: "single" }),
    ).rejects.toThrow(/上下文|窗口/);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(service.reviewChapter(project, chapter, context)).resolves.toMatchObject({ issues: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(sent.max_tokens).toBeLessThanOrEqual(4096);
  });
  it("downgrades an explicit continuity claim without a prior evidence object even under a legacy hard category", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response({
          issues: [
            {
              severity: "硬性",
              category: "事实冲突",
              message: "跨章剪断封条的动作冲突",
              evidence: chapter.content,
              continuityConflictConfirmed: true,
              continuityEvidence: null,
            },
          ],
          observations: [],
        }),
      ),
    );
    const result = await new AiService(database(), () => "secret").reviewChapter(project, chapter, context);
    expect(result.issues[0].severity).toBe("警告");
    expect(result.issues[0].continuityEvidence).toBeUndefined();
  });
  it.each(["network", "structure", "compatibility"])("makes one HTTP attempt after %s failure", async (failure) => {
    const fetchMock = vi.fn(async () =>
      failure === "network"
        ? new Response("temporarily unavailable", { status: 503 })
        : failure === "compatibility"
          ? new Response("response_format json_object is not supported", { status: 400 })
          : response({ broken: true }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      new AiService(database(), () => "secret").reviewChapter(project, chapter, context, undefined, {
        attemptPolicy: "single",
      }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      confirmed: true,
      previousQuote: "我已经剪断了档案柜上的封条",
      currentQuote: "柜上的封条一直完好",
      severity: "硬性",
    },
    {
      confirmed: false,
      previousQuote: "我已经剪断了档案柜上的封条",
      currentQuote: "柜上的封条一直完好",
      severity: "警告",
    },
    { confirmed: true, previousQuote: "作者没有写过的前文", currentQuote: "柜上的封条一直完好", severity: "警告" },
    {
      confirmed: true,
      previousQuote: "我已经剪断了档案柜上的封条",
      currentQuote: "当前正文中没有的引文",
      severity: "警告",
    },
  ])("requires model conflict confirmation and two admitted original quotations: $severity", async (sample) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response({
          issues: [
            {
              severity: "硬性",
              category: "连续性",
              message: "同一档案柜的已完成剪封动作被否认",
              evidence: "柜上的封条一直完好",
              continuityConflictConfirmed: sample.confirmed,
              continuityEvidence: {
                sourceId: "prior-1",
                previousQuote: sample.previousQuote,
                currentQuote: sample.currentQuote,
                conflictKind: "动作",
              },
            },
          ],
          observations: [],
        }),
      ),
    );
    const result = await new AiService(database(), () => "secret").reviewChapter(project, chapter, context);
    expect(result.issues[0].severity).toBe(sample.severity);
    const verified =
      sample.previousQuote === "我已经剪断了档案柜上的封条" && sample.currentQuote === "柜上的封条一直完好";
    expect(result.issues[0].continuityEvidence?.sourceId).toBe(verified ? "prior-1" : undefined);
  });

  it("never turns a repeated-explanation or ending-payoff preference into a hard gate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response({
          issues: ["重复说理", "期待兑现"].map((category) => ({
            severity: "硬性",
            category,
            message: "阅读建议",
            evidence: "柜上的封条一直完好",
            continuityEvidence: null,
          })),
          observations: [],
        }),
      ),
    );
    const result = await new AiService(database(), () => "secret").reviewChapter(project, chapter, context);
    expect(result.issues.map((issue) => issue.severity)).toEqual(["警告", "警告"]);
  });

  it.each(["前文", "作者设定"] as const)(
    "requires an explicit approved viewpoint agreement for a viewpoint hard issue: %s",
    async (kind) => {
      const viewpointContext: ContextPackage = {
        ...context,
        continuitySources: [
          {
            id: "viewpoint",
            kind,
            authority: kind === "作者设定" ? "已确认" : "待审前文",
            chapterNumber: kind === "作者设定" ? null : 1,
            text: "本文采用第一人称叙述。",
          },
        ],
      };
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          response({
            issues: [
              {
                severity: "硬性",
                category: "契约视角",
                message: "明确视角约定与当前叙述冲突",
                evidence: chapter.content,
                continuityConflictConfirmed: true,
                continuityEvidence: {
                  sourceId: "viewpoint",
                  previousQuote: "本文采用第一人称叙述",
                  currentQuote: chapter.content,
                  conflictKind: "视角",
                },
              },
            ],
            observations: [],
          }),
        ),
      );
      const result = await new AiService(database(), () => "secret").reviewChapter(project, chapter, viewpointContext);
      expect(result.issues[0].severity).toBe(kind === "作者设定" ? "硬性" : "警告");
    },
  );
});
