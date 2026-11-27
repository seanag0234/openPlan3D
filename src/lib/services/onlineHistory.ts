import { readProject } from '$lib/utils/projectValidation';
import type { Project } from '$lib/models/types';

/** The online library's log of every save and delete (functions/api/library/_history.ts). */
export const onlineHistory = import.meta.env.PUBLIC_CLOUD_LIBRARY === 'true';

export interface OnlineVersion { seq: number; revision: number; savedAt: string; name: string; deleted: boolean }
export interface DeletedPlan { id: string; name: string; deletedAt: string; seq: number }

const UNREACHABLE = 'The online history could not be reached. Try again when you are online.';

async function call(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try { response = await fetch(`/api/library${path}`, { cache: 'no-store', ...init }); }
  catch { throw new Error(UNREACHABLE); }
  if (!response.ok) throw new Error((await response.text().catch(() => '')) || UNREACHABLE);
  return response;
}

const at = (id: string) => `/${encodeURIComponent(id)}`;

/** Newest first, a page at a time: pass the last seq seen to get older ones. */
export async function listOnlineVersions(id: string, before?: number): Promise<OnlineVersion[]> {
  return (await call(`${at(id)}/versions${before ? `?before=${before}` : ''}`)).json();
}

export async function loadOnlineVersion(id: string, seq: number): Promise<Project> {
  const project = readProject(await (await call(`${at(id)}/versions/${seq}`)).json());
  if (project.id !== id) throw new Error('This version belongs to a different project.');
  return project;
}

export async function listDeletedPlans(): Promise<DeletedPlan[]> {
  return (await call('/deleted')).json();
}

/** Puts a deleted plan back in the online library as the given save; the list then shows it again. */
export async function bringBack(plan: DeletedPlan): Promise<void> {
  await call(`${at(plan.id)}/versions/${plan.seq}`, { method: 'POST' });
}

/** Who may open a plan (functions/api/library/[id]/people.ts); `owner` is null for a plan everyone sees. */
export interface PlanPeople { you: string | null; owner: string | null; people: string[] }

export async function listPeople(id: string): Promise<PlanPeople> {
  return (await call(`${at(id)}/people`)).json();
}

/** Shares the plan with `email`; without one, makes a plan everyone sees the caller's own. */
export async function sharePlan(id: string, email?: string): Promise<void> {
  await call(`${at(id)}/people`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(email ? { email } : {}) });
}

export async function stopSharing(id: string, email: string): Promise<void> {
  await call(`${at(id)}/people?email=${encodeURIComponent(email)}`, { method: 'DELETE' });
}

