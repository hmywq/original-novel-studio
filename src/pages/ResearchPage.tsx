import { ClipboardPaste, Clock3, ExternalLink, FileInput, Link2, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button, Segmented } from "../components/UI";
import { describeError } from "../lib/error-message";
import type { IdeaStarter } from "../shared/idea-workbench";
import { RESEARCH_PLATFORMS } from "../shared/research-sources";
import type {
  AiSettings,
  AppApi,
  Genre,
  ImportPreview,
  InsightPack,
  InsightPackEdits,
  RankingAnalytics,
  RankingCaptureSchedule,
  RankingSnapshot,
  ResearchAnalysisRecord,
  ResearchBook,
  ResearchSelection,
} from "../shared/types";
import { GENRES } from "../shared/types";
import { ResearchBooksView } from "./ResearchBooksView";
import { ResearchCatalogPanel } from "./ResearchCatalogPanel";
import { ResearchInsightsView } from "./ResearchInsightsView";
import { ResearchKnowledgeView } from "./ResearchKnowledgeView";
import styles from "./ResearchPage.module.css";
import { type RankingSourceKind, ResearchRankingModals } from "./ResearchRankingModals";
import { ResearchRankingView } from "./ResearchRankingView";
import { ResearchSampleModals } from "./ResearchSampleModals";
import { ResearchWatchPanel } from "./ResearchWatchPanel";

type ResearchTab = "跨平台选书" | "榜单快照" | "热点关注" | "样本拆书" | "脱敏洞察" | "商业知识";

export function ResearchPage({
  api,
  notify,
  onTemplates,
  onIdea,
}: {
  api: AppApi;
  notify: (message: string, tone?: "success" | "error") => void;
  onTemplates: (query: string) => void;
  onIdea: (starter: IdeaStarter) => void;
}) {
  const [tab, setTab] = useState<ResearchTab>("跨平台选书");
  const [rankings, setRankings] = useState<RankingSnapshot[]>([]);
  const [analytics, setAnalytics] = useState<RankingAnalytics | null>(null);
  const [books, setBooks] = useState<ResearchBook[]>([]);
  const [selections, setSelections] = useState<ResearchSelection[]>([]);
  const [pendingSample, setPendingSample] = useState<ResearchSelection | null>(null);
  const [insights, setInsights] = useState<InsightPack[]>([]);
  const [rankingModal, setRankingModal] = useState(false);
  const [rankingCsv, setRankingCsv] = useState("");
  const [rankingName, setRankingName] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [sourceKind, setSourceKind] = useState<RankingSourceKind>("https");
  const [dailySync, setDailySync] = useState(true);
  const [inboxFile, setInboxFile] = useState("");
  const [authorizedUrl, setAuthorizedUrl] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [publicModal, setPublicModal] = useState(false);
  const [scheduleModal, setScheduleModal] = useState(false);
  const [rankingSchedules, setRankingSchedules] = useState<RankingCaptureSchedule[]>([]);
  const [scheduleFrequency, setScheduleFrequency] = useState<RankingCaptureSchedule["frequency"]>("每日");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [pasteModal, setPasteModal] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [genre, setGenre] = useState<Genre>(GENRES[0]);
  const [rights, setRights] = useState(false);
  const [cloud, setCloud] = useState(false);
  const [busyBook, setBusyBook] = useState<string | null>(null);
  const [analysisBook, setAnalysisBook] = useState<ResearchBook | null>(null);
  const [analyses, setAnalyses] = useState<ResearchAnalysisRecord[]>([]);
  const [pendingDeconstruct, setPendingDeconstruct] = useState<ResearchBook | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const sourceValue = sourceKind === "inbox" ? inboxFile : authorizedUrl;
  const source = sourceKind === "inbox" ? `inbox:${inboxFile.trim()}` : authorizedUrl.trim();
  const sourceReady =
    Boolean(rankingName.trim()) &&
    (sourceKind === "inbox" ? /^[^<>:"/\\|?*]+\.csv$/i.test(inboxFile.trim()) : /^https:\/\/\S+$/i.test(source));
  const sourceFields = {
    kind: sourceKind,
    value: sourceValue,
    name: rankingName,
    workspace,
    onKindChange: setSourceKind,
    onValueChange: sourceKind === "inbox" ? setInboxFile : setAuthorizedUrl,
    onNameChange: setRankingName,
  };

  const reload = useCallback(async () => {
    const [rankingData, rankingAnalytics, bookData, insightData, schedules, selected] = await Promise.all([
      api.listRankings(),
      api.getRankingAnalytics(),
      api.listResearchBooks(),
      api.listInsights(),
      api.listRankingSchedules(),
      api.listResearchSelections(),
    ]);
    setRankings(rankingData);
    setAnalytics(rankingAnalytics);
    setBooks(bookData);
    setInsights(insightData);
    setRankingSchedules(schedules);
    setSelections(selected);
  }, [api]);
  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    let active = true;
    void api
      .getWorkspacePath()
      .then((value) => {
        if (active) setWorkspace(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api]);

  useEffect(() => {
    if (tab !== "榜单快照" && tab !== "热点关注") return;
    let active = true;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void Promise.all([api.listRankings(), api.getRankingAnalytics(), api.listRankingSchedules()])
        .then(([snapshots, nextAnalytics, schedules]) => {
          if (!active) return;
          setRankings(snapshots);
          setAnalytics(nextAnalytics);
          setRankingSchedules(schedules);
        })
        .catch(() => undefined);
    }, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [api, tab]);

  const chooseFile = async () => {
    try {
      const result = await api.previewResearchFile();
      if (result) setPreview(result);
    } catch (error) {
      notify(describeError(error), "error");
    }
  };

  const deconstruct = async (book: ResearchBook) => {
    setBusyBook(book.id);
    try {
      await api.deconstructResearchBook(book.id);
      await reload();
      setTab("脱敏洞察");
      notify("拆书完成，已生成脱敏洞察包");
    } catch (error) {
      await api
        .listResearchBooks()
        .then(setBooks)
        .catch(() => undefined);
      notify(`拆书未完成，样本列表里可以重试：${describeError(error)}`, "error");
    } finally {
      setBusyBook(null);
    }
  };
  const requestDeconstruct = async (book: ResearchBook) => {
    if (!book.cloudConsent) {
      await deconstruct(book);
      return;
    }
    try {
      setAiSettings(await api.getAiSettings());
      setPendingDeconstruct(book);
    } catch (error) {
      notify(`无法打开云拆书确认：${describeError(error)}`, "error");
    }
  };

  const commitImport = async (analyze: boolean) => {
    if (!preview || !rights || importing) return;
    setImporting(true);
    try {
      const reference = pendingSample
        ? {
            title: pendingSample.title,
            author: pendingSample.author,
            url: pendingSample.url,
            platform:
              RESEARCH_PLATFORMS.find((item) => item.id === pendingSample.platformId)?.name ?? pendingSample.platformId,
          }
        : undefined;
      const book = await api.importResearchBook({ ...preview, reference }, genre, rights, cloud);
      setBooks((current) => [book, ...current.filter((item) => item.id !== book.id)]);
      setPreview(null);
      setRights(false);
      setCloud(false);
      setPendingSample(null);
      setPastedText("");
      if (analyze) await requestDeconstruct(book);
      else notify("样本已导入研究隔离区");
    } catch (error) {
      notify(describeError(error), "error");
    } finally {
      setImporting(false);
    }
  };

  const importRankingSnapshot = async () => {
    try {
      await api.importRankingCsv(rankingCsv, rankingName);
      setRankingModal(false);
      setRankingCsv("");
      await reload();
      notify("榜单快照已保存");
    } catch (error) {
      notify(describeError(error), "error");
    }
  };

  const capturePublicRanking = async () => {
    if (!sourceReady || syncBusy) return;
    setSyncBusy(true);
    try {
      const listName = rankingName.trim();
      const existing = rankingSchedules.find((task) => task.url === source && task.listName === listName);
      const schedule = dailySync
        ? existing?.enabled && existing.frequency === "每日"
          ? existing
          : await api.saveRankingSchedule({ id: existing?.id, url: source, listName, frequency: "每日", enabled: true })
        : undefined;
      if (schedule) setRankingSchedules((current) => [schedule, ...current.filter((item) => item.id !== schedule.id)]);
      const snapshot = schedule
        ? await api.runRankingSchedule(schedule.id)
        : await api.capturePublicRanking(source, listName);
      await reload();
      if (snapshot.status === "失败") {
        const message = snapshot.error ?? "同步失败";
        notify(schedule ? `每日更新已开启，本次未同步：${message}` : message, "error");
        return;
      }
      setPublicModal(false);
      notify(
        schedule
          ? `已同步 ${snapshot.entries.length} 条榜单书目，每日更新已开启`
          : rankings.some((row) => row.id === snapshot.id)
            ? "来源内容和上次相同，已保留原快照"
            : `已同步 ${snapshot.entries.length} 条榜单书目`,
      );
    } catch (error) {
      notify(describeError(error), "error");
    } finally {
      setSyncBusy(false);
    }
  };

  const addRankingSchedule = async () => {
    if (!sourceReady || syncBusy) return;
    if (rankingSchedules.some((task) => task.url === source && task.listName === rankingName.trim())) {
      notify("这个榜单数据源已有任务，可在下方启用或立即运行", "error");
      return;
    }
    setSyncBusy(true);
    try {
      await api.saveRankingSchedule({
        url: source,
        listName: rankingName,
        frequency: scheduleFrequency,
        enabled: true,
      });
      await reload();
      notify("定时采榜任务已保存");
    } catch (error) {
      notify(describeError(error), "error");
    } finally {
      setSyncBusy(false);
    }
  };

  const toggleRankingSchedule = async (schedule: RankingCaptureSchedule, enabled: boolean) => {
    try {
      await api.saveRankingSchedule({
        id: schedule.id,
        url: schedule.url,
        listName: schedule.listName,
        frequency: schedule.frequency,
        enabled,
      });
      await reload();
    } catch (error) {
      notify(describeError(error), "error");
    }
  };

  const runRankingSchedule = async (schedule: RankingCaptureSchedule) => {
    if (runningId) return;
    setRunningId(schedule.id);
    try {
      const snapshot = await api.runRankingSchedule(schedule.id);
      await reload();
      if (snapshot.status === "失败") notify(snapshot.error ?? "采集失败，已记录。", "error");
      else
        notify(
          rankings.some((row) => row.id === snapshot.id)
            ? "来源内容和上次相同，已保留原快照"
            : `同步${snapshot.status}，保存 ${snapshot.entries.length} 本书`,
        );
    } catch (error) {
      await api
        .listRankingSchedules()
        .then(setRankingSchedules)
        .catch(() => undefined);
      notify(describeError(error), "error");
    } finally {
      setRunningId(null);
    }
  };

  const deleteRankingSchedule = async (schedule: RankingCaptureSchedule) => {
    try {
      await api.deleteRankingSchedule(schedule.id);
      await reload();
    } catch (error) {
      notify(describeError(error), "error");
    }
  };

  const saveInsightEdits = async (id: string, edits: InsightPackEdits) => {
    const updated = await api.updateInsight(id, edits);
    try {
      setInsights(await api.listInsights());
    } catch {
      setInsights((current) => current.map((insight) => (insight.id === id ? updated : insight)));
    }
    notify("洞察校正已保存");
  };

  const developInsight = (insight: InsightPack) =>
    onIdea({
      title: "从一条拆书结构展开",
      original: `我想借这条结构写一个原创故事：${insight.conflictEngine.slice(0, 500)}${insight.marketGap ? `\n想试的区别：${insight.marketGap.slice(0, 300)}` : ""}`,
      keep: "使用可迁移的结构，重建人物、动机、事件与句子。",
      source: "市场线索",
      reference: `${insight.name} · 研究库洞察`,
      tags: [insight.genre],
      insightIds: [insight.id],
    });

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">市场研究区</p>
          <h1>榜单、样本与洞察</h1>
          <p>原始文本停留在研究库，创作区只接收脱敏后的结构洞察。</p>
        </div>
      </header>
      <div className="toolbar-row">
        <Segmented
          options={["跨平台选书", "榜单快照", "热点关注", "样本拆书", "脱敏洞察", "商业知识"] as const}
          value={tab}
          onChange={setTab}
        />
        <div className={styles.toolbarActions}>
          {(tab === "跨平台选书" || tab === "榜单快照" || tab === "热点关注") && (
            <>
              <a className="button button-ghost" href="https://fanqienovel.com/rank/" target="_blank" rel="noreferrer">
                <ExternalLink size={16} /> 打开番茄榜
              </a>
              <Button variant="secondary" icon={<Clock3 size={17} />} onClick={() => setScheduleModal(true)}>
                定时采榜
              </Button>
              <Button variant="secondary" icon={<Link2 size={17} />} onClick={() => setPublicModal(true)}>
                同步榜单源
              </Button>
              <Button icon={<Upload size={17} />} onClick={() => setRankingModal(true)}>
                导入榜单 CSV
              </Button>
            </>
          )}
          {tab === "样本拆书" && (
            <>
              <Button variant="secondary" icon={<ClipboardPaste size={17} />} onClick={() => setPasteModal(true)}>
                粘贴文本
              </Button>
              <Button icon={<FileInput size={17} />} onClick={chooseFile}>
                导入样本
              </Button>
            </>
          )}
        </div>
      </div>

      {tab === "跨平台选书" && (
        <ResearchCatalogPanel
          api={api}
          selections={selections}
          books={books}
          rankings={rankings}
          onChanged={reload}
          notify={notify}
          onImport={(selection) => {
            setPendingSample(selection);
            setPastedText("");
            setTab("样本拆书");
            setPasteModal(true);
          }}
          onInsight={(insight) => {
            setInsights((current) => [insight, ...current]);
            setTab("脱敏洞察");
          }}
        />
      )}

      {tab === "榜单快照" && (
        <ResearchRankingView
          analytics={analytics}
          rankings={rankings}
          onOpenPublicRanking={() => setPublicModal(true)}
        />
      )}
      {tab === "热点关注" && (
        <ResearchWatchPanel
          snapshots={rankings}
          onScan={() => setPublicModal(true)}
          onTemplates={onTemplates}
          onIdea={onIdea}
        />
      )}
      {tab === "样本拆书" && (
        <>
          {pendingSample && (
            <div className="inline-warning">
              准备导入《{pendingSample.title}》的样本{" "}
              <Button variant="ghost" onClick={() => setPendingSample(null)}>
                清除关联
              </Button>
            </div>
          )}
          <ResearchBooksView
            books={books}
            busyBookId={busyBook}
            onChooseFile={chooseFile}
            onOpenAnalysis={async (book) => {
              setAnalyses(await api.listResearchAnalyses(book.id));
              setAnalysisBook(book);
            }}
            onRequestDeconstruct={requestDeconstruct}
          />
        </>
      )}
      {tab === "脱敏洞察" && (
        <ResearchInsightsView insights={insights} onDevelop={developInsight} onSave={saveInsightEdits} />
      )}
      {tab === "商业知识" && <ResearchKnowledgeView />}

      <ResearchRankingModals
        importModal={{
          open: rankingModal,
          rankingName,
          rankingCsv,
          onRankingNameChange: setRankingName,
          onRankingCsvChange: setRankingCsv,
          onClose: () => setRankingModal(false),
          onSave: () => void importRankingSnapshot(),
        }}
        publicModal={{
          open: publicModal,
          fields: sourceFields,
          ready: sourceReady,
          busy: syncBusy,
          dailySync,
          onDailySyncChange: setDailySync,
          onClose: () => setPublicModal(false),
          onCapture: () => void capturePublicRanking(),
        }}
        scheduleModal={{
          open: scheduleModal,
          fields: sourceFields,
          ready: sourceReady,
          busy: syncBusy,
          frequency: scheduleFrequency,
          schedules: rankingSchedules,
          runningId,
          onFrequencyChange: setScheduleFrequency,
          onClose: () => setScheduleModal(false),
          onAdd: () => void addRankingSchedule(),
          onToggle: (schedule, enabled) => void toggleRankingSchedule(schedule, enabled),
          onRun: (schedule) => void runRankingSchedule(schedule),
          onDelete: (schedule) => void deleteRankingSchedule(schedule),
        }}
      />
      <ResearchSampleModals
        pasteModal={{
          open: pasteModal,
          text: pastedText,
          onTextChange: setPastedText,
          onClose: () => setPasteModal(false),
          onPreview: (nextPreview) => {
            setPreview(nextPreview);
            setPasteModal(false);
          },
        }}
        importPreviewModal={{
          preview,
          genre,
          rightsConfirmed: rights,
          cloudConsent: cloud,
          busy: importing,
          onGenreChange: setGenre,
          onRightsConfirmedChange: setRights,
          onCloudConsentChange: setCloud,
          onClose: () => {
            setPreview(null);
            setRights(false);
            setCloud(false);
          },
          onCommit: (analyze) => void commitImport(analyze),
        }}
        analysisModal={{
          book: analysisBook,
          analyses,
          onClose: () => setAnalysisBook(null),
        }}
        cloudDeconstructModal={{
          book: pendingDeconstruct,
          aiSettings,
          onClose: () => setPendingDeconstruct(null),
          onConfirm: () => {
            if (!pendingDeconstruct) return;
            const book = pendingDeconstruct;
            setPendingDeconstruct(null);
            void deconstruct(book);
          },
        }}
      />
    </div>
  );
}
