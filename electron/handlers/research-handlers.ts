import { randomUUID } from "node:crypto";
import {
  completeRankingSchedule,
  dailyRankingRun,
  failRankingSchedule,
  nextRankingRun,
} from "../../src/shared/ranking-schedule";
import { prepareLocalResearchBook } from "../../src/shared/research-import-service";
import type {
  AppApi,
  ImportPreview,
  InsightPack,
  InsightPackEdits,
  RankingCaptureSchedule,
  RankingSnapshot,
  ResearchBook,
} from "../../src/shared/types";
import type { AiService } from "../ai-service";
import { now, type WorkspaceDatabase } from "../database";
import { captureRankingInbox, initializeRankingInbox, isRankingInboxSource } from "../ranking-inbox";
import {
  analyzeRankings,
  captureFanqieOpeningSample,
  capturePublicRankingPage,
  parseAuthorizedRankingCsv,
} from "../ranking-service";
import type { BackgroundWorker } from "../worker-client";
import type { RegisterHandler } from "./types";

type ResearchDatabase = Pick<
  WorkspaceDatabase,
  | "deleteRankingSchedule"
  | "getResearchBook"
  | "listInsights"
  | "listRankingSchedules"
  | "listRankings"
  | "listResearchAnalyses"
  | "listResearchBooks"
  | "listResearchSelections"
  | "saveInsight"
  | "saveRanking"
  | "saveRankingSchedule"
  | "saveResearchAnalyses"
  | "saveResearchBook"
  | "saveResearchSelection"
  | "updateResearchBook"
>;

export interface ResearchHandlerDependencies {
  register: RegisterHandler;
  database: ResearchDatabase;
  ai: Pick<AiService, "deconstruct">;
  worker: Pick<BackgroundWorker, "run">;
  chooseResearchFile: () => Promise<string | null>;
  workspaceRoot?: string;
}

export interface ResearchHandlerRuntime {
  runDueRankingSchedules: () => Promise<void>;
}

export function registerResearchHandlers({
  register,
  database,
  ai,
  worker,
  chooseResearchFile,
  workspaceRoot,
}: ResearchHandlerDependencies): ResearchHandlerRuntime {
  if (workspaceRoot) {
    try {
      initializeRankingInbox(workspaceRoot);
    } catch {
      // Capture retries initialization and reports any persistent filesystem error.
    }
  }
  const captureRanking = (source: string, listName: string) =>
    isRankingInboxSource(source)
      ? captureRankingInbox(source, listName, workspaceRoot)
      : capturePublicRankingPage(source, listName);
  const saveRankingIfChanged = (snapshot: RankingSnapshot) => {
    if (snapshot.status === "成功" && snapshot.sourceVersion) {
      const latest = database
        .listRankings()
        .find(
          (previous) =>
            previous.status === "成功" &&
            previous.source === snapshot.source &&
            previous.listName === snapshot.listName,
        );
      if (latest?.sourceVersion === snapshot.sourceVersion) return latest;
    }
    database.saveRanking(snapshot);
    return snapshot;
  };
  const runningSchedules = new Map<string, { superseded: boolean }>();
  const findSchedule = (id: string) => database.listRankingSchedules().find((item) => item.id === id);

  const supersedeRunningSchedule = (id: string) => {
    const running = runningSchedules.get(id);
    if (running) running.superseded = true;
  };

  const runRankingSchedule = async (schedule: RankingCaptureSchedule) => {
    if (runningSchedules.has(schedule.id)) throw new Error("该榜单任务正在采集，请稍后再试");
    const run = { superseded: false };
    runningSchedules.set(schedule.id, run);
    try {
      const snapshot = await captureRanking(schedule.url, schedule.listName);
      if (run.superseded) throw new Error("采榜任务已更改，采集结果已丢弃");
      const saved = saveRankingIfChanged(snapshot);
      database.saveRankingSchedule(completeRankingSchedule(schedule, snapshot));
      return saved;
    } catch (error) {
      if (!run.superseded) database.saveRankingSchedule(failRankingSchedule(schedule, error));
      throw error;
    } finally {
      runningSchedules.delete(schedule.id);
    }
  };

  const runDueRankingSchedules = async () => {
    for (const { id } of database.listRankingSchedules()) {
      // Each capture can yield to a manual run or an edit of the next schedule in the loop.
      let schedule = findSchedule(id);
      if (!schedule?.enabled || runningSchedules.has(id)) continue;
      const current = new Date();
      if (schedule.frequency === "每日") {
        const nextRunAt = dailyRankingRun(schedule.lastRunAt, current, schedule.nextRunAt);
        if (nextRunAt !== schedule.nextRunAt) schedule = database.saveRankingSchedule({ ...schedule, nextRunAt });
      }
      if (!(Date.parse(schedule.nextRunAt) <= current.getTime())) continue;
      try {
        await runRankingSchedule(schedule);
      } catch {
        // The shared runner records failures and leaves edited or deleted schedules alone.
      }
    }
  };

  register("listRankings", () => database.listRankings());
  register("importRankingCsv", (csvText, listName) =>
    saveRankingIfChanged(parseAuthorizedRankingCsv(csvText, listName)),
  );
  register("capturePublicRanking", async (url, listName) => saveRankingIfChanged(await captureRanking(url, listName)));
  register("listRankingSchedules", () => database.listRankingSchedules());
  register("saveRankingSchedule", (input: Parameters<AppApi["saveRankingSchedule"]>[0]) => {
    const existing = input.id ? findSchedule(input.id) : undefined;
    const restartCycle = !existing || existing.frequency !== input.frequency || (!existing.enabled && input.enabled);
    const lastRunAt = existing?.lastRunAt ?? null;
    const current = new Date();
    let nextRunAt = existing?.nextRunAt;
    if (restartCycle || !nextRunAt) {
      nextRunAt =
        input.frequency === "每日" ? dailyRankingRun(lastRunAt, current) : nextRankingRun(input.frequency, current);
    }
    const saved = database.saveRankingSchedule({
      id: input.id || randomUUID(),
      url: input.url,
      listName: input.listName,
      frequency: input.frequency,
      enabled: input.enabled,
      lastRunAt,
      nextRunAt,
      lastStatus: existing?.lastStatus ?? "未运行",
      lastError: existing?.lastError ?? null,
    });
    if (
      existing &&
      (existing.url !== input.url ||
        existing.listName !== input.listName ||
        existing.frequency !== input.frequency ||
        existing.enabled !== input.enabled)
    ) {
      supersedeRunningSchedule(saved.id);
    }
    return saved;
  });
  register("runRankingSchedule", async (id) => {
    const schedule = findSchedule(id);
    if (!schedule) throw new Error("定时采榜任务不存在");
    return runRankingSchedule(schedule);
  });
  register("deleteRankingSchedule", (id) => {
    database.deleteRankingSchedule(id);
    supersedeRunningSchedule(id);
  });
  register("getRankingAnalytics", () => analyzeRankings(database.listRankings()));
  register("listResearchSelections", () => database.listResearchSelections());
  register("saveResearchSelection", (input) => database.saveResearchSelection(input));
  register("listResearchBooks", () => database.listResearchBooks());
  register("previewResearchFile", async () => {
    const filePath = await chooseResearchFile();
    if (!filePath) return null;
    return worker.run<ImportPreview>("parse-document", { filePath });
  });
  register("importResearchBook", (preview, genre, rightsConfirmed, cloudConsent) => {
    const book = prepareLocalResearchBook(preview, genre, rightsConfirmed, cloudConsent, {
      createId: randomUUID,
      currentTimestamp: now,
    });
    database.saveResearchBook(book, preview.chapters);
    return book;
  });
  register("importPublicResearchSample", async (sourceUrl, genre, cloudConsent) => {
    const sample = await captureFanqieOpeningSample(sourceUrl);
    const book: ResearchBook = {
      id: randomUUID(),
      title: sample.title,
      author: sample.author,
      genre,
      sourceType: "公开试读",
      sourceUrl: sample.sourceUrl,
      sampleScope: `官方公开前 ${sample.chapters.length} 章，仅代表开篇样本`,
      chapterCount: sample.chapters.length,
      wordCount: sample.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
      rightsConfirmed: false,
      cloudConsent,
      importedAt: now(),
      status: "待拆解",
    };
    database.saveResearchBook(book, sample.chapters);
    return book;
  });
  register("listInsights", () => database.listInsights());
  register("createInsight", (input) => {
    const insight: InsightPack = {
      ...input,
      id: randomUUID(),
      createdAt: now(),
    };
    database.saveInsight(insight);
    return insight;
  });
  register("updateInsight", (id, edits: InsightPackEdits) => {
    const existing = database.listInsights().find((item) => item.id === id);
    if (!existing) throw new Error("洞察不存在，可能已被移除");
    const updated = { ...existing, ...edits };
    database.saveInsight(updated);
    return updated;
  });
  register("deconstructResearchBook", async (bookId) => {
    const source = database.getResearchBook(bookId);
    database.updateResearchBook({ ...source.book, status: "拆解中" });
    try {
      const result = await ai.deconstruct(source.book, source.chapters);
      database.saveInsight(result.insight);
      database.saveResearchAnalyses(result.analyses);
      database.updateResearchBook({ ...source.book, status: "已拆解" });
      return result.insight;
    } catch (error) {
      database.updateResearchBook({ ...source.book, status: "失败" });
      throw error;
    }
  });
  register("listResearchAnalyses", (bookId) => database.listResearchAnalyses(bookId));

  return { runDueRankingSchedules };
}
