import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

test("选择跨平台来源、校正拆书洞察、保存脑洞并套用两种模板", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "novel-studio-workflow-"));
  const app = await electron.launch({
    args: ["."],
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      NOVEL_STUDIO_WORKSPACE: path.join(root, "workspace"),
      NOVEL_STUDIO_USER_DATA: path.join(root, "profile"),
      NOVEL_STUDIO_DISABLE_SINGLE_INSTANCE_LOCK: "1",
    },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "市场研究", exact: true }).click();
    for (const name of ["番茄小说", "起点中文网", "盐言故事", "抖音", "小红书", "晋江文学城", "豆瓣阅读", "红果短剧"])
      await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "盐言故事", exact: true }).click();
    const knownLead = page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: /短篇故事影响力榜/ }) });
    await knownLead.getByRole("button", { name: "加入选书" }).click();
    await expect(knownLead.getByText("待阅读", { exact: true })).toBeVisible();
    await knownLead.getByRole("button", { name: "写拆书笔记" }).click();
    const notes = page.getByRole("dialog", { name: "记录拆书结构" });
    await notes.getByLabel("开篇承诺").fill("掉在楼梯间的收据打破一项口头承诺。");
    await notes.getByLabel("冲突怎么反复发生").fill("让当事人必须在公开证据和保留合作之间选择，选择改变下一轮的筹码。");
    await notes.getByRole("button", { name: "保存结构笔记" }).click();
    const [before] = await page.evaluate(() => window.novelStudio!.listInsights());
    await page.getByRole("button", { name: "人工校正" }).click();
    const correction = page.getByRole("dialog", { name: "人工校正洞察" });
    await correction.getByLabel("冲突发动机").fill("公开证据会让主角失去最重要的一段合作关系。");
    await correction.getByRole("button", { name: "保存校正" }).click();
    await expect(correction).toBeHidden();
    await expect(page.getByText("公开证据会让主角失去最重要的一段合作关系。", { exact: true })).toBeVisible();
    const [after] = await page.evaluate(() => window.novelStudio!.listInsights());
    expect(after).toEqual({ ...before, conflictEngine: "公开证据会让主角失去最重要的一段合作关系。" });
    await page.getByRole("button", { name: "借结构写新故事" }).click();
    const editor = page.getByRole("dialog", { name: "记一个脑洞" });
    await expect(editor.getByLabel("原始脑洞")).toHaveValue(/失去最重要的一段合作关系/);
    await expect(editor.getByLabel("创作方向")).toHaveValue("短剧改编向");
    await editor.getByLabel("必须保留").fill("女主必须亲手归还旧收据。");
    await editor.getByRole("button", { name: "保存脑洞" }).click();
    const brain = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "从一条拆书结构展开" }) });
    await expect(brain.getByText(/女主必须亲手归还/)).toBeVisible();
    const [original] = await page.evaluate(() => window.novelStudio!.listIncubations());
    expect(original.positioning.targetWords).toBe(40_000);
    expect(original.evidence.insightIds).toHaveLength(1);
    await brain.getByRole("button", { name: "派生新方向" }).click();
    const branch = page.getByRole("dialog", { name: "派生脑洞" });
    await branch.getByLabel("创作方向").selectOption("万字短篇");
    await branch.getByRole("button", { name: "保存并展开" }).click();
    const creation = page.getByRole("dialog", { name: "继续开书" });
    await expect(creation.getByText(/万字短篇/).first()).toBeVisible();
    await expect(creation.getByRole("button", { name: "生成三套方案" })).toBeVisible();
    await creation.getByRole("button", { name: "取消", exact: true }).click();
    const ideas = await page.evaluate(() => window.novelStudio!.listIncubations());
    expect(ideas.find((item) => item.idea?.parentId === original.id)).toMatchObject({
      positioning: { lengthShape: "万字短篇", targetWords: 10_000 },
    });

    await page.getByRole("button", { name: "模板库", exact: true }).click();
    await page.getByLabel("创作方向").selectOption("短剧改编向");
    await expect(page.getByRole("button", { name: /^预览《/ })).toHaveCount(6);
    await page
      .getByRole("button", { name: /^预览《/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "前三集改编预演" })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
    await page.getByLabel("创作方向").selectOption("万字短篇");
    await expect(page.getByRole("button", { name: /^预览《/ })).toHaveCount(7);
    await page
      .getByRole("button", { name: /^预览《/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "万字短篇五节细纲" })).toBeVisible();
    const preview = page.getByRole("dialog");
    await preview.getByLabel("新作品书名").fill("盐言万字验收");
    await preview.getByRole("button", { name: "套用成品" }).click();
    await expect(page.getByRole("heading", { name: "盐言万字验收" })).toBeVisible();
    const project = await page.evaluate(async () =>
      window.novelStudio!.getProject((await window.novelStudio!.listProjects())[0].id),
    );
    expect(project.contract).toMatchObject({ lengthShape: "万字短篇", approved: false });
    expect(project.chapters).toHaveLength(5);
    expect(project.summary.targetWords).toBe(10_000);
    expect(project.chapters.at(-1)?.title).toBe("余波收束");
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("从模型来源读取清单、搜索并切换默认模型", async () => {
  const server = createServer((request, response) => {
    if (request.url !== "/v1/models") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ data: [{ id: "mock-structure-model" }, { id: "mock-draft-model" }] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const root = mkdtempSync(path.join(os.tmpdir(), "novel-model-catalog-"));
  const app = await electron.launch({
    args: ["."],
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      NOVEL_STUDIO_WORKSPACE: path.join(root, "workspace"),
      NOVEL_STUDIO_USER_DATA: path.join(root, "profile"),
      NOVEL_STUDIO_DISABLE_SINGLE_INSTANCE_LOCK: "1",
    },
  });
  try {
    const page = await app.firstWindow();
    await page.evaluate(
      async (url) =>
        window.novelStudio!.saveAiProfile({
          id: "mock-local-source",
          name: "模型清单验收",
          baseUrl: url,
          apiSurface: "openai-chat",
          defaultModel: "mock-draft-model",
          authScheme: "none",
          extraHeaders: {},
          extraQuery: {},
          localEndpoint: true,
          enabled: true,
          sortOrder: 0,
          notes: "",
          lastUsedAt: null,
          lastError: null,
          lastTestAt: null,
          lastTestOk: null,
        }),
      baseUrl,
    );
    await page.getByRole("button", { name: "系统设置", exact: true }).click();
    await page.getByRole("button", { name: /查找 \/ 刷新模型/ }).click();
    const lookup = page.getByRole("dialog", { name: /查找模型.*验收/ });
    await lookup.getByLabel("搜索模型").fill("structure");
    await lookup.getByLabel("模型清单").selectOption("mock-structure-model");
    await lookup.getByRole("button", { name: "设为来源默认模型" }).click();
    await expect(lookup).toBeHidden();
    const [profile] = await page.evaluate(() => window.novelStudio!.listAiProfiles());
    expect(profile.defaultModel).toBe("mock-structure-model");
  } finally {
    await app.close();
    server.close();
    rmSync(root, { recursive: true, force: true });
  }
});
