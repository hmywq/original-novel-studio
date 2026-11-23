import { ArrowRight, Lightbulb, Pencil, Save } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Badge, Button, EmptyState, Field, Input, Modal, Select, Textarea } from "../components/UI";
import { describeError } from "../lib/error-message";
import { formatDate } from "../lib/format";
import { GENRES, type InsightPack, type InsightPackEdits } from "../shared/types";
import styles from "./ResearchPage.module.css";

const textFields = [
  ["audienceNeed", "读者需求"],
  ["openingPromise", "开篇承诺"],
  ["conflictEngine", "冲突发动机"],
  ["emotionalRhythm", "情绪节奏"],
  ["retentionDevices", "追读装置"],
  ["longFormEngine", "长篇发动机"],
  ["marketGap", "市场空位"],
  ["risks", "风险说明"],
] as const;
const confidenceOptions = ["低", "中", "高"] as const;

export function ResearchInsightsView({
  insights,
  onDevelop,
  onSave,
}: {
  insights: InsightPack[];
  onDevelop?: (insight: InsightPack) => void;
  onSave?: (id: string, edits: InsightPackEdits) => Promise<void>;
}) {
  const [editing, setEditing] = useState<InsightPack | null>(null);
  return (
    <section className="section-band">
      {insights.length ? (
        <div className={styles.insightGrid}>
          {insights.map((insight) => (
            <article className={styles.insightItem} key={insight.id}>
              <div className={styles.insightTop}>
                <Badge tone="accent">{insight.genre}</Badge>
                <Badge
                  tone={insight.confidence === "高" ? "success" : insight.confidence === "中" ? "warning" : "neutral"}
                >
                  {insight.confidence}可信度
                </Badge>
              </div>
              <h3>{insight.name}</h3>
              <dl>
                <div>
                  <dt>读者需求</dt>
                  <dd>{insight.audienceNeed}</dd>
                </div>
                <div>
                  <dt>冲突发动机</dt>
                  <dd>{insight.conflictEngine}</dd>
                </div>
                <div>
                  <dt>长篇能力</dt>
                  <dd>{insight.longFormEngine}</dd>
                </div>
                <div>
                  <dt>市场空位</dt>
                  <dd>{insight.marketGap}</dd>
                </div>
              </dl>
              <footer>
                {insight.evidenceCount} 个章节证据 · {formatDate(insight.createdAt)}
              </footer>
              {(onSave || onDevelop) && (
                <div className={styles.insightActions}>
                  {onSave && (
                    <Button variant="ghost" icon={<Pencil size={15} />} onClick={() => setEditing(insight)}>
                      人工校正
                    </Button>
                  )}
                  {onDevelop && (
                    <Button variant="secondary" icon={<ArrowRight size={15} />} onClick={() => onDevelop(insight)}>
                      借结构写新故事
                    </Button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Lightbulb />}
          title="还没有脱敏洞察"
          description="完成样本拆书后，抽象结构结论会出现在这里。"
        />
      )}
      {editing && onSave && (
        <InsightEditor key={editing.id} insight={editing} onSave={onSave} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}

function InsightEditor({
  insight,
  onSave,
  onClose,
}: {
  insight: InsightPack;
  onSave: (id: string, edits: InsightPackEdits) => Promise<void>;
  onClose: () => void;
}) {
  const [edits, setEdits] = useState<InsightPackEdits>(() => ({
    name: insight.name,
    genre: insight.genre,
    confidence: insight.confidence,
    audienceNeed: insight.audienceNeed ?? "",
    openingPromise: insight.openingPromise ?? "",
    conflictEngine: insight.conflictEngine ?? "",
    emotionalRhythm: insight.emotionalRhythm ?? "",
    retentionDevices: insight.retentionDevices ?? "",
    longFormEngine: insight.longFormEngine ?? "",
    marketGap: insight.marketGap ?? "",
    risks: insight.risks ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const setField = <K extends keyof InsightPackEdits>(key: K, value: InsightPackEdits[K]) => {
    setEdits((current) => ({ ...current, [key]: value }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !edits.name.trim()) return;
    setBusy(true);
    setError("");
    try {
      await onSave(insight.id, { ...edits, name: edits.name.trim() });
      onClose();
    } catch (cause) {
      setError(describeError(cause));
      setBusy(false);
    }
  };
  return (
    <Modal title="人工校正洞察" width={720} onClose={() => !busy && onClose()}>
      <form className="form-stack" onSubmit={(event) => void submit(event)}>
        <Field label="洞察名称">
          <Input
            required
            maxLength={500}
            disabled={busy}
            value={edits.name}
            onChange={(event) => setField("name", event.target.value)}
          />
        </Field>
        <div className="form-grid two">
          <Field label="题材">
            <Select
              disabled={busy}
              value={edits.genre}
              onChange={(event) => setField("genre", event.target.value as InsightPack["genre"])}
            >
              {GENRES.map((genre) => (
                <option key={genre}>{genre}</option>
              ))}
            </Select>
          </Field>
          <Field label="可信度">
            <Select
              disabled={busy}
              value={edits.confidence}
              onChange={(event) => setField("confidence", event.target.value as InsightPack["confidence"])}
            >
              {confidenceOptions.map((confidence) => (
                <option key={confidence}>{confidence}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="form-grid two">
          {textFields.map(([key, label]) => (
            <Field key={key} label={label}>
              <Textarea
                rows={3}
                maxLength={10_000}
                disabled={busy}
                value={edits[key]}
                onChange={(event) => setField(key, event.target.value)}
              />
            </Field>
          ))}
        </div>
        {error && (
          <p role="alert" className="inline-warning">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button type="submit" icon={<Save size={15} />} disabled={busy || !edits.name.trim()}>
            {busy ? "保存中…" : "保存校正"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
