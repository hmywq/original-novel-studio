import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

test("同步本地榜单、关注热点并套用开书模板，全程走桌面数据库", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "original-novel-e2e-"));
  const workspace = path.join(root, "workspace");
  const application = await electron.launch({
    args: ["."],
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      NOVEL_STUDIO_WORKSPACE: workspace,
      NOVEL_STUDIO_USER_DATA: path.join(root, "profile"),
      NOVEL_STUDIO_DISABLE_SINGLE_INSTANCE_LOCK: "1",
    },
  });
  try {
    const page = await application.firstWindow();
    await expect(page.getByRole("heading", { name: "多书总览" })).toBeVisible();
    const filename = "合成测试榜单.csv";
    const csvPath = path.join(workspace, "rank-inbox", filename);
    const header = "排名,书名,作者,题材,在读,标签,榜单版本\n";
    writeFileSync(csvPath, `${header}1,末班地铁测试书,测试作者,都市脑洞,2.2万,群像、都市异能,一期\n`);

    await page.getByRole("button", { name: "市场研究", exact: true }).click();
    await page.getByRole("button", { name: "同步榜单源", exact: true }).click();
    const sync = page.getByRole("dialog", { name: "同步榜单源" });
    await expect(sync.getByLabel("CSV 地址")).toBeVisible();
    await sync.getByLabel("数据源类型").selectOption("inbox");
    await expect(sync.getByText(/workspace\\rank-inbox/)).toBeVisible();
    await sync.getByLabel("榜单名称").fill("合成验收·都市榜");
    await sync.getByLabel("CSV 文件名").fill(filename);
    await sync.getByLabel("每日自动更新").check();
    await sync.getByRole("button", { name: "立即同步并开启每日更新" }).click();
    await expect(sync).toBeHidden();
    await page.getByRole("button", { name: "定时采榜", exact: true }).click();
    const schedule = page.getByRole("dialog", { name: "定时采榜" });
    await expect(schedule.getByText("合成验收·都市榜", { exact: true })).toBeVisible();
    await expect(schedule.getByText("成功", { exact: true })).toBeVisible();
    await schedule.getByRole("button", { name: "立即运行" }).click();
    await expect(page.getByRole("status").filter({ hasText: "已保留原快照" })).toBeVisible();
    expect(await page.evaluate(() => window.novelStudio!.listRankings())).toHaveLength(1);

    writeFileSync(csvPath, `${header}1,站台回声测试书,测试作者,都市脑洞,3.1万,群像、都市异能,二期\n`);
    await schedule.getByRole("button", { name: "立即运行" }).click();
    await expect(page.getByRole("status").filter({ hasText: "保存 1 本书" })).toBeVisible();
    await schedule.getByRole("button", { name: "关闭", exact: true }).click();
    const ranks = await page.evaluate(() => window.novelStudio!.listRankings());
    expect(ranks.map((row) => row.sourceVersion)).toEqual(["二期", "一期"]);
    expect(ranks[0].entries[0].readerCount).toBe(31_000);

    await page.getByRole("button", { name: "热点关注", exact: true }).click();
    await page.getByLabel("关注词").fill("群像");
    await page.getByRole("button", { name: "关注", exact: true }).click();
    const watch = page
      .getByRole("article")
      .filter({ has: page.getByText("群像", { exact: true }) })
      .filter({ has: page.getByRole("button", { name: "取消关注", exact: true }) });
    await expect(watch.getByRole("listitem").filter({ hasText: "站台回声测试书" })).toBeVisible();
    await watch.getByRole("button", { name: "找开书模板" }).click();
    await expect(page.getByRole("heading", { name: "开书模板库" })).toBeVisible();
    await expect(page.getByLabel("搜索模板")).toHaveValue("群像");
    await page.getByLabel("搜索模板").clear();
    expect(await page.getByRole("button", { name: /^预览《/ }).count()).toBeGreaterThanOrEqual(36);
    await page.getByLabel("按榜单匹配排序").selectOption({ index: 1 });
    const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "明天的失物招领处" }) });
    await expect(card.getByText("榜内匹配 1 本", { exact: true })).toBeVisible();
    await card.getByRole("button", { name: "预览《明天的失物招领处》" }).click();
    const preview = page.getByRole("dialog");
    await expect(preview.getByRole("heading", { name: "前五章细纲" })).toBeVisible();
    await preview.getByRole("button", { name: "在立项台生成变体" }).click();
    const variant = page.getByRole("dialog", { name: "继续开书" });
    await variant.getByRole("button", { name: "更新立项草稿" }).click();
    await expect(page.getByRole("status").filter({ hasText: "立项草稿已保存" })).toBeVisible();
    await variant.getByRole("button", { name: "取消", exact: true }).click();
    await card.getByRole("button", { name: "预览《明天的失物招领处》" }).click();
    await preview.getByLabel("新作品书名").fill("北站遗失物验收");
    await preview.getByLabel("主角名").fill("纪遥");
    await preview.getByLabel("目标字数（万）").fill("60");
    await preview.getByRole("button", { name: "套用成品" }).click();
    await expect(page.getByRole("heading", { name: "北站遗失物验收", exact: true }).first()).toBeVisible();

    const result = await page.evaluate(async () => {
      const api = window.novelStudio!;
      const [created] = await api.listProjects();
      const before = await api.getProject(created.id);
      const approved = await api.approveContract(created.id);
      return { before, approved };
    });
    expect(result.before.summary.targetWords).toBe(600_000);
    expect(result.before.contract.approved).toBe(false);
    expect(result.before.contract.protagonistDesire).toContain("纪遥");
    expect(result.before.plans).toHaveLength(3);
    expect(result.before.plans.every((plan) => plan.status === "草稿")).toBe(true);
    expect(result.before.chapters.map((chapter) => chapter.number)).toEqual([1, 2, 3, 4, 5]);
    expect(result.before.chapters.every((chapter) => chapter.status === "章纲" && chapter.outline.trim())).toBe(true);
    expect(result.approved.approved).toBe(true);

    await page.getByRole("button", { name: "市场研究", exact: true }).click();
    await page.getByRole("button", { name: "样本拆书", exact: true }).click();
    await page.getByRole("button", { name: "粘贴文本", exact: true }).click();
    await page
      .getByRole("textbox", { name: "样本文本", exact: true })
      .fill("她在值班室找到一封迟到二十年的信。为了查清署名，她必须先说服拒绝开门的邻居。");
    await page.getByRole("button", { name: "预览切章" }).click();
    const sample = page.getByRole("dialog", { name: "确认样本导入" });
    const local = sample.getByRole("button", { name: "导入并本地拆书" });
    await expect(local).toBeDisabled();
    await sample.getByLabel("我确认拥有该材料的合法使用权").check();
    await local.click();
    await expect(page.getByRole("button", { name: "人工校正" })).toBeVisible();
    const stored = await page.evaluate(async () => ({
      books: await window.novelStudio!.listResearchBooks(),
      insights: await window.novelStudio!.listInsights(),
    }));
    expect(stored.books).toHaveLength(1);
    expect(stored.books[0]).toMatchObject({ cloudConsent: false, status: "已拆解" });
    expect(stored.insights[0].evidenceCount).toBe(1);
  } finally {
    await application.close();
    rmSync(root, { recursive: true, force: true });
  }
});
