import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;
export const runtime = "edge";

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function pcmToWav(pcmData: Uint8Array, sampleRate: number = 24000, channels: number = 1, bitDepth: number = 16): Uint8Array {
  const dataLength = pcmData.length;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * (bitDepth / 8), true);
  view.setUint16(32, channels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(36, "data");
  view.setUint32(40, dataLength, true);

  const wavArray = new Uint8Array(buffer);
  wavArray.set(pcmData, 44);

  return wavArray;
}

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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-tts:generateContent?key=${apiKey}`,
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
    const pcmArray = base64ToUint8Array(base64Audio);
    const wavArray = pcmToWav(pcmArray);

    return new NextResponse(wavArray, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": wavArray.length.toString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
