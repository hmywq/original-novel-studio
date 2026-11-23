import { BarChart3, ExternalLink, Link2, TrendingUp } from "lucide-react";
import { Badge, Button, EmptyState } from "../components/UI";
import { formatCount, formatDate } from "../lib/format";
import type { RankingAnalytics, RankingSnapshot } from "../shared/types";
import styles from "./ResearchPage.module.css";

interface ResearchRankingViewProps {
  analytics: RankingAnalytics | null;
  rankings: RankingSnapshot[];
  onOpenPublicRanking: () => void;
}

export function ResearchRankingView({ analytics, rankings, onOpenPublicRanking }: ResearchRankingViewProps) {
  return (
    <section className="section-band">
      {analytics && (
        <div className={styles.rankingAnalytics}>
          <div>
            <TrendingUp size={17} />
            <span>
              <small>统计可信度</small>
              <strong>{analytics.confidence}</strong>
            </span>
          </div>
          <div>
            <span>
              <small>有效快照</small>
              <strong>{analytics.snapshotCount}</strong>
            </span>
          </div>
          <div>
            <span>
              <small>累计样本</small>
              <strong>{analytics.sampleSize}</strong>
            </span>
          </div>
          <div>
            <span>
              <small>新晋书目</small>
              <strong>{analytics.newEntrants.length}</strong>
            </span>
          </div>
          <div className={styles.analyticsWide}>
            <small>数据范围</small>
            <strong>{analytics.timeRange}</strong>
          </div>
        </div>
      )}
      {analytics?.marketOpportunities.length ? (
        <div className={styles.marketOpportunityPanel}>
          <div className="section-heading">
            <div>
              <h2>榜单趋势与立项机会</h2>
              <p>从连续榜单快照估算入榜变化和名次，供立项时参考。</p>
            </div>
          </div>
          <div className={styles.marketOpportunityGrid}>
            {analytics.marketOpportunities.slice(0, 6).map((opportunity) => (
              <article key={JSON.stringify([opportunity.source, opportunity.listName])}>
                <div className={styles.opportunityHead}>
                  <div>
                    <Badge tone="accent">{opportunity.genre}</Badge>
                    <strong>{opportunity.categoryName}</strong>
                  </div>
                  <span
                    className={`${styles.opportunityScore} ${opportunity.opportunityScore === null ? styles.isBaseline : ""}`}
                  >
                    {opportunity.opportunityScore ?? "--"}
                  </span>
                </div>
                <p>{opportunity.recommendation}</p>
                {opportunity.source && <small>{opportunity.source}</small>}
                <small>
                  {opportunity.evidenceLevel} · 证据 {opportunity.dataSufficiency}% · 动能{" "}
                  {opportunity.momentumScore ?? "待观察"} · 竞争{opportunity.competition}
                </small>
                <small>
                  {opportunity.snapshots}次快照 · 新晋率 {opportunity.newEntrantRate}% · 平均升位{" "}
                  {opportunity.averageRankChange}
                  {opportunity.scoreRange
                    ? ` · 机会区间 ${opportunity.scoreRange[0]}–${opportunity.scoreRange[1]}`
                    : ""}
                </small>
                {opportunity.sampleWarning && <small className="warning-text">{opportunity.sampleWarning}</small>}
              </article>
            ))}
          </div>
        </div>
      ) : null}
      {rankings.length ? (
        rankings.map((snapshot) => (
          <div className={styles.snapshot} key={snapshot.id}>
            <div className={styles.snapshotHead}>
              <span>
                <strong>{snapshot.listName}</strong>
                <small>
                  {snapshot.source}
                  {snapshot.sourceVersion && !snapshot.sourceVersion.startsWith("sha256:")
                    ? ` · 数据期 ${snapshot.sourceVersion}`
                    : ""}
                  {" · 入库 "}
                  {formatDate(snapshot.capturedAt, true)}
                </small>
              </span>
              <Badge tone={snapshot.status === "成功" ? "success" : snapshot.status === "失败" ? "danger" : "warning"}>
                {snapshot.status}
              </Badge>
            </div>
            {snapshot.error && <p className="inline-warning">{snapshot.error}</p>}
            {snapshot.entries.length > 0 && (
              <div className="data-table">
                <div className={`data-head ${styles.rankingGrid}`}>
                  <span>排名</span>
                  <span>作品</span>
                  <span>题材</span>
                  <span>字数</span>
                  <span>状态</span>
                  <span>来源链接</span>
                </div>
                {snapshot.entries.slice(0, 20).map((entry) => (
                  <div className={`data-row ${styles.rankingGrid}`} key={entry.id}>
                    <span className={styles.rankNumber}>{entry.rank}</span>
                    <span>
                      <strong>{entry.title}</strong>
                      <small>{entry.author}</small>
                      {entry.readerCount != null && <small>在读 {formatCount(entry.readerCount)}</small>}
                    </span>
                    <span>{entry.genre}</span>
                    <span>{entry.words > 0 ? formatCount(entry.words) : "—"}</span>
                    <span>{entry.status}</span>
                    <span className={styles.rankingLinks}>
                      {entry.sourceUrl && (
                        <a
                          href={entry.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          title={entry.synopsis || "打开来源详情页"}
                        >
                          详情 <ExternalLink size={12} />
                        </a>
                      )}
                      {entry.officialReaderUrl && (
                        <a href={entry.officialReaderUrl} target="_blank" rel="noreferrer">
                          阅读
                        </a>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      ) : (
        <EmptyState
          icon={<BarChart3 />}
          title="还没有榜单快照"
          description="同步榜单源或导入 CSV，即可保存榜单快照并追踪标签变化。"
          action={
            <Button onClick={onOpenPublicRanking} icon={<Link2 size={17} />}>
              同步榜单源
            </Button>
          }
        />
      )}
    </section>
  );
}
