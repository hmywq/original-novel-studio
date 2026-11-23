import type { RankingEntry, RankingSnapshot } from "./types";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export interface RankingTrack {
  key: string;
  source: string;
  listName: string;
  snapshots: RankingSnapshot[];
}

export interface WatchResult {
  term: string;
  hits: RankingEntry[];
  change: number | null;
}

function normalize(text: string) {
  return text.normalize("NFKC").trim().toLowerCase();
}

function rankingDay(snapshot: RankingSnapshot) {
  const version = snapshot.sourceVersion;
  if (version && /^\d{4}-\d{2}-\d{2}$/.test(version)) return version;
  return dayFormatter.format(new Date(snapshot.capturedAt));
}

export function watchTerms(values: unknown[]) {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const term = value.normalize("NFKC").trim();
    const key = normalize(term);
    if (term.length < 2 || term.length > 24 || seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
    if (terms.length === 12) break;
  }
  return terms;
}

export function rankingTracks(snapshots: RankingSnapshot[]) {
  const tracks = new Map<string, RankingTrack>();
  for (const snapshot of snapshots) {
    if (!Number.isFinite(Date.parse(snapshot.capturedAt))) continue;
    const key = JSON.stringify([snapshot.source, snapshot.listName]);
    let track = tracks.get(key);
    if (!track) {
      track = { key, source: snapshot.source, listName: snapshot.listName, snapshots: [] };
      tracks.set(key, track);
    }
    track.snapshots.push(snapshot);
  }
  return Array.from(tracks.values())
    .map((track) => ({
      ...track,
      snapshots: track.snapshots.sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt)),
    }))
    .sort((a, b) => Date.parse(b.snapshots[0].capturedAt) - Date.parse(a.snapshots[0].capturedAt));
}

function distinctBooks(snapshot?: RankingSnapshot) {
  const unique = new Map<string, RankingEntry>();
  for (const entry of [...(snapshot?.entries ?? [])].sort((a, b) => a.rank - b.rank)) {
    const key = entry.sourceUrl || JSON.stringify([entry.title, entry.author]);
    if (!unique.has(key)) unique.set(key, entry);
  }
  return Array.from(unique.values());
}

export function buildRankWatch(snapshots: RankingSnapshot[], terms: unknown[]) {
  const sorted = snapshots
    .filter((item) => Number.isFinite(Date.parse(item.capturedAt)))
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
  const latestAttempt = sorted[0];
  const usable = sorted
    .filter((item) => item.status !== "失败" && item.entries.length > 0)
    .sort((a, b) => rankingDay(b).localeCompare(rankingDay(a)));
  const latest = usable[0];
  const previous =
    latest &&
    usable.find(
      (item) =>
        item.source === latest.source &&
        item.listName === latest.listName &&
        !(item.sourceVersion && latest.sourceVersion === item.sourceVersion) &&
        rankingDay(item) !== rankingDay(latest),
    );
  const current = distinctBooks(latest);
  const prior = distinctBooks(previous);
  const comparable =
    latest?.status === "成功" &&
    previous?.status === "成功" &&
    current.length === prior.length &&
    current.length > 0 &&
    current.every((entry, index) => entry.rank === prior[index]?.rank);
  const tally = (term: string, filter: (entry: RankingEntry) => boolean): WatchResult => {
    const hits = current.filter(filter);
    return { term, hits, change: comparable ? hits.length - prior.filter(filter).length : null };
  };
  const watched = watchTerms(terms).map((term) =>
    tally(term, (entry) =>
      [entry.title, entry.genre, ...entry.tags].some((value) => normalize(value).includes(normalize(term))),
    ),
  );
  const tagNames = new Map<string, string>();
  for (const entry of current) {
    for (const tag of entry.tags) {
      const key = normalize(tag);
      if (key.length >= 2 && key !== normalize(entry.genre) && !tagNames.has(key)) tagNames.set(key, tag.trim());
    }
  }
  const topTags = Array.from(tagNames, ([key, name]) =>
    tally(name, (entry) => entry.tags.some((tag) => normalize(tag) === key)),
  )
    .sort((a, b) => b.hits.length - a.hits.length || a.term.localeCompare(b.term, "zh-CN"))
    .slice(0, 12);
  return { latestAttempt, latest, previous, watched, topTags, sampleSize: current.length };
}
