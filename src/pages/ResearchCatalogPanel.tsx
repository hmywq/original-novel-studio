import { Bookmark, BookOpen, ExternalLink, FileText, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Badge, Button, EmptyState, Field, Input, Modal, Select, Textarea } from "../components/UI";
import { describeError } from "../lib/error-message";
import { ideaReferenceUrl } from "../shared/idea-workbench";
import { RESEARCH_LEADS, RESEARCH_PLATFORMS } from "../shared/research-sources";
import type { AppApi, Genre, InsightPack, RankingSnapshot, ResearchBook, ResearchSelection } from "../shared/types";
import { GENRES } from "../shared/types";
import styles from "./ResearchCatalogPanel.module.css";

type LeadInput = Omit<ResearchSelection, "id" | "status" | "createdAt" | "updatedAt">;

interface CatalogProps {
  api: AppApi;
  selections: ResearchSelection[];
  books: ResearchBook[];
  rankings: RankingSnapshot[];
  onChanged: () => Promise<void>;
  onImport: (lead: ResearchSelection) => void;
  onInsight: (insight: InsightPack) => void;
  notify: (message: string, tone?: "success" | "error") => void;
}

export function ResearchCatalogPanel({
  api,
  selections,
  books,
  rankings,
  onChanged,
  onImport,
  onInsight,
  notify,
}: CatalogProps) {
  const [platformId, setPlatformId] = useState("");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"发现" | "已选书目">("发现");
  const [add, setAdd] = useState(false);
  const [notes, setNotes] = useState<ResearchSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const text = query.trim().toLowerCase();
  const platform = RESEARCH_PLATFORMS.find((item) => item.id === platformId);
  const matches = (lead: LeadInput) =>
    (!platformId || lead.platformId === platformId) &&
    [lead.title, lead.author, lead.note, ...lead.tags].some((value) => value.toLowerCase().includes(text));
  const known = (lead: LeadInput) =>
    selections.find(
      (item) => item.platformId === lead.platformId && item.url === lead.url && item.title === lead.title,
    );
  const suggested: LeadInput[] = RESEARCH_LEADS.map((lead) => ({
    ...lead,
    author: lead.author ?? "",
    tags: [...lead.tags],
  }));
  const imported: LeadInput[] = [];
  const seen = new Set<string>();
  for (const snapshot of rankings) {
    if (snapshot.status === "失败") continue;
    for (const entry of snapshot.entries) {
      const url = ideaReferenceUrl(entry.sourceUrl);
      if (!url || seen.has(url)) continue;
      const host = new URL(url).hostname;
      const boardPlatform =
        RESEARCH_PLATFORMS.find((item) => item.name === entry.platform) ??
        RESEARCH_PLATFORMS.find(
          (item) => new URL(item.url).hostname.split(".").slice(-2).join(".") === host.split(".").slice(-2).join("."),
        );
      if (!boardPlatform) continue;
      seen.add(url);
      imported.push({
        platformId: boardPlatform.id,
        title: entry.title,
        author: entry.author,
        url,
        note: `${snapshot.listName} · ${snapshot.capturedAt.slice(0, 10)} · 第 ${entry.rank} 名`,
        tags: entry.tags.slice(0, 6),
        kind: "已导入榜单书目",
      });
      if (imported.length >= 100) break;
    }
    if (imported.length >= 100) break;
  }
  const discovery = [...imported, ...suggested].filter(matches);
  const saved = selections.filter(matches);

  const save = async (input: LeadInput) => {
    const existing = known(input);
    if (existing) return existing;
    const now = new Date().toISOString();
    const savedSelection = await api.saveResearchSelection({
      ...input,
      id: crypto.randomUUID(),
      status: "待阅读",
      createdAt: now,
      updatedAt: now,
    });
    await onChanged();
    return savedSelection;
  };
  const choose = async (lead: LeadInput, intent: "save" | "import" | "note") => {
    setBusy(true);
    try {
      const selected = await save(lead);
      if (intent === "import") onImport(selected);
      if (intent === "note") setNotes(selected);
      if (intent === "save") notify(`已选入《${selected.title}》`);
    } catch (cause) {
      notify(describeError(cause), "error");
    } finally {
      setBusy(false);
    }
  };
  const mark = async (lead: ResearchSelection, status: ResearchSelection["status"]) => {
    setBusy(true);
    try {
      await api.saveResearchSelection({ ...lead, status, updatedAt: new Date().toISOString() });
      await onChanged();
    } catch (cause) {
      notify(describeError(cause), "error");
    } finally {
      setBusy(false);
    }
  };
  const cards = mode === "发现" ? discovery : saved;

  return (
    <div className={styles.panel}>
      <section className={styles.platforms} aria-label="选书平台">
        {RESEARCH_PLATFORMS.map((item) => (
          <article key={item.id} className={styles.platform}>
            <div>
              <button
                type="button"
                aria-pressed={platformId === item.id}
                onClick={() => setPlatformId(platformId === item.id ? "" : item.id)}
              >
                {item.name}
              </button>
              <a href={item.url} target="_blank" rel="noreferrer" aria-label={`打开${item.name}`}>
                <ExternalLink size={15} />
              </a>
            </div>
            <p>{item.description}</p>
          </article>
        ))}
      </section>
      <section className={styles.results} aria-label="选书和线索">
        <div className={styles.toolbar}>
          <Button
            variant={mode === "发现" ? "primary" : "secondary"}
            aria-pressed={mode === "发现"}
            onClick={() => setMode("发现")}
          >
            发现
          </Button>
          <Button
            variant={mode === "已选书目" ? "primary" : "secondary"}
            aria-pressed={mode === "已选书目"}
            onClick={() => setMode("已选书目")}
          >
            已选书目 ({selections.length})
          </Button>
          <Input
            aria-label="搜索书目或话题"
            placeholder="搜索书目或话题"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button variant="secondary" icon={<Plus size={16} />} onClick={() => setAdd(true)}>
            添加参考
          </Button>
        </div>
        {platform && (
          <div className={styles.tags}>
            <Button variant="ghost" aria-label="清除平台筛选" onClick={() => setPlatformId("")}>
              {platform.name} ×
            </Button>
            {platform.keywords.map((word) => (
              <Button key={word} variant="ghost" onClick={() => setQuery(query === word ? "" : word)}>
                {word}
              </Button>
            ))}
          </div>
        )}
        <p className={styles.caption}>
          {mode === "发现"
            ? "可浏览公开书目、编辑推荐与话题线索。榜单数据从已导入的快照读取。"
            : "在这里记录阅读进度、拆书笔记或导入样本。"}
        </p>
        {cards.length ? (
          <div className={styles.leads}>
            {cards.map((lead) => {
              const selected = known(lead);
              const source = RESEARCH_PLATFORMS.find((item) => item.id === lead.platformId);
              const link = ideaReferenceUrl(lead.url);
              const hasSample = books.some(
                (book) =>
                  (lead.url && book.sourceUrl === lead.url) ||
                  (book.title === lead.title && book.sourcePlatform === source?.name),
              );
              return (
                <article key={JSON.stringify([lead.platformId, lead.url, lead.title])} className={styles.lead}>
                  <div className={styles.tags}>
                    <Badge tone="accent">{source?.name ?? lead.platformId}</Badge>
                    <span>{lead.kind}</span>
                    {selected && <Badge>{selected.status}</Badge>}
                  </div>
                  <h3>{lead.title}</h3>
                  {lead.note && <p>{lead.note}</p>}
                  {!!lead.tags.length && <p className={styles.caption}>{lead.tags.join(" · ")}</p>}
                  <div className={styles.actions}>
                    {link && (
                      <a href={link} target="_blank" rel="noreferrer">
                        打开出处 <ExternalLink size={13} />
                      </a>
                    )}
                    {selected ? (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void mark(selected, selected.status === "已阅读" ? "待阅读" : "已阅读")}
                      >
                        {selected.status === "已阅读" ? "标为待阅读" : "标为已阅读"}
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        icon={<Bookmark size={15} />}
                        disabled={busy}
                        onClick={() => void choose(lead, "save")}
                      >
                        加入选书
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      icon={<FileText size={15} />}
                      disabled={busy}
                      onClick={() => void choose(lead, "note")}
                    >
                      写拆书笔记
                    </Button>
                    <Button variant="ghost" disabled={busy} onClick={() => void choose(lead, "import")}>
                      {hasSample ? "补充样本" : "导入样本"}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<BookOpen />}
            title={mode === "发现" ? "暂无匹配线索" : "还没有选中的书目"}
            description="清除筛选，或从平台页面复制一条参考链接。"
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery("");
                  setPlatformId("");
                }}
              >
                清除筛选
              </Button>
            }
          />
        )}
      </section>
      {add && (
        <AddReference
          platformId={platformId}
          onClose={() => setAdd(false)}
          onSave={async (lead) => {
            await save(lead);
            setAdd(false);
            setMode("已选书目");
            setPlatformId(lead.platformId);
            setQuery("");
            notify("参考已保存到选书清单");
          }}
        />
      )}
      {notes && (
        <StructureNotes
          lead={notes}
          onClose={() => setNotes(null)}
          onSave={async (input) => {
            const insight = await api.createInsight(input);
            setNotes(null);
            onInsight(insight);
            notify("拆书笔记已保存到脱敏洞察");
          }}
        />
      )}
    </div>
  );
}

function AddReference({
  platformId,
  onClose,
  onSave,
}: {
  platformId: string;
  onClose: () => void;
  onSave: (input: LeadInput) => Promise<void>;
}) {
  const [source, setSource] = useState(platformId || RESEARCH_PLATFORMS[0].id);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || busy) return;
    const link = ideaReferenceUrl(url);
    if (url.trim() && !link) {
      setError("来源链接需使用 HTTP 或 HTTPS。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave({
        title: title.trim(),
        author: author.trim(),
        url: link ?? "",
        platformId: source,
        note: note.trim(),
        kind: "作者选书",
        tags: Array.from(
          new Set(
            tags
              .split(/[、，,]/)
              .map((item) => item.trim().slice(0, 24))
              .filter(Boolean),
          ),
        ).slice(0, 6),
      });
    } catch (cause) {
      setError(describeError(cause));
      setBusy(false);
    }
  };
  return (
    <Modal title="添加选书参考" onClose={() => !busy && onClose()}>
      <form className="form-stack" onSubmit={(event) => void submit(event)}>
        <div className="form-grid two">
          <Field label="平台">
            <Select value={source} onChange={(event) => setSource(event.target.value)}>
              {RESEARCH_PLATFORMS.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="标题">
            <Input
              autoFocus
              required
              value={title}
              maxLength={150}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
        </div>
        <Field label="作者">
          <Input value={author} maxLength={100} onChange={(event) => setAuthor(event.target.value)} />
        </Field>
        <Field label="链接">
          <Input value={url} maxLength={2000} onChange={(event) => setUrl(event.target.value)} />
        </Field>
        <Field label="标签">
          <Input
            value={tags}
            maxLength={150}
            placeholder="用顿号隔开"
            onChange={(event) => setTags(event.target.value)}
          />
        </Field>
        <Field label="为什么值得跟踪">
          <Textarea rows={3} value={note} maxLength={600} onChange={(event) => setNote(event.target.value)} />
        </Field>
        {error && (
          <p role="alert" className="inline-warning">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button type="submit" disabled={busy || !title.trim()}>
            加入选书
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function StructureNotes({
  lead,
  onClose,
  onSave,
}: {
  lead: ResearchSelection;
  onClose: () => void;
  onSave: (input: Omit<InsightPack, "id" | "createdAt">) => Promise<void>;
}) {
  const [genre, setGenre] = useState<Genre>("都市脑洞");
  const [hook, setHook] = useState("");
  const [engine, setEngine] = useState("");
  const [payoff, setPayoff] = useState("");
  const [gap, setGap] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!engine.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSave({
        name: `结构笔记｜${lead.title.slice(0, 70)}`,
        genre,
        openingPromise: hook.trim(),
        conflictEngine: engine.trim(),
        longFormEngine: engine.trim(),
        retentionDevices: payoff.trim(),
        marketGap: gap.trim(),
        audienceNeed: "",
        emotionalRhythm: "",
        risks: "单份参考的人工观察",
        evidenceCount: 0,
        confidence: "低",
      });
    } catch (cause) {
      setError(describeError(cause));
      setBusy(false);
    }
  };
  return (
    <Modal title="记录拆书结构" onClose={() => !busy && onClose()} width={720}>
      <form className="form-stack" onSubmit={(event) => void submit(event)}>
        <p>《{lead.title}》</p>
        <Field label="题材">
          <Select value={genre} onChange={(event) => setGenre(event.target.value as Genre)}>
            {GENRES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </Select>
        </Field>
        <Field label="开篇承诺" hint="用自己的话记读者为什么会追下去。">
          <Textarea rows={2} value={hook} maxLength={800} onChange={(event) => setHook(event.target.value)} />
        </Field>
        <Field label="冲突怎么反复发生" hint="记动作、阻力和代价的结构，可省略人物和作品专名。">
          <Textarea
            required
            rows={3}
            value={engine}
            maxLength={800}
            onChange={(event) => setEngine(event.target.value)}
          />
        </Field>
        <Field label="伏笔怎么兑现">
          <Textarea rows={2} value={payoff} maxLength={800} onChange={(event) => setPayoff(event.target.value)} />
        </Field>
        <Field label="换一种写法" hint="打算换掉哪几项关系、场景、能力或结果？">
          <Textarea rows={2} value={gap} maxLength={800} onChange={(event) => setGap(event.target.value)} />
        </Field>
        {error && (
          <p role="alert" className="inline-warning">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button type="submit" disabled={busy || !engine.trim()}>
            保存结构笔记
          </Button>
        </div>
      </form>
    </Modal>
  );
}
