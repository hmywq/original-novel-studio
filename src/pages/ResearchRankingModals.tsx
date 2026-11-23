import { Play, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Field, Input, Modal, Select, Textarea } from "../components/UI";
import type { RankingCaptureSchedule } from "../shared/types";
import styles from "./ResearchPage.module.css";

const beijingTime = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});

interface RankingImportModalProps {
  open: boolean;
  rankingName: string;
  rankingCsv: string;
  onRankingNameChange: (value: string) => void;
  onRankingCsvChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export function RankingImportModal({
  open,
  rankingName,
  rankingCsv,
  onRankingNameChange,
  onRankingCsvChange,
  onClose,
  onSave,
}: RankingImportModalProps) {
  const [fileError, setFileError] = useState("");
  if (!open) return null;
  return (
    <Modal title="导入榜单 CSV" onClose={onClose}>
      <div className="form-stack">
        <Field label="榜单名称">
          <Input
            value={rankingName}
            maxLength={200}
            placeholder="如番茄女频·悬疑脑洞新书榜"
            onChange={(event) => onRankingNameChange(event.target.value)}
          />
        </Field>
        <Field label="选择 CSV 文件" hint="UTF-8 编码，最大 5 MB。也可以粘贴到下方。">
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              setFileError("");
              if (!file) return;
              if (file.size > 5_000_000) {
                setFileError("请选择不超过 5 MB 的 CSV。");
                return;
              }
              void file
                .arrayBuffer()
                .then((bytes) => {
                  onRankingCsvChange(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
                })
                .catch(() => setFileError("读取失败，请将 CSV 另存为 UTF-8 编码再试。"));
            }}
          />
        </Field>
        {fileError && (
          <p className="inline-warning" role="alert">
            {fileError}
          </p>
        )}
        <Field label="CSV 内容" hint="必填排名、书名。可加作者、题材、字数、在读、状态、标签、链接。">
          <Textarea
            rows={12}
            value={rankingCsv}
            onChange={(event) => onRankingCsvChange(event.target.value)}
            placeholder="排名,书名,作者,题材,字数,状态\n1,示例书名,作者,都市脑洞,100万,连载"
          />
        </Field>
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button disabled={!rankingName.trim() || !rankingCsv.trim()} onClick={onSave}>
            保存快照
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export type RankingSourceKind = "inbox" | "https";

interface RankingSourceFieldsProps {
  kind: RankingSourceKind;
  value: string;
  name: string;
  workspace: string;
  onKindChange: (value: RankingSourceKind) => void;
  onValueChange: (value: string) => void;
  onNameChange: (value: string) => void;
}

function RankingSourceFields({
  kind,
  value,
  name,
  workspace,
  onKindChange,
  onValueChange,
  onNameChange,
}: RankingSourceFieldsProps) {
  return (
    <>
      <div className="form-grid two">
        <Field label="榜单名称">
          <Input
            value={name}
            maxLength={200}
            placeholder="如番茄男频·都市脑洞阅读榜"
            onChange={(event) => onNameChange(event.target.value)}
          />
        </Field>
        <Field label="数据源类型">
          <Select value={kind} onChange={(event) => onKindChange(event.target.value as RankingSourceKind)}>
            <option value="inbox">本地 CSV 收件箱</option>
            <option value="https">已授权的 HTTPS CSV</option>
          </Select>
        </Field>
      </div>
      <Field
        label={kind === "inbox" ? "CSV 文件名" : "CSV 地址"}
        hint={
          kind === "inbox"
            ? "将 UTF-8 CSV 放进工作区的 rank-inbox 文件夹，再填文件名。"
            : "填写你有权定时读取、可直接下载 UTF-8 CSV 的 HTTPS 地址。"
        }
      >
        <Input
          value={value}
          maxLength={kind === "inbox" ? 200 : 2000}
          placeholder={kind === "inbox" ? "男频阅读榜.csv" : "https://example.com/rank.csv"}
          onChange={(event) => onValueChange(event.target.value)}
        />
      </Field>
      {kind === "inbox" && workspace && (
        <code className={styles.inboxPath}>{`${workspace.replace(/[\\/]$/, "")}\\rank-inbox`}</code>
      )}
    </>
  );
}

interface PublicRankingModalProps {
  open: boolean;
  fields: RankingSourceFieldsProps;
  ready: boolean;
  busy: boolean;
  dailySync: boolean;
  onDailySyncChange: (value: boolean) => void;
  onClose: () => void;
  onCapture: () => void;
}

function PublicRankingModal({
  open,
  fields,
  ready,
  busy,
  dailySync,
  onDailySyncChange,
  onClose,
  onCapture,
}: PublicRankingModalProps) {
  if (!open) return null;
  return (
    <Modal title="同步榜单源" onClose={() => !busy && onClose()}>
      <div className="form-stack">
        <RankingSourceFields {...fields} />
        <label className="check-row">
          <input
            type="checkbox"
            checked={dailySync}
            disabled={busy}
            onChange={(event) => onDailySyncChange(event.target.checked)}
          />
          <span>每日自动更新</span>
        </label>
        <div className="modal-actions">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button disabled={!ready || busy} onClick={onCapture}>
            {busy ? "正在同步…" : dailySync ? "立即同步并开启每日更新" : "立即同步"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

interface RankingScheduleModalProps {
  open: boolean;
  fields: RankingSourceFieldsProps;
  ready: boolean;
  busy: boolean;
  frequency: RankingCaptureSchedule["frequency"];
  schedules: RankingCaptureSchedule[];
  runningId: string | null;
  onFrequencyChange: (value: RankingCaptureSchedule["frequency"]) => void;
  onClose: () => void;
  onAdd: () => void;
  onToggle: (schedule: RankingCaptureSchedule, enabled: boolean) => void;
  onRun: (schedule: RankingCaptureSchedule) => void;
  onDelete: (schedule: RankingCaptureSchedule) => void;
}

function RankingScheduleModal({
  open,
  fields,
  ready,
  busy,
  frequency,
  schedules,
  runningId,
  onFrequencyChange,
  onClose,
  onAdd,
  onToggle,
  onRun,
  onDelete,
}: RankingScheduleModalProps) {
  if (!open) return null;
  return (
    <Modal title="定时采榜" onClose={onClose} width={720}>
      <div className="form-stack">
        <RankingSourceFields {...fields} />
        <div className={styles.scheduleCreateRow}>
          <Field label="频率">
            <Select
              value={frequency}
              onChange={(event) => onFrequencyChange(event.target.value as RankingCaptureSchedule["frequency"])}
            >
              <option>每日</option>
              <option>每周</option>
            </Select>
          </Field>
          <Button disabled={!ready || busy} onClick={onAdd}>
            {busy ? "正在保存…" : "添加任务"}
          </Button>
        </div>
        <p className="inline-warning">
          每日任务按北京时间 15:20 排程。应用运行时每 15 分钟检查；当天过点打开会补跑一次。
          使用本地收件箱的任务会读取同名 CSV，有新一期数据时需更新文件并填写新的榜单版本。同一期不会重复入库。
        </p>
        <div className={styles.rankingScheduleList}>
          {schedules.length ? (
            schedules.map((schedule) => (
              <article key={schedule.id}>
                <div>
                  <strong>{schedule.listName}</strong>
                  <small>
                    {schedule.frequency} ·{" "}
                    {schedule.url.startsWith("inbox:") ? `收件箱 ${schedule.url.slice(6)}` : "HTTPS 来源"} · 下次{" "}
                    {beijingTime.format(new Date(schedule.nextRunAt))} 北京时间
                  </small>
                  {schedule.lastError && <small className={styles.errorText}>{schedule.lastError}</small>}
                </div>
                <Badge
                  tone={
                    schedule.lastStatus === "成功" ? "success" : schedule.lastStatus === "失败" ? "danger" : "neutral"
                  }
                >
                  {schedule.lastStatus}
                </Badge>
                <label className={styles.scheduleToggle} title={schedule.enabled ? "暂停任务" : "启用任务"}>
                  <input
                    type="checkbox"
                    checked={schedule.enabled}
                    onChange={(event) => onToggle(schedule, event.target.checked)}
                  />
                  <span>{schedule.enabled ? "运行中" : "已暂停"}</span>
                </label>
                <button
                  type="button"
                  className="icon-button"
                  title="立即运行"
                  aria-label="立即运行"
                  disabled={runningId !== null}
                  onClick={() => onRun(schedule)}
                >
                  <Play size={15} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  title="删除任务"
                  aria-label="删除任务"
                  onClick={() => onDelete(schedule)}
                >
                  <Trash2 size={15} />
                </button>
              </article>
            ))
          ) : (
            <p className="muted-line">还没有定时任务。</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

export interface ResearchRankingModalsProps {
  importModal: RankingImportModalProps;
  publicModal: PublicRankingModalProps;
  scheduleModal: RankingScheduleModalProps;
}

export function ResearchRankingModals({ importModal, publicModal, scheduleModal }: ResearchRankingModalsProps) {
  return (
    <>
      <RankingImportModal {...importModal} />
      <PublicRankingModal {...publicModal} />
      <RankingScheduleModal {...scheduleModal} />
    </>
  );
}
