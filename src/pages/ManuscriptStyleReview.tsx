import { LocateFixed, PencilLine } from "lucide-react";
import { useState } from "react";
import { Button } from "../components/UI";
import type { ManuscriptStyleHint } from "../shared/manuscript-style";
import styles from "./ManuscriptStyleReview.module.css";

const PAGE_SIZE = 24;
// 桌面版修订服务支持的正文替换上限。
const MAX_SELECTION_LENGTH = 16_000;

export function ManuscriptStyleReview({
  hints,
  disabled,
  onRefresh,
  onLocate,
  onRevise,
}: {
  hints: ManuscriptStyleHint[] | null;
  disabled: boolean;
  onRefresh: () => void;
  onLocate: (hint: ManuscriptStyleHint) => void;
  onRevise: (hint: ManuscriptStyleHint) => void;
}) {
  const [limit, setLimit] = useState(PAGE_SIZE);

  return (
    <section className={styles.panel} aria-label="文风检查结果">
      {hints === null ? (
        <div className={styles.statusLine}>
          <p className="muted-line" role="status">
            稿件或白名单已更新。重新检查后可继续定位。
          </p>
          <Button variant="secondary" disabled={disabled} onClick={onRefresh}>
            重新检查
          </Button>
        </div>
      ) : (
        <>
          <p className="muted-line" role="status">
            {hints.length
              ? `${hints.length} 段值得回看，按上下文和人物口吻取舍。`
              : "这版正文未命中常见套话、重复句式或章尾套式。"}
          </p>
          {hints.length > 0 && (
            <ul className={styles.hints}>
              {hints.slice(0, limit).map((hint) => {
                const tooLong = hint.end - hint.start > MAX_SELECTION_LENGTH;
                return (
                  <li className={styles.hint} key={hint.start}>
                    <div>
                      <strong>第 {hint.paragraph} 段</strong>
                      <small>{hint.labels.join(" · ")}</small>
                      <p>{hint.excerpt}</p>
                    </div>
                    <div className={styles.actions}>
                      <Button
                        variant="ghost"
                        icon={<LocateFixed size={14} />}
                        disabled={disabled}
                        onClick={() => onLocate(hint)}
                      >
                        定位正文
                      </Button>
                      {tooLong ? (
                        <small>定位后可手动选一小段修订</small>
                      ) : (
                        <Button
                          variant="secondary"
                          icon={<PencilLine size={14} />}
                          disabled={disabled}
                          onClick={() => onRevise(hint)}
                        >
                          拟修订
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {hints.length > limit && (
            <Button variant="ghost" onClick={() => setLimit(limit + PAGE_SIZE)}>
              显示更多（{hints.length - limit} 段）
            </Button>
          )}
        </>
      )}
    </section>
  );
}
