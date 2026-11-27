import { tokenEmail } from './_access';
import type { D1 } from './_shared';

/**
 * Who may use a plan lives in the access table: one owner row, and an editor row per person it is shared
 * with. A plan with no rows is everyone's: saved before plans were private, until someone makes it theirs.
 */
export type Role = 'owner' | 'editor' | 'everyone';

/** The signed-in person; the library middleware has already checked the token. */
export const caller = (request: Request) => tokenEmail(request.headers.get('Cf-Access-Jwt-Assertion'));

/** SQL, true when the plan whose id is `column` is everyone's or shared with the email bound to its `?`. */
export const visibleTo = (column: string) =>
  `(NOT EXISTS (SELECT 1 FROM access a WHERE a.project_id = ${column}) OR EXISTS (SELECT 1 FROM access a WHERE a.project_id = ${column} AND a.email = ?))`;

/** SQL, true when the plan whose id is `column` is everyone's or owned by the email bound to its `?`. */
export const ownedBy = (column: string) =>
  `(NOT EXISTS (SELECT 1 FROM access a WHERE a.project_id = ${column}) OR EXISTS (SELECT 1 FROM access a WHERE a.project_id = ${column} AND a.email = ? AND a.role = 'owner'))`;

/** What this person may do with a plan, or null when it is someone else's and not shared with them. */
export async function roleOf(db: D1, id: string, email: string | null): Promise<Role | null> {
  const { results } = await db.prepare('SELECT email, role FROM access WHERE project_id = ?').bind(id).all<{ email: string; role: Role }>();
  if (results.length === 0) return 'everyone';
  return results.find(row => row.email === email)?.role ?? null;
}

/** Makes `email` the owner of a plan nobody owns yet. */
export const claimStatement = (db: D1, id: string, email: string) =>
  db.prepare(`INSERT OR IGNORE INTO access (project_id, email, role) SELECT ?, ?, 'owner' WHERE NOT EXISTS (SELECT 1 FROM access WHERE project_id = ?)`)
    .bind(id, email, id);

