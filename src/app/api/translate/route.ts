import { NextResponse } from "next/server";

const SARVAM_TRANSLATE_URL = "https://api.sarvam.ai/translate";

type LanguageCode = "en" | "ta" | "ml" | "hi";

type RequestBody = {
  text?: string;
  sourceLanguage?: LanguageCode;
  targetLanguage?: LanguageCode;
};

const allowedLanguages = new Set<LanguageCode>(["en", "ta", "ml", "hi"]);

const sarvamCodeByLanguage: Record<LanguageCode, string> = {
  en: "en-IN",
  ta: "ta-IN",
  ml: "ml-IN",
  hi: "hi-IN",
};

function extractTranslatedText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const candidates = [
    record.translated_text,
    record.translation_text,
    record.output,
    record.translatedText,
    record.text,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
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

    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing SARVAM_API_KEY in environment variables." },
        { status: 500 },
      );
    }

    const sarvamResponse = await fetch(SARVAM_TRANSLATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": apiKey,
      },
      body: JSON.stringify({
        input: text,
        source_language_code: sarvamCodeByLanguage[sourceLanguage],
        target_language_code: sarvamCodeByLanguage[targetLanguage],
        model: "sarvam-translate:v1",
      }),
      cache: "no-store",
    });

    const rawBody = await sarvamResponse.text();
    let payload: unknown = null;
    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      payload = null;
    }

    if (!sarvamResponse.ok) {
      const message =
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof (payload as Record<string, unknown>).error === "string"
          ? ((payload as Record<string, unknown>).error as string)
          : rawBody.startsWith("<!DOCTYPE")
            ? "Translation service returned an unexpected response."
            : `Translation service error (${sarvamResponse.status}).`;
      return NextResponse.json({ error: message }, { status: sarvamResponse.status });
    }

    const translatedText = extractTranslatedText(payload);

    if (!translatedText) {
      return NextResponse.json(
        { error: "Unable to parse translated text from the translation service." },
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
