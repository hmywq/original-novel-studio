import type { RankingCaptureSchedule, RankingSnapshot } from "./types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const BEIJING_OFFSET_MS = 8 * HOUR_MS;
const DAILY_CAPTURE_OFFSET_MS = 15 * HOUR_MS + 20 * 60 * 1000;

function beijingMidnight(time: number) {
  return Math.floor((time + BEIJING_OFFSET_MS) / DAY_MS) * DAY_MS - BEIJING_OFFSET_MS;
}

export function nextRankingRun(frequency: RankingCaptureSchedule["frequency"], from = new Date()) {
  const time = from.getTime();
  const next = frequency === "每日" ? beijingMidnight(time) + DAY_MS + DAILY_CAPTURE_OFFSET_MS : time + 7 * DAY_MS;
  return new Date(next).toISOString();
}

export function dailyRankingRun(lastRunAt: string | null, from: Date, existingNextRunAt?: string) {
  const time = from.getTime();
  const midnight = beijingMidnight(time);
  const ranToday = Date.parse(lastRunAt ?? "") >= midnight;
  const cutoff = midnight + DAILY_CAPTURE_OFFSET_MS + (ranToday ? DAY_MS : 0);

  if (!existingNextRunAt) return new Date(Math.max(cutoff, time)).toISOString();

  // Preserve an already-due time set at activation. Older schedules can roll forward to today's cutoff.
  const existingTime = Date.parse(existingNextRunAt);
  return existingTime >= cutoff && existingTime <= time ? existingNextRunAt : new Date(cutoff).toISOString();
}

export function completeRankingSchedule(
  schedule: RankingCaptureSchedule,
  snapshot: RankingSnapshot,
  from = new Date(),
): RankingCaptureSchedule {
  return {
    ...schedule,
    lastRunAt: snapshot.capturedAt,
    nextRunAt: nextRankingRun(schedule.frequency, schedule.frequency === "每日" ? new Date(snapshot.capturedAt) : from),
    lastStatus: snapshot.status,
    lastError: snapshot.error,
  };
}

export function failRankingSchedule(
  schedule: RankingCaptureSchedule,
  error: unknown,
  from = new Date(),
): RankingCaptureSchedule {
  return {
    ...schedule,
    lastRunAt: from.toISOString(),
    nextRunAt: nextRankingRun(schedule.frequency, from),
    lastStatus: "失败",
    lastError: error instanceof Error ? error.message : String(error),
  };
}
