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
- Hugging Face Inference API with `facebook/nllb-200-distilled-600M`

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env.local` file in the project root:

```bash
HUGGING_FACE_API_TOKEN=your_hf_token_here
# Optional fallback if HF provider doesn't support the model
SARVAM_API_KEY=your_sarvam_api_key_here
```

Important: use a Hugging Face token that has permission to call **Inference Providers**.

If you see "Model not supported by provider hf-inference", use a token with proper access and
ensure the selected model is available for your account/provider. If needed, deploy a dedicated
Hugging Face Inference Endpoint.

When `SARVAM_API_KEY` is configured, the API route automatically falls back to Sarvam Translate
(`sarvam-translate:v1`) for `en/ta/ml/hi` if Hugging Face provider rejects the model.

3. Start the dev server:

```bash
npm run dev
```

4. Open `http://localhost:3000`.

## Notes

- Speech recognition support depends on browser support (best support is usually Chromium-based browsers).
- Translations are routed through `src/app/api/translate/route.ts`.
- If source and target languages are same, the server returns the original text.
