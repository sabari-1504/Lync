import { NextResponse } from "next/server";

const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech";

type Body = {
  text?: string;
  target_language_code?: string;
  speaker?: string;
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing SARVAM_API_KEY." }, { status: 500 });
    }

    const body = (await request.json()) as Body;
    const text = body.text?.trim();
    const target_language_code = body.target_language_code?.trim();
    const speaker = body.speaker?.trim() || "shubh";

    if (!text) {
      return NextResponse.json({ error: "Text is required." }, { status: 400 });
    }
    if (!target_language_code) {
      return NextResponse.json({ error: "target_language_code is required." }, { status: 400 });
    }

    const sarvamResponse = await fetch(SARVAM_TTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": apiKey,
      },
      body: JSON.stringify({
        text,
        target_language_code,
        speaker,
        model: "bulbul:v3",
      }),
      cache: "no-store",
    });

    const raw = await sarvamResponse.text();
    let payload: unknown = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }

    if (!sarvamResponse.ok) {
      const msg =
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof (payload as { error?: { message?: string } }).error?.message === "string"
          ? (payload as { error: { message: string } }).error.message
          : `TTS failed (${sarvamResponse.status})`;
      return NextResponse.json({ error: msg }, { status: sarvamResponse.status });
    }

    const record = payload as { audios?: string[] } | null;
    const first = record?.audios?.[0];
    if (!first || typeof first !== "string") {
      return NextResponse.json({ error: "Invalid text-to-speech response." }, { status: 502 });
    }

    return NextResponse.json({
      audioBase64: first,
      mimeType: "audio/wav",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TTS error." },
      { status: 500 },
    );
  }
}
