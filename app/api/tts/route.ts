import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const text = searchParams.get("text");
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    return NextResponse.json({ error: "No API key configured on server." }, { status: 400 });
  }

  if (!text) {
     return NextResponse.json({ error: "No text provided." }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: "Kore" }
              }
            }
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.log("GEMINI TTS STATUS:", response.status);
      console.log("GEMINI TTS ERROR:", errorText);

      return NextResponse.json(
        { error: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log("=== GEMINI TTS DEBUG ===");
    console.log("Full response keys:", Object.keys(data));
    console.log("Candidates length:", data.candidates?.length);
    console.log("First candidate:", JSON.stringify(data.candidates?.[0]?.content?.parts?.[0]));
    const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    console.log("MIME TYPE:", inlineData?.mimeType);
    console.log("DATA LENGTH:", inlineData?.data?.length);
    console.log("======================");

    if (!inlineData?.data) {
      return NextResponse.json({ error: "No audio data in Gemini response" }, { status: 500 });
    }

    const base64Audio = inlineData.data;
    const audioBuffer = Buffer.from(base64Audio, "base64");

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": inlineData.mimeType || "audio/mpeg",
        "Content-Length": audioBuffer.length.toString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
