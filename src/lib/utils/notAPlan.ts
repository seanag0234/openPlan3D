/**
 * Pieces of the messages a file that is not a plan gives: the editor's own check of what a plan holds,
 * and how each browser's JSON.parse words a file that is not JSON (Chromium, Safari, Firefox).
 * Matched with their capitals as written, so the editor's own sentences that only mention JSON stay apart.
 */
const SIGNS = [
  'Invalid project:',
  'JSON Parse error',          // Safari
  'JSON.parse',                // Firefox
  ' in JSON at position',      // Chromium
  ' of JSON input',            // Chromium
  'is not valid JSON',         // Chromium
  'after JSON at position',    // Chromium
  'of the JSON data',          // Firefox
];

/** Whether a message says the file given is not a plan at all, in any browser's wording. */
export function isNotAPlanMessage(message: string): boolean {
  return SIGNS.some(sign => message.includes(sign));
}
