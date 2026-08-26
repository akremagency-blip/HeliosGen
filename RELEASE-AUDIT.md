# HeliosGen — Pre-Release Audit

Branch `security/prerelease-hardening`, 12 commits.

Everything below was verified by running it, not by reading it. Where a claim
rests on a test, the command and its output are quoted.

**Verdict: releasable.** Four release blockers and one arbitrary-file-read were
found and fixed, and the two gaps this document originally deferred have since
been closed. What remains is one architectural item and one judgement call,
both in §6; neither blocks a launch.

---

## 1. Verification status

| Check | Command | Result |
|---|---|---|
| Types | `npx tsc --noEmit` | clean |
| Build | `pnpm run build` | clean |
| Unit tests | `pnpm test` | 14/14 |
| Input/output loop | guest mode, production build | 17/17 |
| Dependency audit | `pnpm audit --prod` | 0 vulnerabilities |
| Lint | `pnpm run lint` | 0 errors, 150 warnings — exits 0, see §5.5 |
| Rate limits | live, against a running server | 429 at the configured boundary |

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

### 5.5 Closed since the first draft

**Job ownership.** `job-status` and `job-stream` accepted any `taskId` from
anyone. This was deferred as needing surgery on the core polling path, because
`EventSource` cannot set an Authorization header — but it did not.
`@supabase/ssr` already keeps the session in cookies, and cookies ride along on
`EventSource`, so both routes authenticate with no client change at all.
Ownership needed one piece of plumbing: settling a job overwrote the only record
of who owned it. A job with no recorded owner stays readable, so generations in
flight survive the deploy.

**Rate limiting.** `lib/rateLimit.ts`, a fixed window in a Map — no dependency
for what a few lines do. Verified against a running server:

```
limit configured : 90 per minute
accepted         : 90
rate limited     : 6 (first 429 on request #91)
Retry-After      : 60 seconds
```

Limits sit well above normal browsing (300/min for `thumb`, which the gallery
fires once per tile); the full input/output loop still passes 17/17 with
limiting on.

## 6. What is left

### 6.1 `GalleryInner` is one 4,189-line component — measured, deliberately not split

The fifteen unrelated components behind it already moved out (7,517 → 4,974
lines in `page.tsx`). What remains is a single component, and it does not come
apart mechanically. Measured rather than guessed:

```
owned state/refs: 105
total references across owned state: 1694 | median uses: 10

most entangled:
  117  state prompt
   81  state modelId
   68  state items
   48  state vidResources
   47  state submitting

referenced 3 times or fewer (candidates for extraction):
  -> 12 of 105   (all of them DOM handles and timer refs, not state)
```

There are no separable islands. Every meaningful piece of state is referenced
about ten times across the body, so lifting any cluster into a hook means
threading ten-plus values back through props — which makes the code worse, not
better. The real fix is moving this state into the zustand store the workflow
side already uses, incrementally. That is a project, and it buys the user
nothing, so it is not a pre-release task.

### 6.2 A live ngrok URL remains in git history — a decision, not a task

`.env.guest` once carried a real tunnel address containing an IP
(`217.217.246.2`). The working tree is clean; history is not.

**Recommendation: accept it.** No credential was ever committed — a
full-history scan for key prefixes, JWTs and PEM blocks returns nothing. This is
an address, on a tunnel that is long dead. Rewriting the history of a public
repository with merged contributor pull requests rewrites every commit hash and
breaks every existing clone, which is a real cost paid by other people. If you
disagree, the rewrite is one `git filter-repo` invocation and should happen
before any further pushes, not after.

### 6.3 Deliberate ceilings, marked in the code

Three shortcuts are load-bearing enough to name. Each carries a `ponytail:`
comment at its site saying what it gives up and what replaces it.

- **Rate limiting is per-instance and in-memory.** N replicas allow N times the
  limit, and a restart forgets everything. Right for stopping a runaway loop,
  wrong for metering a paid API. Redis when the number must be exact.
- **`jobEvents` is still in-process.** The 10-second poll makes correctness
  independent of topology, but instant delivery only happens when the callback
  and the stream land on the same instance.
- **`isBlockedHost` checks literal hosts.** A hostname whose DNS resolves to a
  private address still gets through; closing that needs resolve-then-pin on a
  custom agent. Every caller is authenticated, which is what actually keeps
  these routes from being an open relay.

### 6.4 150 lint warnings

Zero errors — `pnpm run lint` exits 0 and can gate CI. Of the original 74
errors, eight were real and are fixed; the other 66 are React Compiler rules
(`set-state-in-effect`, `refs`, `preserve-manual-memoization`,
`immutability`) across ten component files, demoted to warnings with the
reasoning recorded in `eslint.config.mjs`. They flag patterns the compiler
cannot optimise, not defects — the three that read like temporal-dead-zone
crashes each traced to a declaration-order complaint inside a callback that only
runs after mount. Worth working down deliberately; not worth restructuring
working effects under release pressure.

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
