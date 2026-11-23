import { expect, test } from "@playwright/test";

test("浏览器本地检查保留正文与未完成状态，重开后仍不能误认语义检查通过", async ({ page }, testInfo) => {
  const remoteRequests: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if ((url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "127.0.0.1") {
      remoteRequests.push(url.origin);
      await route.abort();
      return;
    }
    await route.continue();
  });
  const openChapter = async () => {
    await page.locator(".project-row").filter({ hasText: "回声备忘录" }).click();
    await page.getByRole("button", { name: /写作台/ }).click();
    await page.getByRole("button", { name: /回声的代价/ }).click();
  };
  await page.goto("/");
  await openChapter();
  const manuscript = page.getByRole("textbox", { name: "章节正文" });
  const content = "我把退回款项的凭据压在桌上。她核对了日期，将旧合同划去一行。";
  await manuscript.fill(content);
  await page.getByRole("button", { name: "运行质检" }).click();
  const panel = page.getByRole("region", { name: "连续性检查" });
  await expect(panel).toContainText("连续性检查：未完成检查");
  await expect(panel).toContainText("浏览器预览仅完成本地规则检查");
  await expect(panel).toContainText("未运行模型语义与跨章连续性检查");
  await expect(manuscript).toHaveValue(content);
  await expect(page.getByRole("button", { name: "确认定稿" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "采纳并进入待定稿" })).toHaveCount(0);

  await page.reload();
  await openChapter();
  await expect(manuscript).toHaveValue(content);
  await expect(panel).toContainText("连续性检查：未完成检查");
  await expect(panel).toContainText("浏览器预览仅完成本地规则检查");
  await expect(page.getByRole("button", { name: "确认定稿" })).toHaveCount(0);
  expect(remoteRequests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("continuity-local-check.png"), fullPage: true });
});
