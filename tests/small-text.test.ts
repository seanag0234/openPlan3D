import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

/** Every .svelte file under a folder. */
function svelteFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return svelteFiles(path);
    return path.endsWith('.svelte') ? [path] : [];
  });
}

it('the editor\'s screens write no word under 12 px', () => {
  const files = [...svelteFiles('src/lib/components'), ...svelteFiles('src/routes/editor'), 'src/routes/+page.svelte'];
  const found: string[] = [];
  for (const file of files) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      for (const match of line.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
        if (Number(match[1]) < 12) found.push(`${file}:${i + 1} ${match[0]}`);
      }
      for (const match of line.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
        if (Number(match[1]) < 12) found.push(`${file}:${i + 1} ${match[0]}`);
      }
    });
  }
  expect(found).toEqual([]);
});
