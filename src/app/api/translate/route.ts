import { NextResponse } from "next/server";

const HUGGING_FACE_URL =
  "https://router.huggingface.co/hf-inference/models/facebook/nllb-200-distilled-600M";
const SARVAM_TRANSLATE_URL = "https://api.sarvam.ai/translate";

type LanguageCode = "en" | "ta" | "ml" | "hi";

type RequestBody = {
  text?: string;
  sourceLanguage?: LanguageCode;
  targetLanguage?: LanguageCode;
};

const allowedLanguages = new Set<LanguageCode>(["en", "ta", "ml", "hi"]);
const nllbCodeByLanguage: Record<LanguageCode, string> = {
  en: "eng_Latn",
  ta: "tam_Taml",
  ml: "mal_Mlym",
  hi: "hin_Deva",
};
const sarvamCodeByLanguage: Record<LanguageCode, string> = {
  en: "en-IN",
  ta: "ta-IN",
  ml: "ml-IN",
  hi: "hi-IN",
};

function parseTranslatedText(payload: unknown): string | null {
  if (!payload) return null;

  if (typeof payload === "string") {
    return payload.trim();
  }

  if (Array.isArray(payload) && payload.length > 0) {
    const firstItem = payload[0] as Record<string, unknown>;
    const nested = firstItem?.translation_text ?? firstItem?.generated_text;
    if (typeof nested === "string" && nested.trim()) {
      return nested.trim();
    }
  }

  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const directText =
      record.translated_text ?? record.translation_text ?? record.generated_text ?? record.text;
    if (typeof directText === "string" && directText.trim()) {
      return directText.trim();
    }
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const text = body.text?.trim();
    const sourceLanguage = body.sourceLanguage;
    const targetLanguage = body.targetLanguage;

    if (!text) {
      return NextResponse.json({ error: "Text is required." }, { status: 400 });
    }

    if (
      !sourceLanguage ||
      !targetLanguage ||
      !allowedLanguages.has(sourceLanguage) ||
      !allowedLanguages.has(targetLanguage)
    ) {
      return NextResponse.json({ error: "Invalid language pair." }, { status: 400 });
    }

    if (sourceLanguage === targetLanguage) {
      return NextResponse.json({ translatedText: text });
    }

    const token = process.env.HUGGING_FACE_API_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "Missing HUGGING_FACE_API_TOKEN in environment variables." },
        { status: 500 },
      );
    }

    const hfResponse = await fetch(HUGGING_FACE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: text,
        parameters: {
          src_lang: nllbCodeByLanguage[sourceLanguage],
          tgt_lang: nllbCodeByLanguage[targetLanguage],
        },
      }),
      cache: "no-store",
    });

    const rawBody = await hfResponse.text();
    let payload: unknown = null;
    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      payload = rawBody;
    }

    if (!hfResponse.ok) {
      if (hfResponse.status === 401 || hfResponse.status === 403) {
        return NextResponse.json(
          {
            error:
              "Hugging Face token is missing required permissions. Create/update a token with Inference Providers access and set HUGGING_FACE_API_TOKEN in .env.local.",
          },
          { status: hfResponse.status },
        );
      }

      const providerUnsupportedMessage =
        typeof payload === "object" &&
        payload !== null &&
        "error" in (payload as Record<string, unknown>) &&
        typeof (payload as Record<string, unknown>).error === "string"
          ? ((payload as Record<string, unknown>).error as string)
          : "";

      if (
        providerUnsupportedMessage.includes("Model not supported by provider") ||
        providerUnsupportedMessage.includes("not currently available via any of the supported")
      ) {
        const sarvamKey = process.env.SARVAM_API_KEY;

        if (sarvamKey) {
          const sarvamResponse = await fetch(SARVAM_TRANSLATE_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "api-subscription-key": sarvamKey,
            },
            body: JSON.stringify({
              input: text,
              source_language_code: sarvamCodeByLanguage[sourceLanguage],
              target_language_code: sarvamCodeByLanguage[targetLanguage],
              model: "sarvam-translate:v1",
            }),
            cache: "no-store",
          });

          const sarvamRawBody = await sarvamResponse.text();
          let sarvamPayload: unknown = null;
          try {
            sarvamPayload = sarvamRawBody ? JSON.parse(sarvamRawBody) : null;
          } catch {
            sarvamPayload = sarvamRawBody;
          }

          if (sarvamResponse.ok && typeof sarvamPayload === "object" && sarvamPayload !== null) {
            const sarvamRecord = sarvamPayload as Record<string, unknown>;
            const sarvamTranslated =
              sarvamRecord.translated_text ??
              sarvamRecord.translation_text ??
              sarvamRecord.output ??
              sarvamRecord.translatedText;

            if (typeof sarvamTranslated === "string" && sarvamTranslated.trim()) {
              return NextResponse.json({ translatedText: sarvamTranslated.trim() });
            }
          }
        }

        return NextResponse.json(
          {
            error:
              "facebook/nllb-200-distilled-600M is unavailable on your Hugging Face provider. Add SARVAM_API_KEY to .env.local for automatic fallback, or use a dedicated Hugging Face Inference Endpoint.",
          },
          { status: 503 },
        );
      }

      const hfError =
        (typeof payload === "object" &&
          payload !== null &&
          "error" in (payload as Record<string, unknown>) &&
          typeof (payload as Record<string, unknown>).error === "string" &&
          ((payload as Record<string, unknown>).error as string)) ||
        (typeof payload === "string" && payload.startsWith("<!DOCTYPE")
          ? "Hugging Face returned HTML instead of JSON. Check endpoint/model availability."
          : "Hugging Face API call failed.");
      return NextResponse.json({ error: hfError }, { status: hfResponse.status });
    }

    const translatedText = parseTranslatedText(payload);

    if (!translatedText) {
      return NextResponse.json(
        { error: "Unable to parse translated text from Hugging Face response." },
        { status: 502 },
      );
    }

    return NextResponse.json({ translatedText });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected server error while translating text.",
      },
      { status: 500 },
    );
  }
}
