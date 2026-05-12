# Real-Time Conversational Translator (Next.js)

This app provides a two-person conversation flow:
- Person A speaks -> translated text + speech for Person B
- Person B speaks -> translated text + speech for Person A

## Fixed Languages

- English (`en`)
- Tamil (`ta`)
- Malayalam (`ml`)
- Hindi (`hi`)

## Tech Used

- Next.js App Router
- Web Speech API (speech recognition + speech synthesis in browser)
- [Sarvam AI](https://sarvam.ai/) Translate API (`sarvam-translate:v1`) for server-side translation

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env.local` file in the project root:

```bash
SARVAM_API_KEY=your_sarvam_api_subscription_key_here
```

Get an API key from the Sarvam dashboard and pass it as `api-subscription-key` (handled in `src/app/api/translate/route.ts`).

3. Start the dev server:

```bash
npm run dev
```

4. Open `http://localhost:3000`.

## Notes

- Speech recognition support depends on browser support (best support is usually Chromium-based browsers).
- Translations are routed through `src/app/api/translate/route.ts`.
- If source and target languages are same, the server returns the original text.
