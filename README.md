<p align="center">
  <img 
    src="https://helios.sdd.cash/HG.svg" 
    alt="HeliosGen Banner" 
    width="64"
  />
</p>

<p align="center">
  <strong>Build AI image & video pipelines visually.</strong><br/>
  Chain prompts, models, reference images, and automations on an infinite canvas.
</p>

---

# Demo

you can create an account and use it here : https://helios.sdd.cash/

---

# 📸 Screenshots
## ✨ Simple Image & Video Generation

<p align="center">
  <img width="2912" height="2292" alt="Image generation example" src="https://github.com/user-attachments/assets/8263b83d-addb-4af8-99d1-d8406c52be2c" />
</p>

---

## 🔄 Workflow Generation

<p align="center">
  <img width="1459" height="1146" alt="Workflow generation example" src="https://github.com/user-attachments/assets/fc7f1109-76d1-4af0-b91d-0e915bcf5461" />
</p>

---

## 🧠 Native JSON Prompt Preview

<p align="center">
  <img width="886" alt="JSON prompt preview" src="https://github.com/user-attachments/assets/dedbdf4f-9d52-4e29-ad6e-a2e67e341a73" />
</p>

---

## 💬 AI Prompt Improvement Assistant

<p align="center">
  <img width="872" height="502" alt="Prompt assistant interface" src="https://github.com/user-attachments/assets/17ba972c-bd8a-49a7-b367-4ef906fe3e17" />
</p>

# ✨ HeliosGen

HeliosGen is a free & open source visual AI workflow builder for image and video generation.

Build reusable AI pipelines with:
- infinite node-based workflows,
- multi-model generation,
- reference images,
- automation chains,
- and self-hosted infrastructure.

No subscriptions.  
No disappearing credits.  
No vendor lock-in.

---

# 💳 Credits

HeliosGen now works with <a href="https://kie.ai?ref=25abb3f2236cbff9780ab9c2f84479ec" target="_blank">kie.ai</a>.

All credits are purchased directly on your own account and never expire.

That means:
- no monthly reset,
- no lost credits,
- no subscription lock-in,
- and full ownership of your usage.

You only pay for what you generate.

---

# 🚀 Features

- Infinite node-based canvas
- AI image & video generation
- Drag-and-connect workflow system
- Multi-model pipelines
- Reference image support
- Parallel & sequential pipeline execution
- Shareable public workflows
- Per-user API keys
- Real-time generation history
- Self-hostable architecture
- Modern responsive UI

---

# ⚡ Supported Models

## Images
- GPT Image 2 (OpenAI)
- Nano Banana / Nano Banana 2 / Nano Banana 2 Lite / Nano Banana Pro (Google)
- Seedream 5.0 Lite / Pro (Seedream)
- Z-Image (Z-AI)
- Grok Imagine (X)

## Videos
- Veo 3.1 Lite / Fast / Quality, Gemini Omni Video (Google)
- Kling 3.0, Kling 3.0 Turbo, Motion Control 2.6 / 3.0 (Kling)
- Seedance 2.0 / Fast / Mini (Bytedance)
- Grok Imagine, Grok Imagine 1.5 preview (X)
- HappyHorse (Alibaba)

More models are coming.

---

# 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js + React + TypeScript |
| Backend | Next.js API Routes |
| Database | Supabase / JSON |
| Storage | Cloudflare R2 / Local disk |
| AI Backend | Kie.ai |
| Deployment | Vercel / Railway / Render |

---

# 🚀 Getting Started

## 1. Clone the repository

```bash
git clone https://github.com/SegFault42/HeliosGen
cd HeliosGen
npm install
```

---

## 2. Guest Mode (quick setup)

Requirements:
- Kie.ai API key
- ngrok

```bash
cp .env.guest .env.local
```

Fill your `.env.local`:

```env
GUEST_MODE=true
KIE_API_KEY=your_key
CALLBACK_BASE_URL=https://xxxx.ngrok-free.app
```

Start ngrok:

```bash
ngrok http 3000
```

Run the app:

```bash
npm run dev
```

---

## 3. Cloud Mode (production)

Requirements:
- Supabase
- Cloudflare R2
- Kie.ai API key

### 3a. Database setup

Open the **SQL Editor** in your Supabase project and run the two migration files in order:

1. **`supabase-setup.sql`** — core tables (generations, uploads, spaces, settings)
2. **`supabase-folders.sql`** — gallery folders & folder items

### 3b. Environment variables

Create `.env.local`:

```env
CALLBACK_BASE_URL=https://your-domain.com

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=
```

### 3c. Run

```bash
npm run dev
```

---

# 🤖 Codex CLI (optional — alternate GPT Image 2 backend)

Instead of routing GPT Image 2 through Kie.ai credits, HeliosGen can generate through your own ChatGPT Codex subscription via [`codex-imagegen-cli`](https://github.com/jdmnk/codex-imagegen-cli). This is a single shared login on the server — not a per-user API key — so it's best suited to self-hosted / single-user setups.

Requirements:
- A ChatGPT Plus/Pro/Team/Enterprise account with Codex access
- [`codex`](https://github.com/openai/codex) CLI installed on the machine running the server
- [`uv`](https://docs.astral.sh/uv/) (Python package manager)

### 1. Install the Codex CLI

```bash
# macOS
brew install codex

# or, cross-platform
npm install -g @openai/codex
```

### 2. Install codex-imagegen-cli

```bash
git clone https://github.com/jdmnk/codex-imagegen-cli.git
cd codex-imagegen-cli
uv sync --dev
uv tool install -e .
```

This installs the `codex-imagegen` binary — make sure it's on the server's `PATH`.

### 3. Log in

Either:
- run `codex login` in a terminal on the server (opens a browser to sign in), **or**
- open the app → **Settings → API Keys → Codex CLI → Connect Codex**, which walks you through a device-code login — visit the printed URL and enter the code, no terminal needed.

> ⚠️ Starting a new login (either way) immediately invalidates any existing session on that machine — the CLI clears old credentials the moment a login attempt begins, whether or not it's ever completed. Only start one when the status badge below shows **NOT CONFIGURED**.

### 4. Enable it for GPT Image 2

In **Settings → Image Models**, set GPT Image 2's provider toggle to **Codex CLI**. The status badge in **Settings → API Keys** shows **READY** once both the CLI and login are in place.

---

# 🌍 Deployment

Recommended platforms:
- Vercel
- Railway
- Render
- Fly.io

```bash
npm run build && npm start
```

## Self-hosting on a VPS

API keys are not the whole list. A plain `npm start` behind a default nginx
will build, boot, and then fail at upload, at video, and at every job result.

### 1. System packages

```bash
apt install ffmpeg          # provides both ffmpeg and ffprobe
```

`ffmpeg` is not optional. Every uploaded video is re-encoded through it to
strip metadata (GPS tags among them), and trimming and frame extraction call
it directly. Without it, video upload returns 400 and the video tools fail.
`curl` is also spawned for the Azure image-edit path.

Node 20+ is required. Use a process manager that restarts on boot — a
systemd unit or `pm2 startup`; the in-memory rate limiter and the job cache
are per-process, so run one instance unless you have a reason not to.

### 2. nginx

The defaults break two features outright:

```nginx
server {
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Uploads are capped at 100 MB in the app. nginx defaults to 1 MB, which
    # rejects a phone photo before the app ever sees it.
    client_max_body_size 100m;
  }

  location /api/job-stream {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;

    # Server-sent events. Buffering holds the whole stream until it ends, so
    # every generation looks like it hangs; the app sends X-Accel-Buffering: no
    # as well, but set it here too if anything else sits in front.
    proxy_buffering off;
    proxy_cache off;

    # Jobs run up to 12 minutes. The 60s default kills the stream first.
    proxy_read_timeout 900s;
  }
}
```

### 3. Supabase

Run both SQL files against the project — tables, row-level security and the
folder schema:

```bash
psql "$DATABASE_URL" -f supabase-setup.sql
psql "$DATABASE_URL" -f supabase-folders.sql
```

Then in the dashboard:

- **Authentication → URL Configuration** — set Site URL to your domain and add
  it to Redirect URLs. Sign-up confirmations use the Site URL and password
  resets use the page's own origin; left at the default, both mail out links
  pointing at `localhost:3000`.
- **Authentication → SMTP Settings** — connect a real sender (Resend, SES,
  Postmark, …). The built-in one is rate-limited to a handful of messages an
  hour and is explicitly not for production, so sign-ups silently stop.

### 4. Cloudflare R2

Enable public access on the bucket and put that hostname in `R2_PUBLIC_URL`.
The browser loads media straight from it, so allow your domain as an origin.

### 5. Environment

Everything in `.env.example`, plus:

- `CALLBACK_BASE_URL` — the public **https** origin of this deployment. The
  provider POSTs finished jobs there; if it is wrong or unreachable, requests
  are accepted and no result ever arrives.
- `CALLBACK_SECRET` — `openssl rand -hex 32`. Optional (it falls back to a
  value derived from another key), but set it so the webhook secret rotates
  independently of your API keys.
- `NEXT_PUBLIC_APP_URL` — your domain.
- **Do not set `GUEST_MODE` on a public host.** Guest mode treats every caller
  as the same user, which turns every ownership and auth check into a no-op.

Users supply their own kie.ai key through Settings, so no shared key is needed.

### 6. Check it end to end

Sign up (mail arrives), attach an image (no 413), start a generation, and watch
it complete without a reload (SSE is getting through). If a job stays pending,
the callback is not reaching you — check `CALLBACK_BASE_URL` and that
`/api/callback` is not behind any auth or IP filter.

---

# 🤝 Contributions

Contributions are welcome.

If you find a bug, have an idea, or want to improve HeliosGen:
- Open an issue
- Submit a pull request
- Share feedback or feature requests

All contributions are appreciated.

---

# 📄 License

MIT License

---

<p align="center">
  Built for creators building the future of AI workflows.
</p>

