import type { D1, D1Statement } from './_shared';

/** A string this long that is a data URL (a picture or model) is stored once in blobs. */
const BLOB_MIN = 10_000;
const REF = 'o3d-blob:sha256:';

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** The statements that append one save to the log: its large data URLs, then the version itself. */
export async function versionStatements(db: D1, id: string, revision: number, body: string): Promise<D1Statement[]> {
  const hashes = new Map<string, string>();
  JSON.parse(body, (_key, value) => {
    if (typeof value === 'string' && value.length >= BLOB_MIN && value.startsWith('data:')) hashes.set(value, '');
    return value;
  });
  for (const value of hashes.keys()) hashes.set(value, await sha256(value));
  const packed = JSON.stringify(JSON.parse(body), (_key, value) => typeof value === 'string' && hashes.has(value) ? REF + hashes.get(value) : value);
  return [
    ...[...hashes].map(([data, hash]) => db.prepare('INSERT OR IGNORE INTO blobs (hash, data) VALUES (?, ?)').bind(hash, data)),
    // Logged only when the plan's row now holds exactly this save, so a refused save leaves no version.
    db.prepare('INSERT INTO versions (project_id, revision, saved_at, name, body) SELECT id, revision, ?, name, ? FROM projects WHERE id = ? AND revision = ? AND body = ?')
      .bind(new Date().toISOString(), packed, id, revision, body),
  ];
}

/** The statement that logs a delete, to run just before the delete with the same revision. */
export function deleteStatement(db: D1, id: string, revision: number): D1Statement {
  return db.prepare('INSERT INTO versions (project_id, revision, saved_at, name, body) SELECT id, revision + 1, ?, name, NULL FROM projects WHERE id = ? AND revision = ?')
    .bind(new Date().toISOString(), id, revision);
}

/** A logged version with its data URLs put back, or null when a referenced blob is missing. */
export async function unpack(db: D1, packed: string): Promise<string | null> {
  const hashes = [...new Set([...packed.matchAll(/"o3d-blob:sha256:([0-9a-f]{64})"/g)].map(match => match[1]))];
  const blobs = new Map<string, string>();
  for (const hash of hashes) {
    const row = await db.prepare('SELECT data FROM blobs WHERE hash = ?').bind(hash).first<{ data: string }>();
    if (!row) return null;
    blobs.set(hash, row.data);
  }
  return hashes.length === 0 ? packed : JSON.stringify(JSON.parse(packed, (_key, value) =>
    typeof value === 'string' && value.startsWith(REF) && blobs.has(value.slice(REF.length)) ? blobs.get(value.slice(REF.length)) : value));
}

