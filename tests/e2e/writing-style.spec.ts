import { expect, test } from "@playwright/test";

test("文风检查将长正文里的选中段落滚动到可见区域", async ({ page }) => {
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
  await page.goto("/");
  await page.locator(".project-row").filter({ hasText: "回声备忘录" }).click();
  await page.getByRole("button", { name: /写作台/ }).click();
  await page.getByRole("button", { name: /回声的代价/ }).click();

  const paragraph = "她深吸一口气，推开铁门。";
  const leadIn = ["木门边挂着一串已经锈尽的钥匙。", "小巷里的积水漫过第三块石砖。", "灯下搁着一只灰纸盒。", ""].join(
    "\n\n",
  );
  const manuscript = page.getByRole("textbox", { name: "章节正文" });
  await manuscript.fill(`${leadIn.repeat(30)}${paragraph}`);
  await manuscript.evaluate((editor: HTMLTextAreaElement) => {
    editor.scrollTop = 0;
  });

  await page.getByRole("button", { name: "文风检查" }).click();
  await page.getByRole("region", { name: "文风检查结果" }).getByRole("button", { name: "定位正文" }).click();

  await expect(manuscript).toBeFocused();
  const located = await manuscript.evaluate((editor: HTMLTextAreaElement) => ({
    text: editor.value.slice(editor.selectionStart, editor.selectionEnd),
    scrollTop: editor.scrollTop,
    lastScreen: editor.scrollHeight - editor.clientHeight,
  }));
  expect(located.text).toBe(paragraph);
  expect(located.lastScreen).toBeGreaterThan(0);
  expect(located.scrollTop).toBeGreaterThanOrEqual(located.lastScreen - 32);
  expect(remoteRequests).toEqual([]);
});
