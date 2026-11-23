import { describe, expect, it } from "vitest";
import { inspectManuscriptStyle } from "../src/shared/manuscript-style";

describe("inspectManuscriptStyle", () => {
  it("将同段套话和重复句式合并，并保留原始正文的选区", () => {
    const paragraph = "他掀开铁盖。他深吸一口气，拿起铜钥匙。";
    const content = `雨打在屋瓦上。\r\n\r\n　${paragraph}  \r\n\r\n这一切才刚刚开始。\r\n`;
    const hints = inspectManuscriptStyle(content);

    expect(hints.map((hint) => hint.paragraph)).toEqual([2, 3]);
    expect(hints[0].labels).toEqual([expect.stringContaining("套话动作"), "相邻句结构同构"]);
    expect(hints[1].labels).toEqual(["章尾套式"]);
    expect(hints.map(({ start, end }) => content.slice(start, end))).toEqual([paragraph, "这一切才刚刚开始。"]);
    expect(hints[0].excerpt).toBe(paragraph);
  });

  it("沿用项目白名单，且只在章末识别章尾套式", () => {
    const content = "这一切才刚刚开始。\n\n她深吸一口气。\n\n钟响了。";

    expect(inspectManuscriptStyle(content)).toHaveLength(1);
    expect(inspectManuscriptStyle(content, ["深吸一口气"])).toEqual([]);
    expect(inspectManuscriptStyle("她说：“这一切才刚刚开始。”")).toEqual([]);
    expect(inspectManuscriptStyle("　这一切才刚刚开始。", ["才刚刚开始"])).toEqual([]);
    expect(inspectManuscriptStyle("  \n")).toEqual([]);
  });

  it("识别有中文缩进的段首套话并在摘录中显示命中位置", () => {
    const opening = " 　 值得一提的是，门一直锁着。";
    const lateCliche = `${"他沿门廊绕过桌椅，".repeat(20)}深吸一口气。`;
    const content = `${opening}\n${lateCliche}`;
    const hints = inspectManuscriptStyle(content);

    expect(hints[0].labels).toContain("起首语");
    expect(hints[1].excerpt).toContain("深吸一口气");
    expect(content.slice(hints[1].start, hints[1].end)).toBe(lateCliche);
  });
});
