import { Bell, ExternalLink, Search } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Badge, Button, EmptyState, Field, Input, Select } from "../components/UI";
import type { IdeaStarter } from "../shared/idea-workbench";
import { buildRankWatch, rankingTracks, type WatchResult, watchTerms } from "../shared/rank-watch";
import type { RankingSnapshot } from "../shared/types";
import styles from "./ResearchPage.module.css";

const WATCH_KEY = "original-novel-studio.rank-watch.v1";
const starterTerms = ["家庭关系", "女性成长", "年代", "职场", "重生", "悬疑", "现言脑洞", "纯爱", "AI", "短剧改编"];
const stamp = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function savedTerms() {
  try {
    const raw = localStorage.getItem(WATCH_KEY);
    if (raw === null) return starterTerms;
    const stored: unknown = JSON.parse(raw);
    return Array.isArray(stored) ? watchTerms(stored) : [];
  } catch {
    return [];
  }
}

function evidenceDate(snapshot: RankingSnapshot) {
  const version = snapshot.sourceVersion;
  return version && !version.startsWith("sha256:")
    ? `数据期 ${version}`
    : `入库 ${stamp.format(new Date(snapshot.capturedAt))}`;
}

function publicLink(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function ResearchWatchPanel({
  snapshots,
  onScan,
  onTemplates,
  onIdea,
}: {
  snapshots: RankingSnapshot[];
  onScan: () => void;
  onTemplates: (query: string) => void;
  onIdea: (starter: IdeaStarter) => void;
}) {
  const [terms, setTerms] = useState(savedTerms);
  const [input, setInput] = useState("");
  const [trackKey, setTrackKey] = useState("");
  const [error, setError] = useState("");
  const tracks = rankingTracks(snapshots);
  const track = tracks.find((item) => item.key === trackKey) ?? tracks[0];
  const result = buildRankWatch(track?.snapshots ?? [], terms);

  const save = (next: string[]) => {
    try {
      localStorage.setItem(WATCH_KEY, JSON.stringify(next));
      setTerms(next);
      setError("");
    } catch {
      setError("暂时无法保存关注词，请检查本地存储。");
    }
  };
  const add = (event: FormEvent) => {
    event.preventDefault();
    const next = watchTerms([...terms, input]);
    if (next.length === terms.length) {
      setError("请添加 2–24 个字符的新词，最多关注 12 个词。");
      return;
    }
    save(next);
    setInput("");
  };

  const renderHit = ({ term, hits, change }: WatchResult, removable: boolean) => (
    <article className={styles.watchCard} key={term}>
      <div className={styles.watchCardHead}>
        <strong>{term}</strong>
        <Badge tone={change && change > 0 ? "success" : "neutral"}>
          {hits.length} 本{change != null && change !== 0 ? ` · ${change > 0 ? "+" : ""}${change}` : ""}
        </Badge>
      </div>
      <div className={styles.watchBar} aria-hidden="true">
        <span style={{ width: `${(100 * hits.length) / Math.max(1, result.sampleSize)}%` }} />
      </div>
      {hits.length > 0 ? (
        <ul>
          {hits.slice(0, 3).map((entry) => {
            const link = publicLink(entry.sourceUrl);
            return (
              <li key={entry.id}>
                <small>#{entry.rank}</small>{" "}
                {link ? (
                  <a href={link} target="_blank" rel="noreferrer">
                    {entry.title} <ExternalLink size={11} />
                  </a>
                ) : (
                  entry.title
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted-line">{result.latest ? "可用元数据中暂无命中。" : "待首份快照。"}</p>
      )}
      <div className={styles.watchActions}>
        <Button variant="secondary" onClick={() => onTemplates(term)}>
          找开书模板
        </Button>
        {hits.length > 0 && result.latest && (
          <Button
            variant="secondary"
            onClick={() => {
              const evidence = result.latest!;
              onIdea({
                title: `从「${term}」延伸`,
                original: `想围绕「${term}」写一个新故事。先找一个少见身份、一个能看见的物件和一次有代价的选择。`,
                source: "市场线索",
                tags: [term],
                reference: `${evidence.listName} · ${evidence.source} · ${evidenceDate(evidence)} · ${hits.length} 部命中`,
              });
            }}
          >
            记为脑洞
          </Button>
        )}
        {removable && (
          <Button variant="ghost" onClick={() => save(terms.filter((item) => item !== term))}>
            取消关注
          </Button>
        )}
      </div>
    </article>
  );

  return (
    <section className={styles.watchPanel}>
      <header className="section-heading">
        <div>
          <h2>热点关注</h2>
          <p>按同一榜单比较榜内作品。关注词匹配书名、题材和标签。</p>
        </div>
      </header>
      <form onSubmit={add} className={styles.watchForm}>
        <Field label="关注词">
          <Input
            value={input}
            maxLength={24}
            placeholder="例如：群像、年代、规则怪谈"
            onChange={(event) => setInput(event.target.value)}
          />
        </Field>
        <Button type="submit" icon={<Bell size={16} />} disabled={!input.trim()}>
          关注
        </Button>
        <Field label="比较榜单">
          <Select
            value={track?.key ?? ""}
            onChange={(event) => setTrackKey(event.target.value)}
            disabled={!tracks.length}
          >
            {!tracks.length && <option value="">待采集</option>}
            {tracks.map((item) => (
              <option key={item.key} value={item.key}>
                {item.listName} · {item.source}
              </option>
            ))}
          </Select>
        </Field>
      </form>
      {error && (
        <p role="alert" className="inline-warning">
          {error}
        </p>
      )}
      {result.latest ? (
        <p className={styles.watchEvidence}>
          {evidenceDate(result.latest)} · {result.sampleSize} 部 · {result.latest.status}
          {result.watched.some((item) => item.change != null) || result.topTags.some((item) => item.change != null)
            ? ` · 对比 ${evidenceDate(result.previous!)}`
            : " · 暂缺可直接对比的前期快照"}
        </p>
      ) : (
        <EmptyState
          icon={<Search />}
          title="等待首份榜单"
          description="同步榜单源或导入 CSV，关注词会在这里显示实际命中。"
          action={<Button onClick={onScan}>同步榜单源</Button>}
        />
      )}
      {result.latestAttempt?.status === "失败" && (
        <p className="inline-warning">最近一次采集失败。{result.latestAttempt.error}</p>
      )}
      {result.watched.length > 0 && (
        <div className={styles.watchGrid}>{result.watched.map((item) => renderHit(item, true))}</div>
      )}
      {result.latest && (
        <>
          <h3 className={styles.watchSubhead}>本榜常见标签</h3>
          {result.topTags.length > 0 ? (
            <div className={styles.watchGrid}>{result.topTags.map((item) => renderHit(item, false))}</div>
          ) : (
            <p className="muted-line">这份快照还没有可统计的标签。</p>
          )}
        </>
      )}
    </section>
  );
}
