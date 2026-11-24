import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

/** Feedback a copy of the editor takes, and how much: a picture under 300 KB keeps a request under the server's default size limit. */
export const FEEDBACK_LIMITS = { maxText: 5000, maxPictureBytes: 300_000, maxFiles: 500, perHour: 30 };

export class FeedbackRejected extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** What the sheet sends: the same shape in the outbox, on the wire and here. */
export interface FeedbackMessage {
  id: string;
  createdAt: string;
  text: string;
  about: string | null;
  planName: string | null;
  context: Record<string, string | number | boolean>;
  picture: string | null;
}

const JPEG_PREFIX = 'data:image/jpeg;base64,';
const bad = (message: string): never => { throw new FeedbackRejected(400, message); };
/** Control characters, line breaks among them, become spaces: one line, nothing hidden. */
const oneLine = (value: string, max: number) => value.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').slice(0, max);

function optionalName(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') bad(`${field} must be text or null.`);
  return oneLine(value as string, 200);
}

/** Check every part of the body; nothing unchecked goes further. */
function readMessage(body: unknown, limits: typeof FEEDBACK_LIMITS): { message: Omit<FeedbackMessage, 'picture'>; picture: Buffer | null; hex: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) bad('The message must be an object.');
  const value = body as Record<string, unknown>;
  const id = value.id;
  if (typeof id !== 'string' || !/^[0-9a-f-]{8,64}$/i.test(id)) bad('The message id is not valid.');
  const hex = (id as string).replace(/-/g, '').toLowerCase().slice(0, 8);
  if (hex.length < 8) bad('The message id is not valid.');

  if (typeof value.text !== 'string') bad('The message needs words.');
  // Keep line breaks and tabs; other control characters go.
  const text = (value.text as string).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim();
  if (text.length < 1 || text.length > limits.maxText) bad(`The words must be 1 to ${limits.maxText} characters.`);

  const about = optionalName(value.about, 'about');
  const planName = optionalName(value.planName, 'planName');

  const rawContext = value.context;
  if (!rawContext || typeof rawContext !== 'object' || Array.isArray(rawContext)) bad('The context must be an object.');
  const entries = Object.entries(rawContext as Record<string, unknown>);
  if (entries.length > 20) bad('The context has too many entries.');
  const context: Record<string, string | number | boolean> = {};
  for (const [key, item] of entries) {
    if (!/^[a-zA-Z]{1,20}$/.test(key)) bad('A context name is not valid.');
    if (typeof item === 'boolean') context[key] = item;
    else if (typeof item === 'number' && Number.isFinite(item)) context[key] = item;
    else if (typeof item === 'string') context[key] = oneLine(item, 300);
    else bad('A context value is not valid.');
  }

  let picture: Buffer | null = null;
  if (value.picture !== null && value.picture !== undefined) {
    if (typeof value.picture !== 'string' || !value.picture.startsWith(JPEG_PREFIX)) bad('The picture must be a JPEG.');
    const encoded = (value.picture as string).slice(JPEG_PREFIX.length);
    // Refuse before decoding something far too large.
    if (encoded.length > Math.ceil(limits.maxPictureBytes / 3) * 4 + 4) bad('The picture is too large.');
    picture = Buffer.from(encoded, 'base64');
    if (picture.length > limits.maxPictureBytes) bad('The picture is too large.');
    if (picture.length < 3 || picture[0] !== 0xff || picture[1] !== 0xd8 || picture[2] !== 0xff) bad('The picture must be a JPEG.');
  }

  const createdAt = typeof value.createdAt === 'string' ? oneLine(value.createdAt, 40) : '';
  return { message: { id: id as string, createdAt, text, about, planName, context }, picture, hex };
}

const two = (n: number) => String(n).padStart(2, '0');
const day = (at: Date) => `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;

/** The front matter's `id`, read back from a file this module wrote. */
function storedId(markdown: string): string | null {
  const front = /^---\n([\s\S]*?)\n---\n/.exec(markdown)?.[1];
  const line = front?.split('\n').find(item => item.startsWith('id: '));
  try { return line ? JSON.parse(line.slice(4)) : null; } catch { return null; }
}

/**
 * Write one message as `<YYYY-MM-DD>-<HHMMSS>-<8 hex digits of its id>.md` (and `.jpg` for its picture) in `dir`,
 * in the server's local time. Names are made here from the time and the id only. A message already written is
 * not written again.
 */
export async function writeFeedback(dir: string, body: unknown, now = new Date(), limits = FEEDBACK_LIMITS): Promise<{ file: string; duplicate: boolean }> {
  if (!dir || !isAbsolute(dir)) throw new FeedbackRejected(503, 'This copy of the editor has nowhere to keep feedback.');
  const { message, picture, hex } = readMessage(body, limits);

  await mkdir(dir, { recursive: true });
  const names = await readdir(dir);
  const markdown = names.filter(name => name.endsWith('.md'));
  for (const name of markdown.filter(item => item.endsWith(`-${hex}.md`))) {
    try { if (storedId(await readFile(join(dir, name), 'utf8')) === message.id) return { file: name, duplicate: true }; }
    catch { /* A file that cannot be read is not this message. */ }
  }
  if (markdown.length >= limits.maxFiles) throw new FeedbackRejected(429, 'The feedback folder is full.');
  let recent = 0;
  for (const name of markdown) {
    try { if (now.getTime() - (await stat(join(dir, name))).mtimeMs < 3600_000) recent++; }
    catch { /* Gone since it was listed. */ }
  }
  if (recent >= limits.perHour) throw new FeedbackRejected(429, 'Too much feedback this hour. It will be sent later.');

  const stem = `${day(now)}-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}-${hex}`;
  const pictureName = picture ? `${stem}.jpg` : null;
  const quote = (value: string | null) => JSON.stringify(value);
  const lines = [
    '---',
    `title: ${quote(`Feedback ${day(now)} ${two(now.getHours())}:${two(now.getMinutes())}`)}`,
    `date: ${day(now)}`,
    `id: ${quote(message.id)}`,
    'status: new',
    `about: ${quote(message.about)}`,
    `plan: ${quote(message.planName)}`,
    `picture: ${quote(pictureName)}`,
    'tags:',
    '  - feedback',
    '---',
    '',
    ...message.text.split('\n').map(line => `> ${line}`.trimEnd()),
    '',
    '## Where this was written',
    '',
    ...Object.entries(message.context).map(([key, item]) => `- ${key}: ${item}`),
    '',
  ];
  try {
    if (picture && pictureName) await writeFile(join(dir, pictureName), picture, { flag: 'wx' });
    await writeFile(join(dir, `${stem}.md`), lines.join('\n'), { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') throw new FeedbackRejected(409, 'Another message has the same name. Try again in a moment.');
    throw error;
  }
  return { file: `${stem}.md`, duplicate: false };
}
