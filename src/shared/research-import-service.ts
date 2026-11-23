import type { Genre, ImportPreview, ResearchBook } from "./types";

export function assertLocalResearchImportRights(rightsConfirmed: boolean): void {
  if (!rightsConfirmed) {
    throw new Error("必须确认拥有材料的合法使用权");
  }
}

export const RESEARCH_URL_ERROR = "来源链接只允许不含账号或密码的 HTTP/HTTPS 地址";

export function isResearchSourceUrl(value: string): boolean {
  if (!value) return true;
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return !url.username && !url.password;
  } catch {
    return false;
  }
}

interface PrepareLocalResearchBookOptions {
  createId: () => string;
  currentTimestamp: () => string;
}

function researchBookTitle(fileName: string): string {
  const baseName = fileName.split(/[\\/]/).at(-1) ?? fileName;
  const extensionStart = baseName.lastIndexOf(".");
  return extensionStart > 0 ? baseName.slice(0, extensionStart) : baseName;
}

export function prepareLocalResearchBook(
  preview: ImportPreview,
  genre: Genre,
  rightsConfirmed: boolean,
  cloudConsent: boolean,
  options: PrepareLocalResearchBookOptions,
): ResearchBook {
  assertLocalResearchImportRights(rightsConfirmed);
  const reference = preview.reference;
  const url = reference?.url.trim() ?? "";
  const platform = reference?.platform.trim() ?? "";
  if (!isResearchSourceUrl(url)) throw new Error(RESEARCH_URL_ERROR);
  return {
    id: options.createId(),
    title: reference?.title.trim() || researchBookTitle(preview.fileName),
    author: reference?.author.trim() || "未标注",
    genre,
    sourceType: preview.sourceType,
    ...(url ? { sourceUrl: url } : {}),
    ...(platform ? { sourcePlatform: platform } : {}),
    chapterCount: preview.chapters.length,
    wordCount: preview.totalWords,
    rightsConfirmed,
    cloudConsent,
    importedAt: options.currentTimestamp(),
    status: "待拆解",
  };
}
