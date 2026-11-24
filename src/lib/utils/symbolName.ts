import type { Project } from '$lib/models/types';

/** The name a picture added to this plan was given, or '' when it has none. Built-in symbols are named elsewhere. */
export function customSymbolName(defId: string, project: Pick<Project, 'customEntourage'> | null | undefined): string {
  return project?.customEntourage?.find(def => def.id === defId)?.name?.trim() ?? '';
}
