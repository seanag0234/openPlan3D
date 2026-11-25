import type Anthropic from '@anthropic-ai/sdk';
import { get, writable } from 'svelte/store';
import { viaOpenRouter, type ClaudeSettings } from '$lib/stores/aiKeys';
import { currentProject, applyExternalProject, afterUndoGroup } from '$lib/stores/project';
import { applyAgentOps, AgentOpError } from '$lib/utils/agentOps';
import { CLAUDE_SYSTEM, CLAUDE_TOOLS, changesToOps, planForClaude, type PieceChange } from '$lib/utils/claudeTools';

const MODELS = { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5' } as const;
const OPENROUTER_MODELS = { opus: 'anthropic/claude-opus-5.5', sonnet: 'anthropic/claude-sonnet-5.5' } as const;
/** A turn that calls tools this many times without answering is cut off. */
const MAX_STEPS = 12;

/** What the chat shows: her words, Claude's, and each change it proposed with how it ended. */
export type ChatEntry =
  | { kind: 'user' | 'claude'; text: string }
  | { kind: 'change'; summary: string; outcome: 'waiting' | 'done' | 'declined' | 'failed'; detail?: string };

/** The change waiting for her tap; the chat resolves it with Do it (true) or No (false). */
export const pendingChange = writable<{ summary: string; answer: (yes: boolean) => void } | null>(null);

function askHer(summary: string): Promise<boolean> {
  return new Promise(resolve => pendingChange.set({ summary, answer: yes => { pendingChange.set(null); resolve(yes); } }));
}

async function client(settings: ClaudeSettings) {
  const key = settings.apiKey.trim();
  // Loaded on the first question, so the editor carries none of it for people who never ask.
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  // The key is theirs, held in this browser only; the request goes from the browser straight to the provider.
  return viaOpenRouter(key)
    ? new Anthropic({ apiKey: null, authToken: key, baseURL: 'https://openrouter.ai/api', dangerouslyAllowBrowser: true })
    : new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
}

async function runTool(use: Anthropic.Beta.BetaToolUseBlock, show: (entry: ChatEntry) => void): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
  const result = (content: string, is_error = false): Anthropic.Beta.BetaToolResultBlockParam => ({ type: 'tool_result', tool_use_id: use.id, content, ...(is_error ? { is_error } : {}) });
  const project = get(currentProject);
  if (!project) return result('No plan is open.', true);
  if (use.name === 'read_plan') return result(JSON.stringify(planForClaude(project)));
  if (use.name !== 'change_plan') return result(`There is no tool "${use.name}".`, true);

  const input = use.input as { summary?: unknown; changes?: unknown };
  if (typeof input?.summary !== 'string' || !Array.isArray(input.changes)) return result('Give "summary" (a sentence) and "changes" (a list).', true);
  const summary = input.summary.slice(0, 200);
  let ops;
  try {
    ops = changesToOps(project, input.changes as PieceChange[]);
    applyAgentOps(project, ops); // checked before she is asked, so she is never asked about something that cannot happen
  } catch (error) {
    return result(error instanceof AgentOpError ? error.message : String(error), true);
  }
  const entry: ChatEntry = { kind: 'change', summary, outcome: 'waiting' };
  show(entry);
  if (!(await askHer(summary))) {
    entry.outcome = 'declined';
    show(entry);
    return result('They tapped No; nothing changed. Ask what they would like instead.');
  }
  try {
    // Waits for a drag in progress to end, then lands as one Undo step on what the drag left.
    await afterUndoGroup(() => {
      const open = get(currentProject);
      if (!open || open.id !== project.id) throw new AgentOpError('A different plan is open now.');
      applyExternalProject(applyAgentOps(open, ops).project, `Claude: ${summary}`.slice(0, 80));
    }, 10_000);
    entry.outcome = 'done';
    show(entry);
    return result('Done. They can undo it with Undo.');
  } catch (error) {
    entry.outcome = 'failed';
    entry.detail = error instanceof Error ? error.message : String(error);
    show(entry);
    return result(`Nothing changed: ${entry.detail}`, true);
  }
}

/**
 * One turn: send what she said, run Claude's tool calls until it answers, and grow `history` in place so the next
 * turn carries the whole conversation. `show` is called for each new or updated chat entry.
 */
export async function runTurn(settings: ClaudeSettings, history: Anthropic.Beta.BetaMessageParam[], show: (entry: ChatEntry) => void, signal?: AbortSignal) {
  const openRouter = viaOpenRouter(settings.apiKey);
  const api = await client(settings);
  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await api.beta.messages.create({
      model: (openRouter ? OPENROUTER_MODELS : MODELS)[settings.model],
      max_tokens: 16000,
      system: CLAUDE_SYSTEM,
      tools: CLAUDE_TOOLS,
      messages: history,
      cache_control: { type: 'ephemeral' },
      output_config: { effort: 'medium' },
      // A declined request is retried on a model that can answer it. OpenRouter does not take Anthropic's betas.
      ...(openRouter ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
    }, { signal });
    for (const block of response.content) if (block.type === 'text' && block.text.trim()) show({ kind: 'claude', text: block.text.trim() });
    const uses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    // A tool call cut off at max_tokens can parse as a valid but partial change, and one in a declined turn is not
    // meant to run: neither runs, and neither stays in the history, where an unanswered call would fail the next turn.
    if (uses.length && (response.stop_reason === 'max_tokens' || response.stop_reason === 'refusal')) {
      if (response.stop_reason === 'max_tokens') throw new Error('The answer was cut off. Ask again in fewer words.');
      return;
    }
    history.push({ role: 'assistant', content: response.content });
    if (!uses.length) return;
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const use of uses) results.push(await runTool(use, show));
    history.push({ role: 'user', content: results });
  }
  show({ kind: 'claude', text: 'That took too many steps. Try asking for one thing at a time.' });
}
