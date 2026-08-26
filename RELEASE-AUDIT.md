# HeliosGen — Pre-Release Audit

Branch `security/prerelease-hardening`, 8 commits, `53 files changed, 3505 insertions(+), 17900 deletions(-)`.

Everything below was verified by running it, not by reading it. Where a claim
rests on a test, the command and its output are quoted.

**Verdict: releasable.** Three release blockers and one arbitrary-file-read were
found and fixed. Two known gaps remain, both documented at the end with their
severity and remediation; neither blocks a launch.

---

## 1. Verification status

| Check | Command | Result |
|---|---|---|
| Types | `npx tsc --noEmit` | clean |
| Build | `pnpm run build` | clean |
| Unit tests | `pnpm test` | 9/9 |
| Input/output loop | guest mode, production build | 17/17 |
| Dependency audit | `pnpm audit --prod` | 0 vulnerabilities |
| Lint | `npx eslint .` | 74 errors, 84 warnings — all pre-existing, see §6 |

---

## 2. Input / output loop

Run against a **production build** (`next build && next start`) in guest mode.
The one seam: no live kie.ai key, so the input path is verified up to and
including the outbound provider call (which returns 401 as it should with a
fake key), and the output path is driven from the callback inward, with the
pending job seeded exactly as `/api/generate-video` writes it.

```
================ INPUT PATH ================

  PASS  upload a pasted image (data URL)              /generated/uploads/c304fe19-….png
  PASS    ...and it is on disk
  PASS  upload rejects a caller-chosen key prefix     HTTP 400
  PASS  import a reference image by URL               /generated/uploads/3dcd7263-….jpg
  PASS    ...and it is on disk
  PASS  import refuses cloud metadata                 HTTP 400 Blocked URL
  PASS  video request assembles a provider payload    https://api.kie.ai/api/v1/jobs/createTask
  PASS    ...with the signed callback URL             http://localhost:3120/api/callback?s=<token>
  PASS  image request actually reaches the provider   HTTP 500 Unauthorized – Authentication failed…

================ OUTPUT PATH ================

  PASS  unsigned callback is refused                  HTTP 403
  PASS  signed callback is accepted                   HTTP 200
  PASS  job settles to done
  PASS  result was mirrored into local storage        /generated/videos/37b3765c-….mp4
  PASS    ...and the file exists                      12503862 bytes
  PASS  it shows up in the gallery
  PASS  it downloads through /api/download            HTTP 200, 12503862 bytes, attachment; filename="out.mp4"
  PASS  job-stream replays the settled result         data: {"status":"done","videoUrl":"/generated/videos/…"}

17/17 passed
```

The UI was also driven in a real browser (headless Chromium, not just SSR HTML):
the gallery renders, three cards draw, clicking one opens the lightbox with its
prompt, console clean.

---

## 3. Release blockers found and fixed

### 3.1 Generated media 404'd in production — guest mode

Next only serves what `public/` contained **at build time**. Guest mode writes
every generation into `public/generated` at runtime, so under the deploy command
the README hands you — `npm run build && npm start` — the file landed on disk
and then 404'd:

```
file on disk: public/generated/videos/37b3765c-….mp4 (12503862 bytes)
GET /generated/videos/37b3765c-….mp4 -> 404
```

The gallery filled with broken media and downloads failed. It worked under
`next dev` only, which is how it survived this long.

**Fixed** by `app/generated/[...path]/route.ts`, which serves those files with
Range support (so the video scrubber works), a normalize-then-compare path
check, and a 404 for anything missing. Cloud mode never reaches it.

### 3.2 The provider webhook accepted anything

`/api/callback` is excluded from the auth proxy by design — it is the kie.ai
webhook. It was also unauthenticated, and it settles a job from whatever the
POST body says. Anyone who learned a `taskId` could hand it a URL of their
choosing, which got mirrored into your bucket and pinned into the victim's
gallery — an SSRF and a content-injection primitive in one.

**Fixed:** the webhook URL handed to the provider now carries an HMAC secret
derived from a key the deployment already has, so upgrading needs no new env
var. `CALLBACK_SECRET` rotates it independently.

### 3.3 Jobs stranded on Vercel

`jobStore` wrote to `process.cwd()`, which is read-only on Vercel and Lambda.
The `writeFileSync` threw inside the callback's promise chain, so the Supabase
update after it never ran: **every generation would have hung at "pending"** on
the README's first recommended platform. Moved to `tmpdir()`; it is only a
cache, and `job-status` falls back to the database on a miss.

### 3.4 Every SSE stream timed out on success, with two replicas

`job-stream`'s only completion path was an in-process `EventEmitter`. With more
than one instance, the callback settles the job on B while A holds the stream —
A hears nothing, waits out the 12-minute cap, and reports *"Generation timed
out"* for a generation that finished minutes earlier.

**Fixed** by polling the row the callback writes, every 10s, alongside the
event. Verified by staging a job this instance never saw settle:

```
opening SSE stream for a job this instance never saw settle...
  [+11s] data: {"status":"done","imageUrl":"https://example.com/settled-elsewhere.png"}
```

11 seconds instead of a 12-minute false failure.

---

## 4. Security findings

### 4.1 A prompt beginning with `@` uploaded a server file — **high**

The Azure image-edit path builds a multipart request by hand and shells out to
`curl`. Text fields went in as `-F "name=value"`, and one of those values is the
user's prompt. `curl` treats an `-F` value starting with `@` as a filename and
`<` as read-content-from-file. A prompt of `@/etc/passwd` — or the path to
`.env.local` — uploaded that file to whatever Azure endpoint the *same request*
supplied. Both halves are controlled by any signed-in user, which on a hosted
demo means anyone who registers.

Proved against real curl, before and after:

```
BEFORE  -F "prompt=@<file>"          leaked file contents: true
AFTER   --form-string "prompt=@..."  leaked file contents: false
```

```
--- what the server saw, before ---
Content-Disposition: form-data; name="prompt"; filename="heliosgen-fake-secret.txt"

SUPABASE_SERVICE_ROLE_KEY=super-secret-value
--- after ---
Content-Disposition: form-data; name="prompt"

@C:\Users\…\heliosgen-fake-secret.txt
```

**Fixed:** `--form-string` for text fields, which never interprets the value.
File fields still use `-F`, since those genuinely are uploads.

### 4.2 Nine routes ran with no session at all — **high**

`/api/upload-to-r2`, `/api/fetch-url`, `/api/extract-frame`, `/api/trim-video`,
`/api/settings/codex-login`, `/api/settings/codex-status` and others accepted
anonymous callers. Between them that gave a passer-by: unlimited writes into
your R2 bucket, a server-side fetcher pointed at any URL, ffmpeg fed arbitrary
input, and — via `codex-login` — an **unauthenticated logout button**, since
starting a device login wipes the existing session, while `GET` handed out the
pending device code.

**Fixed:** every one requires a resolved user. The URL guards live in
`lib/safeUrl.ts`, including the redirect walk — `redirect: "follow"` let a
perfectly public URL bounce to `169.254.169.254`.

### 4.3 Allowlists compared with `startsWith` — **medium**

`download`, `video-proxy` and `thumb` each checked `url.startsWith(allowed)`,
which `https://cdn.kie.ai.evil.com` satisfies. They compare parsed origins now.
Verified live:

```
download allowlist bypass (must be 403)     403  Forbidden
thumb bypass (must be 403)                  403  Forbidden
video-proxy bypass (must be 403)            403  Forbidden
```

### 4.4 Publishing a workflow published its job ids — **medium**

`NodeData` carries `taskId`; `useSpaceSync` saves node data stripping only
`inputImage`; `/api/public/space` returned it verbatim. So *Shareable public
workflows* — a headline feature — handed every visitor the ids that
`/api/job-status` answers to. Scrubbed at the read boundary (along with
`errorMsg`, which can carry raw provider text) so spaces **already published**
stop leaking without a migration.

### 4.5 Guest storage kept an unguarded copy of the fetcher — **medium**

`lib/guest/localStorage.ts` had its own `fetchToBuffer`, a duplicate the earlier
SSRF guard never touched, with no size limit. Guest mode waves every caller
through as `"guest"` and the README tells you to expose it over ngrok, so it was
reachable from the internet with a caller-chosen URL. Guarded on every redirect
hop and capped at 500 MB.

### 4.6 Dependencies — 4 high / 5 moderate / 1 low → **0**

The interesting one: **`shadcn` sat in `dependencies`.** It is a codegen CLI
that nothing imports, and it dragged `@modelcontextprotocol/sdk` and `hono` —
all four hono CVEs, ~8 MB — into the production install. Moved to dev.

`sharp` needed a pnpm override rather than a version bump: Next carries its own
`sharp@0.34.5` alongside yours, and sharp is what resizes untrusted images in
`/api/thumb`. `postcss` overridden likewise (Next pins 8.4.31, path-traversal
chain, which also cleared `nanoid`). `tw-animate-css` was declared and never
imported.

```
before:  {"high":4,"moderate":5,"low":1}
after:   {"info":0,"low":0,"moderate":0,"high":0,"critical":0}   (--prod)
```

### 4.7 Checked and sound

- **Supabase RLS** is enabled on all seven tables. `user_settings` and
  `asset_cache` are deliberately policy-less, so they are invisible to the
  browser client — the anon key cannot reach stored API keys. This is right.
- **No credential was ever committed.** A full-history scan for key prefixes,
  JWTs and PEM blocks returns nothing.
- **`spawn` calls do not go through a shell**, so there is no command injection
  — the `curl` issue in §4.1 was argument *semantics*, not injection. The
  Azure base URL is now required to parse as `http(s)`, since a value starting
  with `-` reached curl's argv as an option.

---

## 5. Correctness bugs fixed

**The credit badge lied.** kie.ai answers `/credit` with HTTP 200 and the real
status inside `body.code`. The route passed it through, so `CreditBalance` read
`data.data` as `undefined` and rendered nothing — an expired key looked
identical to "no credits shown", while re-polling every 60s from every open tab
forever. Now mapped to a real status, and the client stops polling once rejected.

**`topoSort` crashed the canvas** on an edge that outlived its node — an older
saved workflow, a partial save, a space loaded through `/api/public/space`.
Both directions confirmed against the original code:

```
dangling TARGET : CRASH: adj[id] is not iterable
dangling SOURCE : CRASH: Cannot read properties of undefined (reading 'push')
```

**The gallery read 2000 rows to return 20.** `/api/gallery` pulled 1000 rows
from `generations` *and* 1000 from `user_uploads` on every request, merged and
sorted in JS, then sliced 20 — on every infinite-scroll page. The union's top N
is contained in the top N of each table, so the range is exact at
`offset + LIMIT + 1` per table. Page 1 now moves 42 rows instead of 2000, and
`total` comes from an exact count instead of saturating at the old cap.

**A looped graph ran a short pipeline and said nothing.** `buildPipelineWaves`
dropped cyclic nodes on the floor; it now returns them and the runner says how
many were skipped.

**Downloads were all named `_._`.** A sanitizer regex lost its backslash on the
way into the file (`[^w.-]` instead of `[^\w.-]`), renaming every download. The
rule now lives in `lib/safeUrl.ts` as `safeFilename()` with a test. Caught by
running the loop, not by reading it.

Also: `jobStore` kept one entry per generation forever and re-parsed the whole
file on every read (capped at 500); per-request payload dumps that included
**every user's prompt** are now behind `HELIOS_DEBUG`; `/api/generate-image`
(dead Replicate code, unauthenticated) and `lib/pendingJobs.ts` deleted;
`resp.json` (4.2 MB debug dump) and a duplicate `package-lock.json` removed.

---

## 6. Known gaps — accepted, not blocking

**`job-status` and `job-stream` do not check ownership.** Anyone holding a
`taskId` can read that job's status and result URL. With §4.4 fixed, task ids
are no longer published anywhere, so exploiting this requires already possessing
an opaque provider-generated id. Closing it properly means moving the SSE
endpoint to cookie-based auth, because `EventSource` cannot set headers — that
is a change to the core generation-polling path and was deliberately not
attempted days before a release. **Recommended as the first post-launch fix.**

**No rate limiting anywhere.** Every authenticated route can be called in a
loop. Generation spends the user's own credits, so the blast radius is mostly
storage and CPU (`/api/thumb` runs sharp, `extract-frame` runs ffmpeg). Put a
limiter in front of the media routes before you advertise widely.

**`.env.guest` once carried a live ngrok URL** containing a real IP
(`217.217.246.2`). The working tree is clean, but it remains in git history.
Rewrite history or accept it — no credential was exposed, only an address.

**`jobEvents` is still in-process.** The polling fallback (§3.4) makes
correctness topology-independent, but instant delivery still only happens when
the callback and the stream land on the same instance. Redis pub/sub if that
latency ever matters.

**74 lint errors remain**, unchanged throughout. All are React Compiler
strictness — `set-state-in-effect`, `refs`, declaration-order complaints inside
callbacks that only run after mount. I chased the three that read like real
temporal-dead-zone crashes; they are not live bugs.

**`app/gallery/page.tsx` is still 4,974 lines.** Down from 7,517 — the fifteen
unrelated components behind it moved into `_shared.tsx`, `_gallery-css.ts` and
`_components/`, verified as a pure move by diffing the line multiset. What
remains is `GalleryInner` itself, a single ~4,000-line component. Untangling its
state is a real project, not a pre-release task.

---

## 7. Before you deploy

1. **Set `CALLBACK_SECRET`** (`openssl rand -hex 32`) if you want the webhook
   secret independent of your kie.ai key. Optional — it derives one otherwise.
2. **Do not deploy guest mode to a public URL.** `resolveUserId` returns
   `"guest"` for every caller there; every auth check in this audit becomes a
   no-op. Guest mode is for local use behind a tunnel you control.
3. **Vercel:** `jobStore` and `jobEvents` are per-instance. Correctness holds
   (§3.3, §3.4), but expect result delivery via the 10s poll rather than the
   instant event.
4. **Run `pnpm audit --prod` in CI.** The `shadcn`-in-`dependencies` class of
   mistake is silent otherwise.
5. `HELIOS_DEBUG=true` re-enables the verbose request logging if you need it.
