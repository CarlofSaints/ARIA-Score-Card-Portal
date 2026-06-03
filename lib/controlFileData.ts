/* ──────────────────────────────────────────────────────────────
   Control File Data — raw PMF / store control file storage
   ────────────────────────────────────────────────────────────── */

import { readJson, writeJson } from "./blob";

type FileType = "pmf" | "store-control";

function blobKey(slug: string, fileType: FileType): string {
  return `${slug}/data/${fileType}-raw.json`;
}

/**
 * Read raw rows for a control file type.
 * Returns an array of objects (each row is a key-value record with original column names).
 */
export async function getControlFileData(
  slug: string,
  fileType: FileType
): Promise<Record<string, string>[]> {
  return readJson<Record<string, string>[]>(blobKey(slug, fileType), []);
}

/**
 * Save raw PMF rows to blob.
 */
export async function savePmfData(
  slug: string,
  rows: Record<string, string>[]
): Promise<void> {
  await writeJson(blobKey(slug, "pmf"), rows);
}

/**
 * Get the column headers from stored PMF data.
 * Returns an empty array if no PMF data exists.
 */
export async function getPmfHeaders(slug: string): Promise<string[]> {
  const rows = await getControlFileData(slug, "pmf");
  if (rows.length === 0) return [];
  return Object.keys(rows[0]);
}
