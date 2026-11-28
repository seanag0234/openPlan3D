# A starting plan and a feedback folder

Two settings let whoever runs a copy of the editor with the Node server (`node build/index.js`) hand people
a plan and hear back from them. Both are **off unless set**. With neither set, the editor behaves exactly as
it does without them: no account, no key, and nothing leaves the machine the server runs on. Both are read
from the server's environment when a request arrives, so changing one needs a restart of the server only.

| Setting | What it is | Unset, or not an absolute path |
| --- | --- | --- |
| `START_PLAN_FILE` | An absolute path to one plan file (`.json`, as Download JSON saves it). | No starting plan. |
| `FEEDBACK_DIR` | An absolute path to a folder that feedback is written into. | No feedback is taken. |

```sh
START_PLAN_FILE=/srv/plans/our-flat.json FEEDBACK_DIR=/srv/feedback node build/index.js
```

## The starting plan

A browser whose list of plans is empty, opening the list (`/`) for the first time, fetches
`/api/start-plan` and opens that plan in the editor by itself, once. After that it is an ordinary plan in
that browser's list: changes are saved there, and nothing is sent back. If the plan is deleted later it does
not come back by itself (the browser remembers, in `localStorage` as `o3d_start_plan_opened`, that it opened
it once).

While a starting plan is set, the row of links on the list of plans also has **Get the starting plan**,
which opens it at any time. Opening the same file again opens the plan already in the list; when that plan
has changed since, the editor asks whether to replace it with the file (the plan as it was is kept in its
list of versions), keep both (the file comes in with a number after its name), or cancel.

`GET /api/start-plan` answers:

- `200` with the file's bytes and `Content-Type: application/json`;
- `204` with no body when `START_PLAN_FILE` is unset, not an absolute path, not a readable file, or larger
  than 20 MB (`204` rather than `404`, so browsers print no console error);
- with `?info=1`, `200` and `{ "available": true }` or `{ "available": false }`.

Every answer carries `Cache-Control: no-store`, and the file's path never appears in one. The file is read
as it is on each request: replacing it changes what browsers that have not yet opened it receive.

On Cloudflare Pages (`npm run build`) there is no server to read `START_PLAN_FILE`. The plan is the
file `build/start-plan.json`, copied in after the build, and `functions/api/start-plan.ts` answers the same
three ways. Changing the plan there needs a new deploy. With the online library on, each signed-in
person gets their own copy (its id is the file's id plus a hash of their email), which joins their
library the first time they list it (`functions/api/library/index.ts`), plans or not. It joins once: a
copy that was deleted later stays deleted, and **Bring back a deleted plan** returns it. A plan file
without dates gets the time it joined.

## Feedback

Every page of the editor can open a feedback sheet: the editor's **Feedback** button, and **Feedback** in the
row of links on the list of plans. It takes a few words, the name of what is selected in the editor, and,
unless the box is cleared, a picture of the plan (a JPEG of the largest drawing on screen). The message is
kept on the device, in its own browser database `openplan3d-feedback`, until the server has taken it, and is
sent again when the connection comes back or the sheet is next opened. When `FEEDBACK_DIR` is not set the
sheet says so, and offers to share the words (where the device can) or save them as a text file instead.

`GET /api/feedback` answers `{ "enabled": true }` when `FEEDBACK_DIR` is set to an absolute path.
`POST /api/feedback` takes one message as JSON and answers:

| Status | When |
| --- | --- |
| `201` `{ "ok": true }` | The message was written. |
| `200` `{ "ok": true }` | The same message was already written: nothing is written again. |
| `400` | The message is not valid (see the limits). The device drops it: it could never be taken. |
| `403` | The request's `Origin` is not this server's own host. |
| `409` | Another message took the same file name in the same second. The device sends it again later. |
| `429` | The folder is full, or has taken its share this hour. The device sends it again later. |
| `503` | `FEEDBACK_DIR` is not set. |
| `500` | Anything else, with a fixed message. |

A message's words and picture are never logged.

### What a feedback file looks like

Each message is one Markdown file, and one JPEG beside it when it has a picture. The names are made by the
server from the time it was received (the server's local time) and the first eight hex digits of the
message's id; nothing else from the message reaches a file name:

```
2026-11-24-140305-1a2b3c4d.md
2026-11-24-140305-1a2b3c4d.jpg
```

```markdown
---
title: "Feedback 2026-11-24 14:03"
date: 2026-11-24
id: "1a2b3c4d-…"
status: new
about: "Box A"
plan: "Room with boxes"
picture: "2026-11-24-140305-1a2b3c4d.jpg"
tags:
  - feedback
---

> The box will not turn.
> I tried twice.

## Where this was written

- page: /editor
- view: 2d
- tool: select
- zoom: 1.5
- viewport: 1194x834
- orientation: landscape
- coarse: true
- userAgent: …
- build: …
```

Every string in the front matter is quoted as JSON, `about` and `plan` are `null` when there is none, and so
is `picture`. The front matter suits note tools that read YAML: `status: new` can be changed by hand to keep
track of what has been read. Files are created and never overwritten.

### Limits

| Limit | Value |
| --- | --- |
| Words | 1 to 5,000 characters after trimming. |
| `about`, `plan` | Cut to 200 characters; line breaks and control characters become spaces. |
| Context | At most 20 entries; names of 1 to 20 letters; values true/false, numbers, or text cut to 300 characters. |
| Picture | A JPEG of at most 300 KB. |
| Files in the folder | At most 500 `.md` files; then `429` until some are moved out. |
| Messages per hour | At most 30 `.md` files changed in the last hour; then `429`. |

A picture is at most 300 KB, about 400 KB once encoded in the request, so a message stays under
adapter-node's default `BODY_SIZE_LIMIT` of 512 KB and the default needs no change. The sheet makes the
picture smaller until it fits, and leaves it out when it cannot.
