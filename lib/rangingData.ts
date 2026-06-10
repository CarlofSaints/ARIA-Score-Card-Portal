import { readJson } from "./blob";
import type { RangingChannelData, RangingIndexEntry } from "./types";

const indexKey = (slug: string) => `${slug}/data/ranging/index.json`;
const channelKey = (slug: string, channel: string) =>
  `${slug}/data/ranging/${channel.toUpperCase()}.json`;

export async function loadRangingIndex(slug: string): Promise<RangingIndexEntry[]> {
  return readJson<RangingIndexEntry[]>(indexKey(slug), []);
}

export async function loadRangingChannel(
  slug: string,
  channel: string
): Promise<RangingChannelData | null> {
  return readJson<RangingChannelData | null>(channelKey(slug, channel), null);
}

// Load every uploaded ranging channel (one record per RANGE_<CHANNEL> sheet).
export async function loadAllRanging(slug: string): Promise<RangingChannelData[]> {
  const index = await loadRangingIndex(slug);
  const records = await Promise.all(
    index.map((e) => loadRangingChannel(slug, e.channel))
  );
  return records.filter((r): r is RangingChannelData => !!r);
}
