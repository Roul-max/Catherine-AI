import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const text = searchParams.get("text");
  const voiceId = searchParams.get("voiceId") || "pqHfZKP75CvOlQylNhV4";
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey || apiKey === "YOUR_ELEVENLABS_API_KEY") {
    return NextResponse.json({ error: "No API key configured on server." }, { status: 400 });
  }

  if (!text) {
     return NextResponse.json({ error: "No text provided." }, { status: 400 });
  }

  try {
    console.log("ELEVENLABS_API_KEY exists:", !!apiKey);
    console.log("ELEVENLABS_API_KEY prefix:", apiKey?.slice(0, 6));
    console.log("voiceId:", voiceId);
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
      }),
    });

    console.log("ElevenLabs status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();

      console.log("ElevenLabs error:", errorText);

      return NextResponse.json(
        { error: errorText },
        { status: response.status }
      );
    }

    return new NextResponse(response.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
