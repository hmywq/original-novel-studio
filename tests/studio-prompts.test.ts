import { describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";
import { AiService } from "../electron/ai-service";
import type { WorkspaceDatabase } from "../electron/database";
import { createBrowserApi } from "../src/lib/browser-api";
import { compileProjectChapterContext } from "../src/shared/context-compiler";
import { QUALITY_BENCHMARK } from "../src/shared/quality-benchmark-corpus";
import type { BookConceptInput, IncubationCandidate } from "../src/shared/types";

const seed = "换班前我收到两份正式的公交接驳图，只有一份对得上司机当天跑的路线。";
const stopped = new Error("已捕获请求");

interface PromptRequest {
  taskType: string;
  system: string;
  user: string;
  schema: ZodType;
}

function captureRequests() {
  const service = new AiService({} as WorkspaceDatabase, () => "test");
  vi.spyOn(service, "contextBudget").mockReturnValue({ budgetTokens: 32_000, windowTokens: 40_000 });
  const runner = vi
    .spyOn(service as unknown as { runJson(options: PromptRequest): Promise<unknown> }, "runJson")
    .mockRejectedValue(stopped);
  const prompt = () => runner.mock.calls.at(-1)![0];
  return { service, runner, prompt };
}

function conceptInput(lengthShape: string): BookConceptInput {
  return {
    genre: "都市脑洞",
    lengthShape,
    targetWords: lengthShape === "万字短篇" ? 10_000 : 300_000,
    wordsPerChapter: 2_000,
    updateCadence: "每日 2 章",
    candidateCount: 3,
    seed,
  };
}

async function sampleProject(lengthShape: string) {
  const project = await createBrowserApi().getProject("demo-project");
  project.contract = { ...project.contract, approved: true, lengthShape };
  project.summary = { ...project.summary, targetWords: 10_000, wordsPerChapter: 2000 };
  return project;
}

describe("创作篇幅模式的实际模型提示", () => {
  it("短剧候选锁定原脑洞，让机制、关系和代价分开走", async () => {
    const { service, prompt } = captureRequests();
    const commercialBoundary = `${"保留接驳图、首班出库限制及调度员和司机各自的责任。".repeat(5)}末尾仍由主角作出选择。`;
    await expect(service.generateBookConcepts({ ...conceptInput("短剧改编向"), commercialBoundary })).rejects.toBe(
      stopped,
    );
    expect(prompt().taskType).toBe("generate-book-concepts");
    expect(prompt().user).toContain(seed);
    expect(prompt().user).toContain(commercialBoundary);
    for (const criterion of ["短剧改编向", "保留", "信息边界", "能力代价", "前三集", "物证", "拍摄成本"]) {
      expect(prompt().system).toContain(criterion);
    }
  });

  it("盐言短篇在开书、扩写、全书结构与滚动章纲沿用万字五节主线", async () => {
    const { service, runner, prompt } = captureRequests();
    const input = conceptInput("万字短篇");
    await expect(service.generateBookConcepts(input)).rejects.toBe(stopped);
    expect(prompt().system).not.toContain("面向番茄小说");
    expect(prompt().system).toContain("盐言故事");
    expect(prompt().system).toContain("五节");
    expect(prompt().user).toContain(seed);

    const selected = { title: "首班改线", secondaryGenres: [], genreElements: [] } as unknown as IncubationCandidate;
    await expect(service.expandBookConcept(input, selected)).rejects.toBe(stopped);
    expect(prompt().system).toContain("证据");
    expect(prompt().system).toContain("第五节");

    const project = await sampleProject("万字短篇");
    await expect(service.generatePlanning(project, { mode: "全书结构", fromChapter: 1 })).rejects.toBe(stopped);
    expect(prompt().user).toContain("五节");
    const beat = {
      title: "在诊所归还铃铛",
      goal: "带着从旧消息里认出的铃铛去找当事人",
      conflict: "当事人不愿再公开自己的真实名字和经过",
      outcome: "她带回值班当日取得的新证词原件",
      targetWords: 2000,
    };
    const stages = Array.from({ length: 5 }, (_, index) => ({ ...beat, startChapter: index + 1 }));
    const volume = { ...beat, targetWords: 10_000 };
    expect(prompt().schema.safeParse({ stages, volumes: [volume] }).success).toBe(true);
    expect(prompt().schema.safeParse({ stages, volumes: [volume, volume] }).success).toBe(false);

    runner.mockResolvedValueOnce({ blocks: [{ ...beat, fromChapter: 1 }] });
    const rough = await service.generatePlanning(project, { mode: "全书粗纲", fromChapter: 1 });
    expect(rough.plans[0]).toMatchObject({ title: "第1–5章粗纲", targetWords: 10_000 });
    expect(prompt().user).toContain("第1–5章");
    expect(prompt().user).not.toContain("每个批次覆盖 10 章");
    await expect(
      service.generatePlanning(project, { mode: "后续章纲", fromChapter: 1, chapterCount: 10 }),
    ).rejects.toBe(stopped);
    expect(prompt().user).toContain("严格输出5个 chapters");
    expect(prompt().user).toContain("五节");
    await expect(service.generatePlanning(project, { mode: "后续章纲", fromChapter: 6 })).rejects.toThrow(
      "已到本书终局",
    );
  });

  it("终局正文明确回收故事承诺和行动后果", async () => {
    const { service, prompt } = captureRequests();
    const project = await sampleProject("万字短篇");
    const chapter = { ...project.chapters[0], number: 5 };
    await expect(
      service.draftChapter(project.summary.id, chapter, compileProjectChapterContext(project, chapter)),
    ).rejects.toBe(stopped);
    expect(prompt().user).toContain("本章是终局，结清开篇问题和行动后果");
    expect(prompt().system).not.toContain("愿意读下一章");
  });

  it.each(["短剧改编向", "万字短篇"])("真实正文入口从创作契约传递 %s 的提示", async (format) => {
    const { service, prompt } = captureRequests();
    const project = await sampleProject(format);
    const chapter = project.chapters[0];
    const context = compileProjectChapterContext(project, chapter);
    await expect(service.draftChapter(project.summary.id, chapter, context)).rejects.toBe(stopped);
    expect(prompt().system).toContain(format);
    expect(prompt().system).toContain(format === "短剧改编向" ? "小说正文" : "本篇承诺");
    if (format === "万字短篇") expect(prompt().system).not.toContain("完成一部长篇网文");
  });

  it("模式问题输成硬性时归为警告，有证据的知识边界问题仍是硬性", async () => {
    const { service, runner, prompt } = captureRequests();
    const project = await sampleProject("短剧改编向");
    const benchmark = QUALITY_BENCHMARK.cases.find(({ fixture }) => fixture.id === "short-drama-causal-hook")!;
    const chapter = { ...project.chapters[0], content: benchmark.fixture.chapter };
    const [formatIssue] = benchmark.baselineOutput.issues;
    runner.mockImplementation(async ({ schema }) =>
      schema.parse({
        issues: [
          { ...formatIssue, severity: "硬性" },
          { severity: "硬性", category: "知识边界", message: "角色提前取得信息", evidence: "调度台多了一张纸" },
        ],
        observations: [],
      }),
    );
    const result = await service.reviewChapter(project, chapter, compileProjectChapterContext(project, chapter));
    expect(prompt().system).toContain("短剧改编向");
    expect(prompt().system).toContain("观察");
    expect(result.issues.map(({ severity }) => severity)).toEqual(["警告", "硬性"]);
  });

  it("普通作品和近似标签继续走原候选与正文提示", async () => {
    const { service, prompt } = captureRequests();
    for (const lengthShape of ["长线连续", "短剧改编向 "]) {
      await expect(service.generateBookConcepts(conceptInput(lengthShape))).rejects.toBe(stopped);
      expect(prompt().system).toContain("面向番茄小说");
      expect(prompt().system).not.toContain("前三集");
      const project = await sampleProject(lengthShape);
      const chapter = project.chapters[0];
      await expect(
        service.draftChapter(project.summary.id, chapter, compileProjectChapterContext(project, chapter)),
      ).rejects.toBe(stopped);
      expect(prompt().system).toContain("完成一部长篇网文");
      expect(prompt().system).not.toContain("前三集");
    }
  });
});
