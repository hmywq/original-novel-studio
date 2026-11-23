import { ArrowUpRight, Bookmark, BookOpen, LibraryBig, Sparkles } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Badge, Button, EmptyState, Field, Input, Modal, Segmented, Select } from "../components/UI";
import { describeError } from "../lib/error-message";
import { getFanqieCategoryProfile } from "../shared/fanqie-taxonomy";
import { rankingTracks } from "../shared/rank-watch";
import type { StoryTemplateInput, StoryTemplateSeed } from "../shared/story-template-type";
import { draftVariantsFromTemplate, storyTemplates } from "../shared/story-templates";
import { STUDIO_FORMATS, studioFormatDefaults } from "../shared/studio-format";
import type { AppApi, IncubationDraft, ProjectSummary, RankingEntry, RankingSnapshot } from "../shared/types";
import styles from "./TemplateLibraryPage.module.css";

const FAVORITES_KEY = "original-novel-studio.template-favorites.v1";
const library = storyTemplates.flatMap((template) => {
  const profile = getFanqieCategoryProfile(template.categoryKey);
  return profile ? [{ template, profile }] : [];
});
const stamp = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium" });

function canonical(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}

function readFavorites(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function matchingBooks(bookRows: RankingEntry[], category: string, tags: readonly string[]) {
  const templateTags = new Set(tags.map(canonical));
  return new Set(
    bookRows
      .filter(
        (book) =>
          canonical(book.genre) === canonical(category) || book.tags.some((tag) => templateTags.has(canonical(tag))),
      )
      .map((book) => book.sourceUrl || JSON.stringify([book.title, book.author])),
  ).size;
}

interface TemplateLibraryProps {
  api: AppApi;
  initialQuery: string;
  notify: (message: string, tone?: "success" | "error") => void;
  onCreated: (project: ProjectSummary) => void;
  onVariants: (draft: IncubationDraft) => void;
}

export function TemplateLibraryPage({ api, initialQuery, notify, onCreated, onVariants }: TemplateLibraryProps) {
  const [query, setQuery] = useState(initialQuery);
  const [channel, setChannel] = useState<"全部" | "男频" | "女频">("全部");
  const [category, setCategory] = useState("");
  const [format, setFormat] = useState("");
  const [favorites, setFavorites] = useState(readFavorites);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [snapshots, setSnapshots] = useState<RankingSnapshot[]>([]);
  const [boardKey, setBoardKey] = useState("");
  const [selected, setSelected] = useState<StoryTemplateSeed | null>(null);

  useEffect(() => {
    let active = true;
    void api
      .listRankings()
      .then((rows) => {
        if (active) setSnapshots(rows);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api]);

  const byChannel = library.filter(({ profile }) => channel === "全部" || profile.channel === channel);
  const categories = Array.from(new Map(byChannel.map(({ profile }) => [profile.key, profile])).values());
  const terms = canonical(query).split(/\s+/).filter(Boolean);
  const boards = rankingTracks(snapshots).flatMap((track) => {
    const usable = track.snapshots.find((item) => item.status !== "失败" && item.entries.length);
    return usable ? [{ track, usable }] : [];
  });
  const board = boards.find(({ track }) => track.key === boardKey);
  const visible = byChannel
    .filter(({ template, profile }) => {
      if (category && profile.key !== category) return false;
      if (format && (template.studio?.format ?? "长篇连载") !== format) return false;
      if (onlyFavorites && !favorites.includes(template.id)) return false;
      const text = canonical(
        [template.title, profile.name, ...template.tags, template.premise, template.conflict].join(" "),
      );
      return terms.every((term) => text.includes(term));
    })
    .map((item) => ({
      ...item,
      matches: board ? matchingBooks(board.usable.entries, item.profile.name, item.template.tags) : 0,
    }));
  if (board) visible.sort((a, b) => b.matches - a.matches);

  const toggleFavorite = (id: string) => {
    const next = favorites.includes(id) ? favorites.filter((item) => item !== id) : [...favorites, id];
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      setFavorites(next);
    } catch {
      notify("本地存储暂时无法保存收藏", "error");
    }
  };
  const reset = () => {
    setQuery("");
    setChannel("全部");
    setCategory("");
    setFormat("");
    setOnlyFavorites(false);
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>开书模板库</h1>
          <p>{library.length} 套原创开书方案。可直接建立草稿，也可填入立项台生成新的故事方案。</p>
        </div>
      </header>
      <section className={styles.filters} aria-label="筛选开书模板">
        <div className={styles.channels}>
          <Segmented
            options={["全部", "男频", "女频"] as const}
            value={channel}
            label="频道"
            onChange={(next) => {
              setChannel(next);
              setCategory("");
            }}
          />
          <Button
            variant="secondary"
            aria-pressed={onlyFavorites}
            icon={<Bookmark size={16} fill={onlyFavorites ? "currentColor" : "none"} />}
            onClick={() => setOnlyFavorites(!onlyFavorites)}
          >
            收藏{favorites.length ? ` (${favorites.length})` : ""}
          </Button>
        </div>
        <Field label="搜索模板">
          <Input
            value={query}
            maxLength={80}
            placeholder="书名、都市脑洞、先婚后爱…"
            onChange={(event) => setQuery(event.target.value)}
          />
        </Field>
        <Field label="题材">
          <Select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">全部题材</option>
            {categories.map((item) => (
              <option key={item.key} value={item.key}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="创作方向">
          <Select value={format} onChange={(event) => setFormat(event.target.value)}>
            <option value="">全部方向</option>
            {[...STUDIO_FORMATS, "长篇连载"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </Select>
        </Field>
        <Field label="按榜单匹配排序">
          <Select value={boardKey} onChange={(event) => setBoardKey(event.target.value)} disabled={!boards.length}>
            <option value="">{boards.length ? "默认顺序" : "待导入榜单"}</option>
            {boards.map(({ track }) => (
              <option key={track.key} value={track.key}>
                {track.listName} · {track.source}
              </option>
            ))}
          </Select>
        </Field>
      </section>
      <div className={styles.resultLine}>
        <span>{visible.length} 套方案</span>
        {board && (
          <span>
            {board.track.listName} · {stamp.format(new Date(board.usable.capturedAt))} · 按同题材或同标签的作品数排序
          </span>
        )}
      </div>
      {visible.length ? (
        <div className={styles.cards}>
          {visible.map(({ template, profile, matches }) => (
            <article className={styles.card} key={template.id}>
              <div className={styles.cardHeader}>
                <Badge tone={profile.channel === "女频" ? "accent" : "neutral"}>
                  {profile.channel} · {profile.name}
                  {template.studio ? ` · ${template.studio.format}` : ""}
                </Badge>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`收藏《${template.title}》`}
                  aria-pressed={favorites.includes(template.id)}
                  onClick={() => toggleFavorite(template.id)}
                >
                  <Bookmark size={17} fill={favorites.includes(template.id) ? "currentColor" : "none"} />
                </button>
              </div>
              <h2>{template.title}</h2>
              <p>{template.premise}</p>
              <ul className={styles.tags} aria-label="模板标签">
                {template.tags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
              <div className={styles.cardFooter}>
                <small>
                  {board
                    ? `榜内匹配 ${matches} 本`
                    : template.studio?.format === "万字短篇"
                      ? "五节全篇"
                      : template.studio?.format === "短剧改编向"
                        ? "前三集改编预演"
                        : "含前五章细纲"}
                </small>
                <Button
                  variant="secondary"
                  aria-label={`预览《${template.title}》`}
                  icon={<ArrowUpRight size={15} />}
                  onClick={() => setSelected(template)}
                >
                  预览方案
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<LibraryBig />}
          title="没有找到符合条件的方案"
          description="可以清除筛选，浏览全部开书方案。"
          action={
            <Button variant="secondary" onClick={reset}>
              清除筛选
            </Button>
          }
        />
      )}
      {selected && (
        <TemplatePreview
          key={selected.id}
          template={selected}
          api={api}
          notify={notify}
          onClose={() => setSelected(null)}
          onCreated={onCreated}
          onVariants={(draft) => {
            setSelected(null);
            onVariants(draft);
          }}
        />
      )}
    </div>
  );
}

function TemplatePreview({
  template,
  api,
  notify,
  onClose,
  onCreated,
  onVariants,
}: Omit<TemplateLibraryProps, "initialQuery"> & {
  template: StoryTemplateSeed;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(template.title);
  const [name, setName] = useState(template.categoryKey.startsWith("男频:") ? "林舟" : "乔蔓");
  const studio = template.studio;
  const short = studio?.format === "万字短篇";
  const [length, setLength] = useState(
    studio ? String(studioFormatDefaults(studio.format).positioning.targetWords / 10_000) : "30",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const targetWords = Math.round(Number(length) * 10_000);
  const valid =
    Boolean(title.trim() && name.trim()) &&
    Number.isInteger(targetWords) &&
    targetWords >= 10_000 &&
    targetWords <= (short ? 20_000 : 10_000_000);
  const input: StoryTemplateInput = { templateId: template.id, title, protagonistName: name, targetWords };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !valid) return;
    setBusy(true);
    setError("");
    try {
      const project = await api.createProjectFromTemplate(input);
      onClose();
      onCreated(project);
    } catch (cause) {
      setError(describeError(cause));
      setBusy(false);
    }
  };
  const relations = [
    ["主角与动机", template.protagonist.replaceAll("{{主角}}", () => name.trim() || "主角")],
    ["人物弧线", template.protagonistArc],
    ["主要关系", template.relationship],
    ["次要关系", template.secondaryRelationship],
    ["核心冲突", template.conflict],
    ["主要势力", template.majorForces.join("。")],
    ["世界规则", template.rule],
    ["规则边界", template.secondaryRule],
    ["连载主线", template.engine],
    ["终局", template.ending],
  ];

  return (
    <Modal title={`《${template.title}》开书方案`} width={850} onClose={() => !busy && onClose()}>
      <form onSubmit={(event) => void create(event)} className="form-stack">
        <p className={styles.premise}>{template.premise}</p>
        {studio && (
          <div className={styles.opening}>
            <h3>开页试读</h3>
            <p>{studio.hook.replaceAll("{{主角}}", () => name.trim() || "主角")}</p>
          </div>
        )}
        <div className="form-grid three">
          <Field label="新作品书名">
            <Input
              value={title}
              maxLength={100}
              required
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field label="主角名">
            <Input
              value={name}
              maxLength={30}
              required
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="目标字数（万）">
            <Input
              value={length}
              type="number"
              min={1}
              max={short ? 2 : 1000}
              step={short ? 0.1 : 1}
              required
              disabled={busy}
              onChange={(event) => setLength(event.target.value)}
            />
          </Field>
        </div>
        <dl className={styles.facts}>
          {relations.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <div className={styles.opening}>
          <h3>{short ? "万字短篇五节细纲" : "前五章细纲"}</h3>
          <ol>
            {template.beats.map((beat) => (
              <li key={beat}>{beat}</li>
            ))}
          </ol>
        </div>
        {studio?.format === "短剧改编向" && (
          <div className={styles.opening}>
            <h3>前三集改编预演</h3>
            <ol>
              {studio.episodes.map((value) => (
                <li key={value}>{value}</li>
              ))}
            </ol>
            <p>可复用场地 · {studio.locations.join("、")}</p>
            <p>{studio.productionNote}</p>
          </div>
        )}
        {error && (
          <p role="alert" className="inline-warning">
            {error}
          </p>
        )}
        <div className={`${styles.previewActions} modal-actions`}>
          <Button
            variant="secondary"
            disabled={busy || !valid}
            icon={<Sparkles size={16} />}
            onClick={() => {
              try {
                onVariants(draftVariantsFromTemplate(input, () => crypto.randomUUID(), new Date().toISOString()));
              } catch (cause) {
                notify(describeError(cause), "error");
              }
            }}
          >
            在立项台生成变体
          </Button>
          <Button type="submit" disabled={busy || !valid} icon={<BookOpen size={16} />}>
            {busy ? "正在建立作品…" : "套用成品"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
