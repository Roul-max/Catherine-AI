import { NextRequest, NextResponse } from "next/server";

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

export async function POST(req: NextRequest) {
  const { query } = await req.json();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: any) => {
        controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
      };

      try {
        let matchedTool = null;
        let responseTokens = ["I ", "have ", "received ", "your ", "request. "];

        if (query.toLowerCase().includes("search") || query.toLowerCase().includes("tavily")) {
          matchedTool = "Tavily Search";
          responseTokens = ["I ", "have ", "searched ", "the ", "web ", "for ", "you. ", "The ", "results ", "are ", "promising."];
        } else if (query.toLowerCase().includes("email") || query.toLowerCase().includes("gmail")) {
          matchedTool = "Gmail";
          responseTokens = ["I ", "have ", "checked ", "your ", "email. ", "There ", "are ", "no ", "new ", "urgent ", "messages."];
        } else if (query.toLowerCase().includes("calendar") || query.toLowerCase().includes("event")) {
          matchedTool = "Google Calendar";
          responseTokens = ["I ", "have ", "accessed ", "your ", "calendar. ", "Your ", "schedule ", "is ", "clear ", "today."];
        }

        // Simulate thinking delay
        await sleep(500);

        if (matchedTool) {
          sendEvent({ type: "tool_start", tool: matchedTool });
          // Simulate tool execution time
          await sleep(1500);
          sendEvent({ type: "tool_end", tool: matchedTool });
        }

        // Simulate streaming response
        for (const token of responseTokens) {
          await sleep(100);
          sendEvent({ type: "token", text: token });
        }

      } catch (e) {
         console.error("Mock n8n error", e);
      } finally {
         controller.close();
      }
    }
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
}
