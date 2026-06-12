import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { query, webhookUrl } = await req.json();

  if (!webhookUrl || webhookUrl === "YOUR_N8N_WEBHOOK_URL") {
     return NextResponse.json({ error: "Missing webhook URL" }, { status: 400 });
  }

  try {
     // Forward to real n8n webhook assuming it supports SSE/Streaming
     const fwUrl = webhookUrl.startsWith("/") ? new URL(webhookUrl, req.url).toString() : webhookUrl;
     const response = await fetch(fwUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
     });

     if (!response.ok) {
        return NextResponse.json({ error: "Webhook error" }, { status: response.status });
     }

     return new NextResponse(response.body, {
        headers: {
           "Content-Type": "text/event-stream",
           "Cache-Control": "no-cache",
           "Connection": "keep-alive"
        }
     });
        
  } catch(e: any) {
     return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
