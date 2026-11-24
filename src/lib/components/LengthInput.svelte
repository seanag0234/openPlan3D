<script lang="ts">
  import { joinFeetInches, metricText, splitFeetInches } from '$lib/utils/lengthText';

  let { label, valueCm, units, minCm = 0, maxCm = Infinity, zeroAllowed = false, title, oncommit, split = true }: {
    label: string; valueCm: number; units: 'metric' | 'imperial'; minCm?: number; maxCm?: number;
    zeroAllowed?: boolean; title?: string; oncommit: (cm: number) => void;
    /** In feet and inches, two boxes; false keeps a single box in inches. */
    split?: boolean } = $props();

  const inputClass = 'w-full px-2 py-1 border border-gray-200 rounded text-sm';
  let group = $state<HTMLElement>();
  let cmBox = $state<HTMLInputElement>(), ftBox = $state<HTMLInputElement>(), inBox = $state<HTMLInputElement>();
  let editing = $state(false);
  let twoBoxes = $derived(units === 'imperial' && split);

  // While the cursor is inside, only the keyboard writes to the boxes; once it leaves they show the saved length.
  $effect(() => {
    const cm = metricText(valueCm), { feet, inches } = splitFeetInches(valueCm);
    const totalInches = String(Math.round(valueCm / 2.54 * 10) / 10);
    if (editing) return;
    if (cmBox) cmBox.value = units === 'imperial' ? totalInches : cm;
    if (ftBox) ftBox.value = String(feet);
    if (inBox) inBox.value = String(inches);
  });

  const typed = (box: HTMLInputElement | undefined) => (box ? box.value.trim() : '');
  const unreadable = (box: HTMLInputElement | undefined) => !!box?.validity.badInput;

  function draftLength(): number {
    if (twoBoxes) {
      if (unreadable(ftBox) || unreadable(inBox)) return NaN;
      return joinFeetInches(Number(typed(ftBox) || 0), Number(typed(inBox) || 0));
    }
    if (unreadable(cmBox) || !typed(cmBox)) return NaN;
    return Number(typed(cmBox)) * (units === 'imperial' ? 2.54 : 1);
  }

  function oninput() {
    editing = true;
    const cm = draftLength();
    const valid = Number.isFinite(cm) && cm >= minCm && cm <= maxCm && (cm > 0 || (zeroAllowed && cm === 0));
    if (valid && Math.abs(cm - valueCm) > 0.0005) oncommit(cm);
  }
  function onfocusout(event: FocusEvent) {
    if (group?.contains(event.relatedTarget as Node | null)) return;
    editing = false;
  }
  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') (event.currentTarget as HTMLInputElement).blur();
  }
</script>

{#if twoBoxes}
  <div bind:this={group} role="group" aria-label={label} class="block" {title} onfocusin={() => { editing = true; }} {onfocusout}>
    <span class="text-xs text-gray-500">{label}</span>
    <div class="flex gap-2">
      <label class="flex-1 flex items-center gap-1">
        <input bind:this={ftBox} type="number" inputmode="numeric" step="1" aria-label="{label} (ft)" {oninput} {onkeydown} class={inputClass} />
        <span class="text-xs text-gray-500" aria-hidden="true">ft</span>
      </label>
      <label class="flex-1 flex items-center gap-1">
        <input bind:this={inBox} type="number" inputmode="decimal" step="any" aria-label="{label} (in)" {oninput} {onkeydown} class={inputClass} />
        <span class="text-xs text-gray-500" aria-hidden="true">in</span>
      </label>
    </div>
  </div>
{:else}
  <label bind:this={group} class="block" onfocusin={() => { editing = true; }} {onfocusout}>
    <span class="text-xs text-gray-500">{label} ({units === 'imperial' ? 'in' : 'cm'})</span>
    <input bind:this={cmBox} type="number" inputmode="decimal" step="any" {title} {oninput} {onkeydown} class={inputClass} />
  </label>
{/if}
