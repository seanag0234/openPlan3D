// The slice of the D1 API these functions use, so the repo needs no @cloudflare/workers-types.
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface D1 {
  prepare(sql: string): D1Statement;
  /** Runs the statements in order as one transaction: all of them take effect or none. */
  batch(statements: D1Statement[]): Promise<{ meta: { changes: number } }[]>;
}

/** Bindings set on the Pages project (Pulumi in production, command-line flags in `wrangler pages dev`). */
export interface Env {
  LIBRARY: D1;
  /** `https://<team>.cloudflareaccess.com`: the sign-in token's issuer, and where its public keys live. */
  ACCESS_TEAM_DOMAIN?: string;
  /** The Access application's audience tag. */
  ACCESS_AUD?: string;
}

export interface Context<P extends string = never> {
  request: Request;
  env: Env;
  params: Record<P, string>;
  next(): Promise<Response>;
}

/** D1 refuses a row over 2,000,000 bytes; the rest of the row is the name and a preview of at most MAX_THUMBNAIL_BYTES. */
export const MAX_PLAN_BYTES = 1_850_000;
export const MAX_THUMBNAIL_BYTES = 100_000;

export const etag = (revision: number) => `"${revision}"`;

/** The revision named by an `If-Match` header, or null when there is none. NaN never matches a row. */
export function matchedRevision(request: Request): number | null {
  const header = request.headers.get('If-Match');
  return header === null ? null : Number(header.replace(/^W\//, '').replaceAll('"', ''));
}

export const status = (code: number, message?: string, headers?: HeadersInit) =>
  new Response(message ?? null, { status: code, headers: { 'Cache-Control': 'no-store', ...headers } });

export async function readLimited(request: Request, limit: number): Promise<string | null> {
  if (Number(request.headers.get('Content-Length') ?? 0) > limit) return null;
  const text = await request.text();
  return new TextEncoder().encode(text).byteLength > limit ? null : text;
}
