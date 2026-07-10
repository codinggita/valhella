# Briefly AI — Architecture & Verified API Contracts

Facts below were verified against live docs on **2026-07-10**. Treat them as authoritative over training memory. If reality diverges at build time (an endpoint changes shape, a param is rejected), adapt with the stated fallback and log it in `DECISIONS.md` — do not stop the build.

---

## 1. Stack

- **React 18 + TypeScript (strict) + Vite.** Use the CRXJS Vite plugin if it works out of the box; otherwise a plain Vite multi-entry config with a static `manifest.json` — builder's call, don't fight tooling.
- **Hand-crafted CSS** (vanilla CSS or CSS modules, design tokens as custom properties). No Tailwind, no component libraries.
- Small, well-known deps are fine: `@mozilla/readability` (extraction), `dexie` (IndexedDB), a markdown renderer + syntax highlighter. Bundle any custom fonts locally (MV3 pages should not depend on remote assets).
- Suggested layout: `src/sidepanel/` (app) · `src/content/` (extractor, selection popup, agent actuator) · `src/background/` (service worker) · `src/onboarding/` · `src/lib/` (API clients, storage, tts/stt, agent loop) · `public/manifest.json` + icons.

## 2. Extension topology — who does what

| Context | Responsibilities | Why |
|---|---|---|
| **Side panel** (extension page) | Chat UI, streaming Anthropic calls, agent loop orchestration, TTS playback, STT capture, settings | Extension pages get host-permission CORS exemption and live as long as the panel is open — no service-worker lifetime games. The panel persists across tab navigation, which is exactly what the agent loop needs. |
| **Service worker** | Install/onboarding trigger, context menus, keyboard command, message router, quick-action API calls for the selection popup (short-lived), freetts fetches for the popup's read-aloud | Keep it thin; assume it can be killed at any idle moment. No long-lived state outside `chrome.storage`. |
| **Content scripts** (all pages) | 1) Page extractor (Readability + selection), 2) selection popup (isolated via **shadow DOM**), 3) agent actuator (DOM indexing + synthetic interactions) | Content scripts have page-level CORS — they never call external APIs directly; they message the SW/panel. |
| **Onboarding page** (extension tab) | Key entry + validation, mic permission bootstrap (`getUserMedia` once grants the extension origin) | Mic permission requested from a full extension tab is the reliable path; it then works in the panel. |

Messaging: `chrome.runtime` messages/ports with a small typed protocol (`lib/messages.ts`). Streaming to the popup uses a `Port`.

## 3. Manifest (MV3) essentials

- `"permissions"`: `sidePanel, storage, unlimitedStorage, activeTab, scripting, tabs, contextMenus, clipboardWrite`
- `"host_permissions"`: `"<all_urls>"` (page context + agent must work everywhere; also exempts `api.anthropic.com` and `freetts.org` fetches from CORS in extension contexts)
- `side_panel.default_path`, `action` (click opens panel via `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`), one `commands` entry to toggle the panel (if the user-gesture restriction on `sidePanel.open()` bites from a command, fall back to action-click only and log it).
- Default MV3 CSP; no remote code, ever.

## 4. Anthropic API (verified)

**Endpoint:** `POST https://api.anthropic.com/v1/messages` — called directly from extension contexts.
**Headers:** `x-api-key: <user key>` · `anthropic-version: 2023-06-01` · `content-type: application/json` · `anthropic-dangerous-direct-browser-access: true` (officially required for browser-side calls).
**Key validation (free):** `GET https://api.anthropic.com/v1/models` with the same headers — 200 = valid key; also confirms model availability.

### Models (exact IDs — never append date suffixes)

| Model | ID | Context | Max output | $/MTok in/out | Role in UI |
|---|---|---|---|---|---|
| Claude Haiku 4.5 | `claude-haiku-4-5` | 200K | 64K | $1 / $5 | "Fast" picker option; pinned for auto-titles |
| Claude Sonnet 5 | `claude-sonnet-5` | 1M | 128K | $3 / $15 (intro $2/$10 through 2026-08-31) | Default |
| Claude Opus 4.8 | `claude-opus-4-8` | 1M | 128K | $5 / $25 | "Most capable" |

### Per-model parameter rules (violations return 400)

- **Never send** `temperature`, `top_p`, `top_k` to Sonnet 5 or Opus 4.8. Simplest: omit sampling params for all three models.
- **Thinking:** Sonnet 5 runs adaptive thinking **by default when `thinking` is omitted**; send `{"type": "disabled"}` for latency-sensitive quick actions. Opus 4.8 runs **without** thinking when omitted; send `{"type": "adaptive"}` explicitly for chat/agent. Haiku 4.5: leave thinking off entirely (its legacy `budget_tokens` style isn't worth the latency here). Never send `budget_tokens` to Sonnet 5/Opus 4.8.
- **Effort** (`output_config: {"effort": ...}`): supported on Sonnet 5/Opus 4.8 only — **errors on Haiku 4.5**. Fine to leave unset (defaults to high).
- `max_tokens` is required. Sensible defaults: chat 16384 · quick actions 2048 · agent turns 8192 · titles 100.

### Streaming

`"stream": true`; parse SSE: `message_start` → `content_block_start` → `content_block_delta` (`text_delta` / `thinking_delta` / `input_json_delta`) → `content_block_stop` → `message_delta` (carries `stop_reason`, usage) → `message_stop`. Stream all user-visible generations; wire **AbortController** to the Stop button. Read streams via `fetch` + `ReadableStream` in the panel; via Port-relayed chunks for the popup.

### Web search / web fetch (server-side tools — no extra keys)

Tool versions are **model-dependent**:

| Model | web_search | web_fetch |
|---|---|---|
| Sonnet 5, Opus 4.8 | `{"type": "web_search_20260209", "name": "web_search"}` | `{"type": "web_fetch_20260209", "name": "web_fetch"}` |
| Haiku 4.5 | `{"type": "web_search_20250305", "name": "web_search"}` | `{"type": "web_fetch_20250910", "name": "web_fetch"}` |

Keep a per-model capability map; if the API rejects a tool type (400 naming it), retry the request without that tool and surface a quiet notice. Results arrive as `web_search_tool_result` blocks + cited `text` blocks (each carries a `citations` array — render these). Searches are billed by Anthropic on the user's key in addition to tokens. **`pause_turn`:** a server-tool turn may stop with `stop_reason: "pause_turn"` — resend the conversation with the assistant turn appended (no extra user text); the server resumes automatically. Cap resumes at 5.

### Vision

All three models accept images as content blocks: `{"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": "<b64>"}}` placed before the text block. Downscale before sending: longest edge ≤ ~1,400 px, JPEG ~0.8 quality (controls token cost; models support up to 1568–2576 px but the extra fidelity isn't needed here).

### Prompt caching (matters for the agent loop)

Add `"cache_control": {"type": "ephemeral"}` to the last system block, and in agent loops to the newest `tool_result` every few turns. Keep `tools` and `system` byte-stable within a conversation (never reorder, never interpolate timestamps) or the cache silently misses. Verify via `usage.cache_read_input_tokens` during development.

### Stop reasons & errors → designed states

| Signal | Handling |
|---|---|
| `stop_reason: "end_turn"` | Normal completion |
| `"tool_use"` | Execute tools, return **all** `tool_result` blocks in a single user message |
| `"max_tokens"` | Show "response was cut short" affordance with a continue/retry action |
| `"refusal"` | Designed "Claude declined this request" state — never a raw error |
| `"pause_turn"` | Auto-resume (above) |
| HTTP 401 | Key invalid → route to the add-your-key state |
| HTTP 429 | Respect `retry-after`; one auto-retry, then a quiet designed notice |
| HTTP 500/529 | Exponential backoff, 2 retries, then designed notice |

## 5. Agent mode implementation

The loop runs **in the side panel** (see §2 — no service-worker lifetime issues; if the panel closes mid-task the task stops, which is the correct UX). Manual tool-use loop: send `messages` + client tool definitions → on `stop_reason: "tool_use"`, execute each call via the content-script actuator → append results → repeat until `end_turn`, Stop, or a 25-turn cap.

### Tool set (client-defined JSON-schema tools)

| Tool | Input | Executed by |
|---|---|---|
| `read_page` | — | Content script: returns the indexed snapshot (below) |
| `screenshot` | — | Panel: `chrome.tabs.captureVisibleTab` → downscaled image block in the `tool_result` |
| `click` | `element_id` | Content script |
| `type_text` | `element_id, text, press_enter?` | Content script |
| `select_option` | `element_id, value` | Content script |
| `scroll` | `direction` \| `element_id` | Content script |
| `navigate` | `url` | Panel: `chrome.tabs.update` |
| `go_back` | — | Panel: `chrome.tabs.goBack` |
| `wait` | `seconds ≤ 5` | Panel |
| `list_tabs` / `open_tab` / `switch_tab` (P1) | — / `url` / `tab_id` | Panel: `chrome.tabs.*` |

### Page snapshot format

Content script indexes interactive elements (links, buttons, inputs, selects, and ARIA-role equivalents) into a registry with stable ids, and serializes: `[12] button "Add to cart"` · `[13] textbox "Search" (empty)` — plus a heading/visible-text outline. Cap ~15K chars, viewport-first. Every action's `tool_result` returns a short outcome line + a fresh snapshot (the registry is rebuilt after DOM changes; stale ids return an explicit error so the model re-reads).

### Actuation details

Synthesize real event sequences so frameworks register them: clicks as `pointerdown → pointerup → click` on the element center after `scrollIntoView`; typing as focus → native value setter (React-safe) → `input`/`change` events → optional `Enter` keydown/keyup. Same-document SPAs: watch for DOM mutation settle (~500 ms quiet) before snapshotting.

### Permission model (PRD §4.5)

- **Ask first** (default): one in-panel approval when a task first acts on a given site; then free within that site for the task. Cross-site moves re-ask.
- **Act freely:** no approvals.
- **Hard floor (both modes):** never type into `type=password` fields or `autocomplete="cc-*"` fields (tool returns a refusal result the model sees); always pause for explicit confirmation before a final purchase/payment submission (detect: submit controls whose text/context matches pay/buy/place-order patterns).
- Stop button: aborts the API stream (AbortController) and flips a cancel token the actuator checks before every action.

## 6. freetts.org TTS (verified 2026-07-10)

**Base:** `https://freetts.org/api` — no API key, no signup. **No CORS headers** — irrelevant for us: extension-context fetches with `<all_urls>` host permission are CORS-exempt.

| Endpoint | Purpose |
|---|---|
| `POST /tts` | Body: `{ text, voice, rate, pitch }`. `text` ≤ 1,000 chars · `voice` default `en-US-JennyNeural` · `rate` −50%…+100% · `pitch` −20Hz…+20Hz. Returns a file id/URL — **verify the exact response JSON with one live call at build time** and adapt. |
| `GET /audio/{file_id}` | MP3 (48 kHz). Server keeps files ~1 hour — cache locally immediately. |
| `GET /voices` | Voice catalog for the Settings picker. |

**Free-tier limits:** 20 requests/min per IP · 1,000 chars/request · 60,000 chars/month (some docs also mention a ~2,000 chars/day cap — treat all limits as soft and detect via HTTP 429).

**Pipeline:** sentence-boundary chunking at ≤ 950 chars → sequential playback queue, prefetching chunk *n+1* while *n* plays → local cache in IndexedDB keyed `sha256(voice|rate|pitch|chunkText)`, LRU-capped ~50 MB.

**Quota ledger:** monthly character counter in `chrome.storage.local` (keyed by `YYYY-MM`). At ≥ 55K chars, or on any 429/network failure, fall back **silently** to `speechSynthesis` (match voice by language, map rate); show only a subtle "standard voice" note in Settings. Read-aloud must never visibly fail.

**Playback context:** the side panel plays audio when open. For selection-popup read-aloud with the panel closed, the service worker creates an **offscreen document** (`reason: AUDIO_PLAYBACK`) — service workers cannot play audio.

## 7. Speech-to-text (Web Speech API)

freetts.org has **no public STT API** (verified — web tool only). Use the browser-native `webkitSpeechRecognition`, running **in the side-panel document** (never the service worker): `interimResults: true` for live provisional text, `lang: navigator.language`, restart-on-`no-speech` while the mic button is active.

- **Mic permission:** call `getUserMedia({ audio: true })` once from the **onboarding tab** — a full extension page is the reliable grant path; the permission then covers the panel.
- **Error map:** `not-allowed` → designed "enable microphone" state linking to onboarding · `network` (Chrome's recognizer is cloud-backed) → "dictation needs a connection" · `no-speech` → quiet auto-restart.
- If recognition proves unavailable in the panel context on the current Chrome, fall back to capturing in an offscreen document and relaying transcripts — verify at build time, log in `DECISIONS.md`.

## 8. Storage

**`chrome.storage.local`** (settings — small, synchronous-ish):

```ts
{
  apiKey: string,                    // BYOK; plaintext local by design — never logged, masked in UI
  defaultModel: 'claude-haiku-4-5' | 'claude-sonnet-5' | 'claude-opus-4-8',
  permissionMode: { default: 'ask_first' | 'act_freely', perSite: Record<string, 'ask_first' | 'act_freely'> },
  voice: { id: string, rate: number },
  customActions: { id: string, name: string, prompt: string }[],
  siteContextBlocklist: string[],
  selectionPopupEnabled: boolean, selectionPopupBlocklist: string[],
  theme: 'system' | 'light' | 'dark',
  onboardingDone: boolean,
  ttsUsage: { month: string, chars: number }
}
```

**IndexedDB** (via `dexie`), db `briefly`: `conversations` (id, title, model, pinned, createdAt, updatedAt) · `messages` (id, conversationId, role, content blocks, model, createdAt) · `audioCache` (hash, blob, bytes, lastUsed). Export: Markdown per conversation, JSON dump for everything. "Clear all" wipes both stores (keeps the API key unless the user also removes it).

## 9. Known platform gotchas (don't rediscover these)

- `sidePanel.open()` requires a user gesture — wire it to the action click and the keyboard command handler directly.
- MV3 service worker dies after ~30 s idle: nothing long-lived belongs there (§2 already routes long work to the panel).
- Selection popup must live in a **closed shadow root** with its own stylesheet — page CSS must not leak in either direction.
- `chrome.tabs.captureVisibleTab` captures only the active tab's visible viewport and needs `<all_urls>`.
- Readability needs a cloned document (`new Readability(document.cloneNode(true))`) — never mutate the live page.
- `chrome://`, Web Store, and PDF-viewer pages are unscriptable: the context chip and agent must show their "can't read this page" states there.
