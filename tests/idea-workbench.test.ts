import { expect, it } from "vitest";
import { validateIpcArgs } from "../electron/ipc-validation";
import { startIdeaDraft } from "../src/shared/idea-workbench";
import { ideaEvidenceNotes, mergeIdeaSeed } from "../src/shared/incubation";

it("用一句话捕捉脑洞，保存出处，扩写时保留原话和作者锁定项", () => {
  const draft = startIdeaDraft(
    {
      title: "",
      original: "空工具柜里少了一把借用钥匙。",
      keep: "钥匙要由借用人亲自归还。",
      source: "市场线索",
      reference: "2026-11-18 一次读者讨论观察",
      referenceUrl: "https://example.org/story",
      parentId: "original-id",
      insightIds: ["insight-1"],
      tags: ["社区", "社区", "账簿"],
      format: "短剧改编向",
      categoryKey: "男频:262",
    },
    "idea-1",
    "2026-11-18T12:00:00.000Z",
  );
  expect(draft.positioning.targetWords).toBe(40_000);
  expect(draft.idea).toMatchObject({ parentId: "original-id", tags: ["社区", "账簿"] });
  expect(draft.evidence.insightIds).toEqual(["insight-1"]);
  expect(validateIpcArgs("saveIncubation", [draft])[0]).toEqual(draft);
  expect(mergeIdeaSeed(draft.idea, "用两次不同的签字交代来龙去脉。")).toBe(
    "原始脑洞\n空工具柜里少了一把借用钥匙。\n\n作者指定必须保留\n钥匙要由借用人亲自归还。\n\n作者追加的方向\n用两次不同的签字交代来龙去脉。",
  );
  expect(ideaEvidenceNotes(draft.idea, ["某期榜单", "某期榜单"])).toHaveLength(2);
});
