import { expect, it } from 'vitest';
import { isNotAPlanMessage } from '$lib/utils/notAPlan';

/** How each browser words a file that is not JSON, as JSON.parse throws it. */
const broken = [
  // Chromium
  'Unterminated string in JSON at position 4000 (line 1 column 4001)',
  "Expected ',' or '}' after property value in JSON at position 12",
  'Unexpected end of JSON input',
  'Unexpected token \'<\', "<html>" is not valid JSON',
  'Unexpected non-whitespace character after JSON at position 3',
  // Safari
  'JSON Parse error: Unterminated string',
  'JSON Parse error: Unexpected EOF',
  "JSON Parse error: Unrecognized token '<'",
  // Firefox
  'JSON.parse: unterminated string at line 1 column 4001 of the JSON data',
  'JSON.parse: unexpected end of data at line 1 column 1 of the JSON data',
  // The editor's own check of what a plan holds
  'Invalid project: id must be nonempty text.',
];

/** The editor's own sentences, some of which only mention JSON. */
const ours = [
  'Your current plan could not be saved. Retry saving or download a JSON backup before opening another plan.',
  'Could not open the imported project.',
  'This project changed in another tab.',
];

it.each(broken)('a file that is not a plan: %s', message => {
  expect(isNotAPlanMessage(message)).toBe(true);
});

it.each(ours)('one of the editor\'s own sentences: %s', message => {
  expect(isNotAPlanMessage(message)).toBe(false);
});
