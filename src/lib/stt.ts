export type STTProvider = "browser" | "deepgram" | "whisper" | "elevenlabs";

class STTService {
  private activeProvider: STTProvider = "browser";
  private providers: STTProvider[] = ["browser", "deepgram", "whisper", "elevenlabs"];

  // Example implementation of an abstraction layer
  async transcribe(audioBlob: Blob): Promise<string> {
     for (const provider of this.providers) {
        try {
           return await this.tryProvider(provider, audioBlob);
        } catch (error) {
           console.warn(`STT Provider ${provider} failed, falling back...`, error);
        }
     }
     throw new Error("All STT providers failed.");
  }

  private async tryProvider(provider: STTProvider, audioBlob: Blob): Promise<string> {
     // In a full production implementation, these would call dedicated backend endpoints
     switch (provider) {
        case "deepgram":
           return this.mockApiCall("deepgram", audioBlob);
        case "whisper":
           return this.mockApiCall("whisper", audioBlob);
        case "elevenlabs":
           return this.mockApiCall("elevenlabs", audioBlob);
        case "browser":
        default:
           throw new Error("Browser STT does not use blobs directly, it uses streams.");
     }
  }

  private async mockApiCall(name: string, blob: Blob): Promise<string> {
     // Simulate API latency
     await new Promise(r => setTimeout(r, 600));
     return `Simulated transcript from ${name}`;
  }
}

export const sttManager = new STTService();
