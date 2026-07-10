# Decisions

- Plain two-config Vite build (ESM pages + module SW, separate IIFE content script) instead of CRXJS: fewer moving parts, no plugin compatibility risk.
- freetts verified live 2026-07-10: `POST /api/tts` requires `rate` matching `^[+-]\d{1,3}%$` and `pitch` matching `^[+-]\d{1,3}Hz$` as strings; success returns `{file_id, claim_token, claim_expires_at, hd_trial, hd_trial_downgraded}`; `GET /api/audio/{file_id}` serves audio/mpeg with no token; the endpoint gates on a browser User-Agent (extension fetches pass, curl needs a UA); `/api/voices` returns Azure-style `{ShortName, Locale, Gender, FriendlyName}` objects.
- Added `offscreen` and `favicon` permissions beyond ARCHITECTURE §3 (offscreen API requires its permission; `_favicon/` serves citation favicons locally so no third-party favicon service is ever called). `minimum_chrome_version` 116.
- Panel toggle command tracked via a long-lived `panel` Port registry in the SW: close is a port message, open stays synchronous in the command handler so the user gesture is never lost.
- Fonts are served from `public/fonts` with hand-written `@font-face`; fontsource packages are dev-only file sources. The selection pill loads the UI font on host pages via the FontFace API from `web_accessible_resources`.
- Content-script styles live in TS template strings (no CSS file extraction from the IIFE build; shadow-root adoptedStyleSheets).
- Settings schema adds `webSearchDefault` and `ttsFallbackAt` on top of ARCHITECTURE §8.
- Message content is persisted as loosely-typed Anthropic-shaped blocks (`{type} & Record`) with typed guards, so new server block types never break storage or rendering.
