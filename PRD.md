# Briefly AI — Product Requirements

**Product:** Briefly AI — a complete AI browser companion, shipped as a Chrome extension (Manifest V3).
**Planning set:** `PRD.md` (what to build) · `ARCHITECTURE.md` (verified technical contracts) · `PROMPT.md` (build directive).
**Date:** 2026-07-10 · **Target:** developer install ("Load unpacked"), held to Chrome Web Store code quality.

---

## 1. One-line product

A calm, beautiful side-panel AI that can read the page you're on, answer anything (with live web search), act on pages for you, speak its answers aloud, take your voice as input, and turn any highlighted text into an instant action — powered by the user's own Anthropic API key.

## 2. Product principles (rank-ordered; resolve conflicts top-down)

1. **Never overwhelm.** One primary surface (the side panel), one contextual surface (the selection popup). Every feature discoverable within two clicks; advanced options behind progressive disclosure, never in the user's face.
2. **Feel instant.** Stream everything, render optimistically, design perceived latency (skeletons, live interim dictation text, prefetched audio). No spinner longer than ~300 ms without motion or explanation.
3. **Trust through transparency.** Show what context is attached, what model is answering, what the agent is doing, what a failure means. Never send page content silently; never fail silently.
4. **Craft over features.** A smaller thing that feels inevitable beats a bigger thing that feels assembled.

## 3. Platform & user

- Chrome (latest stable), Manifest V3. Single user, their own machine, their own Anthropic API key (BYOK — no server, no accounts, no telemetry).
- All data local. Nothing leaves the machine except calls to `api.anthropic.com` and `freetts.org`.

## 4. Feature specification

Priorities: **P0** = must ship, **P1** = ship in the same pass unless it endangers P0 quality, **P2** = only if everything else is polished.

### 4.1 Side-panel chat — P0

- Chrome Side Panel is the home surface. Toolbar-icon click opens it; persists across tab switches.
- Streaming markdown responses (code blocks with syntax highlighting + copy button, tables, lists, links).
- **Model picker in the composer** — user chooses per conversation; persists: `Haiku 4.5` (fast) · `Sonnet 5` (default, preselected) · `Opus 4.8` (most capable). Each response is badged with the model that produced it. Invisible housekeeping (auto-titles) is pinned to Haiku 4.5 regardless of picker.
- Conversation history: local (IndexedDB), auto-titled, searchable, pin/rename/delete, "New chat" always one tap away. One-click export of any conversation (Markdown) and all data (JSON).
- Message affordances: copy, retry (with same or different model), read aloud (§4.6), edit-and-resend last user message.
- Stop-generation button while streaming. Multi-line composer, Enter to send / Shift+Enter newline.

### 4.2 Page context — P0

- The current page is auto-attached as a visible, removable **context chip** in the composer (favicon + title). Captured at send time from the active tab: cleaned article text, title, URL, and current selection.
- One tap removes it for that message; per-site "never attach here" list in Settings; chip states make it obvious when a page can't be read (chrome:// pages, PDFs viewer, etc.).
- Nothing is transmitted until the user sends a message.

### 4.3 Quick actions + selection popup — P0

- **Curated five:** Summarize · Explain · Simplify · Translate · Improve writing. Plus user-defined custom actions (name + prompt template) in Settings.
- **Selection popup:** highlighting text on any page raises a small, quiet pill near the selection (shadow-DOM isolated, never fights page styles). It shows the five actions + "Ask Briefly…". Result renders in an elegant inline card: streamed text with copy · read aloud · "continue in panel" (opens the side panel with the exchange as a new conversation). Dismiss on Esc/click-away/scroll; per-site disable; global toggle.
- Same actions available in the panel (act on the attached page or pasted text). Right-click context menu mirrors them.
- Quick actions run on the user-selected model (per #5-C); prompts are tuned for short, tight outputs.

### 4.4 Answers with live web — P0

- Web search and page fetching via **Anthropic's native server-side `web_search` + `web_fetch` tools** — no extra keys. Available in chat by default (toggleable per conversation).
- Citations rendered as first-class UI: inline numbered references + a tidy source list with favicons; opening a source never loses the chat.
- Search activity is visible while it happens ("Searching… · reading example.com") — quiet, single-line status, not a wall of logs.

### 4.5 Agent mode — act on pages — P0 core, P1 multi-tab

Briefly can *do things* in the browser, not just read: the parity feature set of Claude for Chrome, minus its recording/teach-mode.

- **Capabilities (P0, current tab):** read/understand the page structurally, click, type into fields, select options, scroll, navigate to URLs, go back, wait for loads, take screenshots to see the result, and chain these into multi-step tasks ("find the cheapest option and open it", "fill this form from my message").
- **P1, multi-tab:** list/open/switch tabs so tasks can span pages (compare across sites, gather from several tabs).
- **Permission model (per user decision — no per-step prompts):** a single clear control with two modes, global default + per-site override:
  - **Ask first** (default): Briefly asks once before it begins acting on a site during a task — then proceeds freely.
  - **Act freely:** no confirmations.
  - Hard safety floor in both modes: never type into password fields, never enter payment card details, and pause for explicit go-ahead before a final purchase/payment submission. This is the only interruption that survives "Act freely."
- **Live action feed:** while the agent works, the panel shows a compact, human-readable step stream ("Opened amazon.com → typed 'usb-c hub' → clicked Search"). Prominent **Stop** button; Esc also stops. Task ends with a short outcome summary.
- Agent runs on the user-selected model (Opus 4.8 recommended in UI copy for complex tasks, but never forced).
- **Explicitly excluded:** workflow recording / teach-mode and saved-workflow "shortcuts" (per user decision).

### 4.6 Voice — P0

- **Dictation (STT):** mic button in the composer. Uses the browser's native Web Speech API — free, streaming, no rate limits. Interim words appear live in the composer (styled as provisional), finalize on pause; tap again to stop. Language follows the browser locale.
- **Read aloud (TTS):** speaker button on every assistant message and on the selection popup. Primary voice: **freetts.org** neural TTS (400+ voices; voice + speed configurable in Settings). Automatic, seamless fallback to the browser's built-in `speechSynthesis` when freetts is rate-limited, over quota, or unreachable — playback never just dies.
- freetts free-tier budget (1,000 chars/request, 20 req/min, 60,000 chars/month) is managed invisibly: sentence-boundary chunking, sequential queue, local audio cache, and a small usage meter in Settings. See ARCHITECTURE §6.
- Player affordances: play/pause/stop, subtle progress indication on the message being spoken.

### 4.7 Onboarding & settings — P0

- **First run:** a single polished screen (opens on install): API-key entry with live validation (green check via a free models-list call), optional one-tap mic permission, three-line orientation of the surfaces. Ends with a button that opens the side panel. Skippable; panel shows a graceful "add your key" state until then.
- **Settings (in-panel, one screen with sections):** API key (masked, re-validate) · quick-action editor · voice (voice picker, speed, TTS usage meter) · site permissions (page-context blocklist, agent mode per-site) · appearance (system/light/dark) · data (export all, clear all).

### 4.8 Small standard affordances — P1

Keyboard command to toggle the panel; right-click context menu entries; image input in chat (paste/upload) + one-click "capture this page" screenshot into the conversation (all three models support vision); token/cost hint per conversation (subtle, in the header menu).

## 5. Non-goals (v1)

No backend or accounts · no cloud sync (all local; export is the escape hatch) · no workflow recording or saved automation shortcuts · no hands-free continuous voice mode · no PDF/file-upload parsing · no Web Store packaging assets · no localization beyond English UI (dictation/translation handle other languages via the models) · no analytics/telemetry of any kind.

## 6. Design bar

The full design direction is delegated to the builder (see PROMPT.md §Design). Non-negotiables only:

- A distinctive, ownable visual identity — this must not look like a template or like any existing AI product, including Claude's.
- Light **and** dark themes, both first-class, following system by default.
- Motion used sparingly and meaningfully (state changes, streaming, the selection pill's entrance) — never decorative noise.
- Every state designed: empty, loading, streaming, error, no-key, offline, quota-exceeded, unreadable-page.
- Accessible: keyboard-navigable panel, visible focus, WCAG-AA contrast in both themes, respects `prefers-reduced-motion`.

## 7. Acceptance (definition of done)

Clean build + typecheck; extension loads unpacked with zero console errors across all contexts; every P0 flow in the PROMPT.md smoke checklist works; every error state renders a designed state, not a raw failure; both themes reviewed; the result reads as a crafted product.
