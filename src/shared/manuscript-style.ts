import { analyzeAiFlavor, whitelistRangesFor } from "./ai-flavor";
import { AI_FLAVOR_FEATURES, type AiFlavorFeature } from "./ai-flavor-lexicon";

export interface ManuscriptStyleHint {
  paragraph: number;
  start: number;
  end: number;
  excerpt: string;
  labels: string[];
}

const MANUSCRIPT_FEATURES: readonly AiFlavorFeature[] = [
  ...AI_FLAVOR_FEATURES.filter((feature) => feature.kind !== "标点"),
  {
    id: "manuscript-formulaic-ending",
    label: "章尾套式",
    kind: "结构",
    // 多行模式下用负向前瞻锚定正文末尾，避免把章中的同句当成收尾。
    pattern:
      "(?:^|[。！？!?])[^\\S\\n]*(?:然而[，,][^\\S\\n]*)?(?:(?:这?一切|故事)才刚刚?开始|更大的(?:风暴|危机)即将来临)[。！？!?]?(?![\\s\\S])",
    isRegExp: true,
    severity: "advisory",
    ratio: 0,
    source: "章节文风检查",
  },
];

export function inspectManuscriptStyle(content: string, whitelist: readonly string[] = []): ManuscriptStyleHint[] {
  let offset = 0;
  const paragraphs = Array.from(content.matchAll(/\S[^\r\n]*/gu), (match, index) => {
    const text = match[0].trimEnd();
    const scanStart = offset;
    const scanEnd = scanStart + text.length;
    offset = scanEnd + 1;
    return {
      paragraph: index + 1,
      start: match.index,
      end: match.index + text.length,
      scanStart,
      scanEnd,
      text,
      labels: new Set<string>(),
      firstMatch: Infinity,
    };
  });
  // 检查时去掉缩进和空段，以便识别段首规则。原文选区继续使用未归一化的偏移。
  const reviewText = paragraphs.map((paragraph) => paragraph.text).join("\n");
  const { hits } = analyzeAiFlavor(reviewText, {
    lexicon: MANUSCRIPT_FEATURES,
    whitelist: whitelistRangesFor(reviewText, whitelist),
  });

  for (const hit of hits) {
    const label = hit.label.replace(/^一级禁用/u, "");
    let nextParagraph = 0;
    for (const range of hit.ranges) {
      // 相邻句规则可能吃进上一段的句号和换行，定位时从实际句子开头计算。
      const anchor = range.start + (reviewText.slice(range.start, range.end).match(/^[\s。！？!?]+/u)?.[0].length ?? 0);
      while (nextParagraph < paragraphs.length && paragraphs[nextParagraph].scanEnd <= anchor) nextParagraph += 1;
      for (
        let index = nextParagraph;
        index < paragraphs.length && paragraphs[index].scanStart < range.end;
        index += 1
      ) {
        const paragraph = paragraphs[index];
        paragraph.labels.add(label);
        paragraph.firstMatch = Math.min(paragraph.firstMatch, Math.max(0, anchor - paragraph.scanStart));
      }
    }
  }

  return paragraphs.flatMap(({ paragraph, start, end, labels, firstMatch }) => {
    if (labels.size === 0) return [];
    const excerptStart = end - start > 120 ? start + Math.max(0, firstMatch - 24) : start;
    const excerptEnd = Math.min(excerptStart + 120, end);
    const excerpt = `${excerptStart > start ? "…" : ""}${content.slice(excerptStart, excerptEnd)}${excerptEnd < end ? "…" : ""}`;
    return [{ paragraph, start, end, excerpt, labels: [...labels] }];
  });
}
