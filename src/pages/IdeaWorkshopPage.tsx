import { ArrowRight, BookOpen, Brain, ExternalLink, GitBranch, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Badge, Button, EmptyState, Field, Input, Modal, Select, Textarea } from "../components/UI";
import { describeError } from "../lib/error-message";
import { formatDate } from "../lib/format";
import { FANQIE_CATEGORY_PROFILES } from "../shared/fanqie-taxonomy";
import {
  type IdeaStarter,
  ideaReferenceUrl,
  ideaStarters,
  marketIdeaStarters,
  startIdeaDraft,
} from "../shared/idea-workbench";
import { IDEA_SOURCES, type IdeaRecord, type IncubationDraft } from "../shared/incubation";
import { isStudioFormat, STUDIO_FORMATS, type StudioFormat, studioFormatDefaults } from "../shared/studio-format";
import type { AppApi } from "../shared/types";
import styles from "./IdeaWorkshopPage.module.css";

const steps = ["待展开", "方案待选", "已立项", "搁置"] as const;
const tagOptions = [
  "BE",
  "HE",
  "开放式",
  "美强惨",
  "大女主",
  "独立成长",
  "虐恋",
  "纯爱",
  "CP拉扯",
  "复仇",
  "女性互助",
  "现实悬疑",
  "治愈",
];
function stepOf(draft: IncubationDraft) {
  if (draft.status === "已放弃") return "搁置";
  if (draft.createdProjectId) return "已立项";
  return draft.candidates.length ? "方案待选" : "待展开";
}

interface IdeaEditorInput {
  starter?: IdeaStarter;
  draft?: IncubationDraft;
  parent?: IncubationDraft;
}

interface IdeaWorkshopProps {
  api: AppApi;
  drafts: IncubationDraft[];
  initialStarter?: IdeaStarter | null;
  notify: (message: string, tone?: "success" | "error") => void;
  reload: () => Promise<void>;
  onDevelop: (draft: IncubationDraft) => void;
  onOpenProject: (id: string) => void;
}

export function IdeaWorkshopPage({
  api,
  drafts,
  initialStarter,
  notify,
  reload,
  onDevelop,
  onOpenProject,
}: IdeaWorkshopProps) {
  const [editor, setEditor] = useState<IdeaEditorInput | null>(initialStarter ? { starter: initialStarter } : null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [source, setSource] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const ideas = drafts.filter((item): item is IncubationDraft & { idea: IdeaRecord } => Boolean(item.idea));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = ideas.filter((draft) => {
    if (filter && stepOf(draft) !== filter) return false;
    if (source && draft.idea.source !== source) return false;
    return [draft.idea.title, draft.idea.original, draft.idea.keep, ...draft.idea.tags].some((value) =>
      value.toLocaleLowerCase().includes(normalizedQuery),
    );
  });

  const setAside = async (draft: IncubationDraft) => {
    setBusyId(draft.id);
    const restored = draft.status === "已放弃";
    try {
      await api.saveIncubation({
        ...draft,
        status: restored ? "孵化中" : "已放弃",
        updatedAt: new Date().toISOString(),
      });
      await reload();
      notify(restored ? "已恢复到脑洞库" : "已搁置，可随时恢复");
    } catch (cause) {
      notify(describeError(cause), "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>脑洞库</h1>
          <p>记下一个怪念头、一次生活观察或一条市场线索，再把值得写的想法展开成备选故事。</p>
        </div>
        <Button icon={<Plus size={17} />} onClick={() => setEditor({})}>
          记脑洞
        </Button>
      </header>
      <div className={styles.workspace}>
        <section aria-label="我的脑洞" className={styles.collection}>
          <div className={styles.filters}>
            <Field label="搜索脑洞">
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="社区、物证、职业…" />
            </Field>
            <Field label="进度">
              <Select value={filter} onChange={(event) => setFilter(event.target.value)}>
                <option value="">全部进度</option>
                {steps.map((step) => (
                  <option key={step}>{step}</option>
                ))}
              </Select>
            </Field>
            <Field label="来源">
              <Select value={source} onChange={(event) => setSource(event.target.value)}>
                <option value="">全部来源</option>
                {IDEA_SOURCES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </Select>
            </Field>
          </div>
          {visible.length ? (
            visible.map((draft) => {
              const idea = draft.idea;
              const parent = ideas.find((item) => item.id === idea.parentId)?.idea;
              const link = ideaReferenceUrl(idea.referenceUrl);
              return (
                <article key={draft.id} className={styles.idea}>
                  <div className={styles.meta}>
                    <Badge tone={draft.createdProjectId ? "success" : "neutral"}>{stepOf(draft)}</Badge>
                    <span>
                      {draft.positioning.lengthShape} · {idea.source} · {formatDate(draft.updatedAt)}
                    </span>
                  </div>
                  <h2>{idea.title}</h2>
                  <p className={styles.original}>{idea.original}</p>
                  {idea.keep && (
                    <p>
                      <strong>要保留</strong> {idea.keep}
                    </p>
                  )}
                  {parent && (
                    <p>
                      <strong>来源脑洞</strong> {parent.title}
                    </p>
                  )}
                  {(idea.reference || link) && (
                    <p className={styles.reference}>
                      {idea.reference}
                      {link && (
                        <a href={link} target="_blank" rel="noreferrer">
                          查看来源 <ExternalLink size={12} />
                        </a>
                      )}
                    </p>
                  )}
                  {!!idea.tags.length && (
                    <ul className={styles.tags}>
                      {idea.tags.map((tag) => (
                        <li key={tag}>{tag}</li>
                      ))}
                    </ul>
                  )}
                  <div className={styles.actions}>
                    {draft.createdProjectId ? (
                      <Button
                        variant="secondary"
                        icon={<BookOpen size={15} />}
                        onClick={() => onOpenProject(draft.createdProjectId!)}
                      >
                        打开作品
                      </Button>
                    ) : (
                      draft.status === "孵化中" && (
                        <Button icon={<ArrowRight size={15} />} onClick={() => onDevelop(draft)}>
                          {draft.candidates.length ? `比较 ${draft.candidates.length} 套方案` : "展开为故事"}
                        </Button>
                      )
                    )}
                    {draft.status === "孵化中" && (
                      <Button variant="secondary" onClick={() => setEditor({ draft })}>
                        编辑卡片
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      icon={<GitBranch size={15} />}
                      onClick={() => setEditor({ parent: draft, starter: idea })}
                    >
                      派生新方向
                    </Button>
                    {!draft.createdProjectId && (
                      <Button variant="ghost" disabled={busyId !== null} onClick={() => void setAside(draft)}>
                        {draft.status === "已放弃" ? "恢复" : "搁置"}
                      </Button>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <EmptyState
              icon={<Brain />}
              title={ideas.length ? "没有符合筛选的脑洞" : "从一句想法开始"}
              description={
                ideas.length ? "换个关键词、来源或进度试试。" : "比如公共菜园的工具柜还开着，今天却只有一人来签过字。"
              }
              action={<Button onClick={() => setEditor({})}>新建脑洞卡</Button>}
            />
          )}
        </section>
        <aside className={styles.inspiration} aria-label="寻找灵感">
          <h2>找灵感</h2>
          <p>拿一个可见物件或反常规则，问谁会受益、谁会失去，以及主角为什么今天必须行动。</p>
          <h3>近期市场线索</h3>
          {marketIdeaStarters.map((starter) => (
            <StarterCard key={starter.title} starter={starter} onUse={() => setEditor({ starter })} />
          ))}
          <details className={styles.exercises}>
            <summary>发散练习</summary>
            {ideaStarters.map((starter) => (
              <StarterCard key={starter.title} starter={starter} onUse={() => setEditor({ starter })} />
            ))}
          </details>
        </aside>
      </div>
      {editor && (
        <IdeaEditor
          api={api}
          editor={editor}
          onClose={() => setEditor(null)}
          onSaved={(draft, develop) => {
            setEditor(null);
            void reload().catch((error) => notify(describeError(error), "error"));
            if (develop) onDevelop(draft);
            else notify("脑洞已保存");
          }}
        />
      )}
    </div>
  );
}

function StarterCard({ starter, onUse }: { starter: IdeaStarter; onUse: () => void }) {
  return (
    <article className={styles.starter}>
      <strong>{starter.title}</strong>
      <p>{starter.original}</p>
      {starter.reference && <small>{starter.reference}</small>}
      <div className={styles.actions}>
        <Button variant="secondary" aria-label={`记为脑洞：${starter.title}`} onClick={onUse}>
          记为脑洞
        </Button>
        {starter.referenceUrl && (
          <a href={starter.referenceUrl} target="_blank" rel="noreferrer">
            来源 <ExternalLink size={12} />
          </a>
        )}
      </div>
    </article>
  );
}

function IdeaEditor({
  api,
  editor,
  onClose,
  onSaved,
}: {
  api: AppApi;
  editor: IdeaEditorInput;
  onClose: () => void;
  onSaved: (draft: IncubationDraft, develop: boolean) => void;
}) {
  const editing = editor.draft;
  const sourceDraft = editing ?? editor.parent;
  const starter = editing?.idea ?? editor.starter;
  const formatOf = sourceDraft?.positioning.lengthShape;
  const [format, setFormat] = useState<StudioFormat>(isStudioFormat(formatOf) ? formatOf : "短剧改编向");
  const [title, setTitle] = useState(
    editor.parent ? `${starter?.title.slice(0, 74) ?? "脑洞"}｜新分支` : (starter?.title ?? ""),
  );
  const [original, setOriginal] = useState(starter?.original ?? "");
  const [keep, setKeep] = useState(starter?.keep ?? "");
  const [source, setSource] = useState<IdeaRecord["source"]>(starter?.source ?? "自己的脑洞");
  const [reference, setReference] = useState(starter?.reference ?? "");
  const [referenceUrl, setReferenceUrl] = useState(starter?.referenceUrl ?? "");
  const [tags, setTags] = useState(starter?.tags.join("、") ?? "");
  const chosenTags = tags
    .split(/[、，,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  const [categoryKey, setCategoryKey] = useState(sourceDraft?.positioning.fanqieCategoryKey ?? "男频:262");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const frozen = !!editing?.candidates.length;

  const save = async (develop: boolean) => {
    if (busy || !original.trim()) return;
    if (referenceUrl.trim() && (!ideaReferenceUrl(referenceUrl) || referenceUrl.length > 2000)) {
      setError("请输入可打开的 HTTP 或 HTTPS 来源链接。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const now = new Date().toISOString();
      const next = startIdeaDraft(
        {
          title,
          original,
          keep,
          source,
          reference,
          referenceUrl,
          tags: tags.split(/[、，,]/),
          format,
          categoryKey,
          parentId: editor.parent?.id ?? editing?.idea?.parentId,
          insightIds: editor.starter?.insightIds ?? sourceDraft?.evidence.insightIds,
        },
        editing?.id ?? crypto.randomUUID(),
        now,
      );
      const draft = editing
        ? {
            ...editing,
            idea: next.idea,
            updatedAt: now,
            ...(!frozen
              ? {
                  seed: original.trim() === editing.idea?.original ? editing.seed : next.seed,
                  positioning:
                    format === editing.positioning.lengthShape && categoryKey === editing.positioning.fanqieCategoryKey
                      ? {
                          ...editing.positioning,
                          commercialBoundary: keep.trim(),
                          genreElements: next.positioning.genreElements,
                        }
                      : next.positioning,
                }
              : {}),
          }
        : next;
      onSaved(await api.saveIncubation(draft), develop);
    } catch (cause) {
      setError(describeError(cause));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={editing ? "编辑脑洞" : editor.parent ? "派生脑洞" : "记一个脑洞"}
      width={730}
      onClose={() => !busy && onClose()}
    >
      <form
        className="form-stack"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void save(false);
        }}
      >
        <Field label="原始脑洞" hint={frozen ? "已有方案。可以派生一张卡试新的前提。" : "可以只写一句。"}>
          <Textarea
            autoFocus
            required
            rows={4}
            maxLength={1600}
            value={original}
            readOnly={frozen}
            disabled={busy}
            onChange={(event) => setOriginal(event.target.value)}
            placeholder="工具柜没关，借用表上却比昨天多出一把钥匙。"
          />
        </Field>
        <div className="form-grid two">
          <Field label="创作方向">
            <Select
              value={format}
              disabled={frozen || busy}
              onChange={(event) => setFormat(event.target.value as StudioFormat)}
            >
              {STUDIO_FORMATS.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </Select>
          </Field>
          <Field label="题材参考">
            <Select
              value={categoryKey}
              disabled={frozen || busy}
              onChange={(event) => setCategoryKey(event.target.value)}
            >
              {(["男频", "女频"] as const).map((channel) => (
                <optgroup key={channel} label={channel}>
                  {FANQIE_CATEGORY_PROFILES.filter((item) => item.channel === channel).map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
        </div>
        <p className={styles.reference}>{studioFormatDefaults(format).description}</p>
        <Field label="必须保留" hint="选填。写下不能被模型换掉的人、物件、关系或规则。">
          <Input
            value={keep}
            maxLength={600}
            readOnly={frozen}
            disabled={busy}
            onChange={(event) => setKeep(event.target.value)}
          />
        </Field>
        <details className={styles.exercises} open={starter?.source === "市场线索" || undefined}>
          <summary>标题、标签与来源</summary>
          <div className="form-stack">
            <Field label="卡片标题">
              <Input value={title} maxLength={80} disabled={busy} onChange={(event) => setTitle(event.target.value)} />
            </Field>
            <div className="form-grid two">
              <Field label="标签">
                <Input
                  value={tags}
                  maxLength={140}
                  disabled={busy}
                  placeholder="用顿号隔开，最多六个"
                  onChange={(event) => setTags(event.target.value)}
                />
              </Field>
              <Field label="来源类型">
                <Select
                  value={source}
                  disabled={busy}
                  onChange={(event) => setSource(event.target.value as IdeaRecord["source"])}
                >
                  {IDEA_SOURCES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className={styles.actions}>
              {tagOptions.map((item) => (
                <Button
                  key={item}
                  variant={chosenTags.includes(item) ? "secondary" : "ghost"}
                  aria-pressed={chosenTags.includes(item)}
                  disabled={busy || (!chosenTags.includes(item) && chosenTags.length >= 6)}
                  onClick={() => {
                    setTags(
                      (chosenTags.includes(item)
                        ? chosenTags.filter((value) => value !== item)
                        : [...chosenTags, item]
                      ).join("、"),
                    );
                  }}
                >
                  {item}
                </Button>
              ))}
            </div>
            <Field label="来源备注">
              <Input
                value={reference}
                maxLength={600}
                disabled={busy}
                onChange={(event) => setReference(event.target.value)}
              />
            </Field>
            <Field label="来源链接">
              <Input
                value={referenceUrl}
                maxLength={2000}
                disabled={busy}
                onChange={(event) => setReferenceUrl(event.target.value)}
              />
            </Field>
          </div>
        </details>
        {error && (
          <p role="alert" className="inline-warning">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button type="submit" variant="secondary" disabled={busy || !original.trim()}>
            保存脑洞
          </Button>
          <Button disabled={busy || !original.trim()} onClick={() => void save(true)} icon={<ArrowRight size={16} />}>
            保存并展开
          </Button>
        </div>
      </form>
    </Modal>
  );
}
