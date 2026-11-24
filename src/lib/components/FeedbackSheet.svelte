<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { version } from '$app/environment';
  import { t } from '$lib/i18n';
  import { feedbackOpen } from '$lib/stores/ui';
  import { coarsePointer } from '$lib/stores/pointer';
  import { canvasZoom, currentProject, selectedElementId, selectedElementIds, selectedTool, viewMode } from '$lib/stores/project';
  import { modalDialog } from '$lib/utils/modalDialog';
  import { feedbackEnabled, flushFeedback, lastKnownFeedbackEnabled, pendingFeedback, queueFeedback, removeFeedback, type FeedbackMessage } from '$lib/services/feedbackOutbox';

  const id = $props.id();
  let words = $state('');
  let includePicture = $state(true);
  let hasCanvas = $state(false);
  let about = $state<string | null>(null);
  let busy = $state(false);
  let ending = $state<'sent' | 'waiting' | 'nowhere' | null>(null);
  /** The message the copy could not take: Share or Save as a file hands it on. */
  let unsent = $state.raw<FeedbackMessage | null>(null);
  let waiting = $state(0);
  let innerWidth = $state(0), innerHeight = $state(0);
  const portrait = $derived(innerHeight > innerWidth);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  /** The name of the one thing selected in the editor, if it has one. */
  function selectedName(): string | null {
    const selected = get(selectedElementId), many = get(selectedElementIds);
    const project = get(currentProject);
    if (!selected || !project || many.size > 1) return null;
    for (const floor of project.floors) {
      for (const items of Object.values(floor)) {
        if (!Array.isArray(items)) continue;
        const item = items.find((entry: unknown) => (entry as { id?: unknown })?.id === selected) as Record<string, unknown> | undefined;
        if (!item) continue;
        const name = [item.name, item.label, item.text].find(value => typeof value === 'string' && value.trim());
        return typeof name === 'string' ? name.trim() : null;
      }
    }
    return null;
  }

  /** The largest canvas on screen. */
  function planCanvas(): HTMLCanvasElement | null {
    let best: HTMLCanvasElement | null = null, area = 0;
    for (const canvas of document.querySelectorAll('canvas')) {
      const box = canvas.getBoundingClientRect();
      const size = box.width * box.height;
      if (size > area && canvas.width > 0 && canvas.height > 0 && getComputedStyle(canvas).visibility !== 'hidden') { best = canvas; area = size; }
    }
    return best;
  }

  /** A JPEG of the plan small enough to send, or null. */
  function picture(): string | null {
    const source = planCanvas();
    if (!source) return null;
    for (const [width, quality] of [[1280, 0.6], [960, 0.5], [720, 0.4]] as const) {
      try {
        const scale = Math.min(1, width / source.width);
        const copy = document.createElement('canvas');
        copy.width = Math.max(1, Math.round(source.width * scale));
        copy.height = Math.max(1, Math.round(source.height * scale));
        const context = copy.getContext('2d');
        if (!context) return null;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, copy.width, copy.height);
        context.drawImage(source, 0, 0, copy.width, copy.height);
        const data = copy.toDataURL('image/jpeg', quality);
        if (data.startsWith('data:image/jpeg;base64,') && data.length < 400_000) return data;
      } catch { return null; }
    }
    return null;
  }

  function context(): FeedbackMessage['context'] {
    const editor = !!get(currentProject) && location.pathname.includes('/editor');
    return {
      page: location.pathname,
      ...(editor ? { view: get(viewMode), tool: get(selectedTool), zoom: Math.round(get(canvasZoom) * 1000) / 1000 } : {}),
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      orientation: window.innerHeight > window.innerWidth ? 'portrait' : 'landscape',
      coarse: get(coarsePointer),
      userAgent: navigator.userAgent.slice(0, 300),
      build: version,
    };
  }

  async function countWaiting() {
    try { waiting = (await pendingFeedback()).length; } catch { waiting = 0; }
  }

  async function flush() {
    try { await flushFeedback(); } catch { /* The outbox keeps what it has. */ }
    await countWaiting();
  }

  function prepare() {
    about = selectedName();
    hasCanvas = !!planCanvas();
    includePicture = true;
    ending = null;
    unsent = null;
    void flush();
  }

  function close() {
    if (busy) return;
    feedbackOpen.set(false);
  }

  async function send() {
    const text = words.trim();
    if (!text || busy) return;
    busy = true;
    try {
      const project = get(currentProject);
      const message: FeedbackMessage = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        text,
        about,
        planName: project && location.pathname.includes('/editor') ? project.name || null : null,
        context: context(),
        picture: hasCanvas && includePicture ? picture() : null,
      };
      await queueFeedback(message);
      await flushFeedback();
      const still = (await pendingFeedback()).some(item => item.id === message.id);
      if (!still) ending = 'sent';
      else {
        // With no connection the copy cannot be asked: its last answer stands, and an unknown is no "no".
        const enabled = (await feedbackEnabled()) ?? lastKnownFeedbackEnabled();
        if (enabled === false) { ending = 'nowhere'; unsent = message; }
        else ending = 'waiting';
      }
      words = '';
    } catch {
      ending = 'waiting';
    } finally {
      busy = false;
      await countWaiting();
    }
  }

  /** Handed on another way: it no longer waits to be sent. */
  async function handedOn() {
    if (unsent) await removeFeedback(unsent.id).catch(() => {});
    unsent = null;
    await countWaiting();
  }

  function asText(message: FeedbackMessage) {
    return [
      message.text, '',
      ...(message.about ? [`About: ${message.about}`] : []),
      ...(message.planName ? [`Plan: ${message.planName}`] : []),
      `Written: ${message.createdAt}`,
      ...Object.entries(message.context).map(([key, value]) => `${key}: ${value}`),
      '',
    ].join('\n');
  }

  async function share() {
    const message = unsent;
    if (!message) return;
    const data: ShareData = { title: get(t)('home.feedback'), text: asText(message) };
    if (message.picture && typeof navigator.canShare === 'function') {
      try {
        const blob = await (await fetch(message.picture)).blob();
        const file = new File([blob], `feedback-${message.createdAt.slice(0, 10)}.jpg`, { type: 'image/jpeg' });
        if (navigator.canShare({ files: [file] })) data.files = [file];
      } catch { /* Share the words alone. */ }
    }
    try { await navigator.share(data); await handedOn(); }
    catch { /* Cancelled: it stays, to share or save again. */ }
  }

  async function save() {
    const message = unsent;
    if (!message) return;
    const url = URL.createObjectURL(new Blob([asText(message)], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `feedback-${message.createdAt.slice(0, 10)}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    await handedOn();
  }

  let wasOpen = false;
  $effect(() => {
    const open = $feedbackOpen;
    if (open && !wasOpen) prepare();
    wasOpen = open;
  });

  onMount(() => {
    const openSheet = () => feedbackOpen.set(true);
    const online = () => void flush();
    window.addEventListener('o3d-feedback', openSheet);
    window.addEventListener('online', online);
    void flush();
    return () => {
      window.removeEventListener('o3d-feedback', openSheet);
      window.removeEventListener('online', online);
    };
  });
</script>

<svelte:window bind:innerWidth bind:innerHeight />

{#if $feedbackOpen}
  <dialog use:modalDialog aria-labelledby="{id}-title"
    oncancel={(event) => { event.preventDefault(); close(); }}
    onclose={(event) => { if ((event.currentTarget as HTMLDialogElement).isConnected) feedbackOpen.set(false); }}
    onclick={(event) => { if (event.target === event.currentTarget) close(); }}
    class="modal-overlay fixed inset-0 z-[70] flex bg-black/40 {portrait ? 'items-end justify-stretch' : 'items-center justify-center'}">
    <div class="bg-white text-gray-800 shadow-2xl p-5 overflow-y-auto max-h-[90vh]
      {portrait ? 'w-full rounded-t-2xl pb-[max(1.25rem,env(safe-area-inset-bottom))]' : 'm-4 w-[32rem] max-w-[calc(100vw-2rem)] rounded-2xl'}">
      <h2 id="{id}-title" class="text-lg font-semibold">{$t('home.feedbackTitle')}</h2>
      {#if about}<p class="mt-1 text-sm text-gray-600 break-words">{$t('home.feedbackAbout', { name: about })}</p>{/if}

      <label for="{id}-words" class="mt-4 block text-sm font-medium">{$t('home.feedbackWords')}</label>
      <textarea id="{id}-words" rows="5" bind:value={words} disabled={busy}
        class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[16px] leading-normal outline-blue-500"></textarea>

      {#if hasCanvas}
        <label class="mt-3 flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" bind:checked={includePicture} disabled={busy} class="h-5 w-5" />
          {$t('home.feedbackPicture')}
        </label>
      {/if}

      {#if ending}
        <p role="status" class="mt-3 rounded-lg p-3 text-sm {ending === 'sent' ? 'bg-green-50 text-green-900' : 'bg-amber-50 text-amber-900'}">
          {$t(ending === 'sent' ? 'home.feedbackSent' : ending === 'waiting' ? 'home.feedbackWaiting' : 'home.feedbackNowhere')}
        </p>
        {#if ending === 'nowhere' && unsent}
          <div class="mt-3 flex flex-wrap gap-3">
            {#if canShare}<button type="button" onclick={share} class="min-h-11 rounded-lg border border-gray-300 px-4 text-sm font-semibold">{$t('home.feedbackShare')}</button>{/if}
            <button type="button" onclick={save} class="min-h-11 rounded-lg border border-gray-300 px-4 text-sm font-semibold">{$t('home.feedbackSave')}</button>
          </div>
        {/if}
      {/if}
      {#if waiting > 0}<p class="mt-3 text-xs text-gray-500">{$t('home.feedbackCount', { count: waiting })}</p>{/if}

      <div class="mt-5 flex justify-end gap-3">
        <button type="button" onclick={close} disabled={busy}
          class="min-h-11 rounded-lg border border-gray-300 px-4 text-sm font-semibold disabled:opacity-40">{$t('home.feedbackCancel')}</button>
        <button type="button" onclick={send} disabled={busy || !words.trim()}
          class="min-h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white disabled:opacity-40">{$t('home.feedbackSend')}</button>
      </div>
    </div>
  </dialog>
{/if}
