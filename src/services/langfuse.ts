import { Env, LangfusePrompt } from "../types";

export class LangfuseService {
  private host: string;
  private secretKey: string;
  private publicKey: string;

  constructor(env: Env) {
    this.host = env.LANGFUSE_HOST;
    this.secretKey = env.LANGFUSE_SECRET_KEY;
    this.publicKey = env.LANGFUSE_PUBLIC_KEY;
  }

  private getAuthHeader(): string {
    const credentials = `${this.publicKey}:${this.secretKey}`;
    return `Basic ${btoa(credentials)}`;
  }

  async getPrompt(promptName: string): Promise<LangfusePrompt> {
    const url = `${this.host}/api/public/v2/prompts/${promptName}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: this.getAuthHeader(),
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        console.warn(`Failed to fetch prompt ${promptName}, using fallback`);
        return this.getFallbackPrompt(promptName);
      }

      const data = await response.json();
      return data as LangfusePrompt;
    } catch (error) {
      console.warn(
        `Error fetching prompt ${promptName}, using fallback:`,
        error
      );
      return this.getFallbackPrompt(promptName);
    }
  }

  private getFallbackPrompt(promptName: string): LangfusePrompt {
    const fallbackPrompts: Record<string, string> = {
      "guest-service": `Jesteś Zosia, wirtualnym asystentem Hotelu Smile. Odpowiadasz w języku polskim na pytania gości dotyczące hotelu, jego usług i atrakcji w okolicy.

Główne informacje o hotelu:
- Hotel Smile to nowoczesny hotel z basenem, SPA i restauracją
- Śniadania serwowane codziennie 7:00-10:30
- Hasło WiFi: SmileGuest2024
- Basen czynny: 8:00-22:00
- SPA oferuje masaże relaksacyjne, aromaterapię i zabiegi odnowy biologicznej

Bądź pomocna, przyjazna i profesjonalna. Jeśli nie masz informacji, skieruj gościa do recepcji.`,

      buttons: `Na podstawie rozmowy z gościem, wygeneruj maksymalnie 4 przydatne przyciski szybkich akcji w formacie JSON.

Przykładowe przyciski:
- Hasło WiFi (payload: "1")
- Godziny śniadań (payload: "2") 
- Oferta SPA (payload: "3")
- Informacje o basenie (payload: "pool")
- Atrakcje w okolicy (payload: "attractions")
- Kontakt z recepcją (payload: "contact")

Zwróć odpowiedź w formacie:
{"result": [{"title": "Nazwa przycisku", "payload": "wartość"}]}`,

      "knowledge-base-tool": `To narzędzie pozwala przeszukiwać bazę wiedzy hotelu w Google Sheets. Użyj go, gdy gość pyta o szczegółowe informacje dotyczące usług hotelowych, cennika, godzin otwarcia czy atrakcji lokalnych.`,
    };

    return {
      prompt:
        fallbackPrompts[promptName] || `Fallback prompt for ${promptName}`,
      config: {},
    };
  }

  async getAllPrompts(): Promise<{
    guestService: LangfusePrompt;
    buttons: LangfusePrompt;
    knowledgeBaseTool: LangfusePrompt;
  }> {
    try {
      const [guestService, buttons, knowledgeBaseTool] = await Promise.all([
        this.getPrompt("guest-service"),
        this.getPrompt("buttons"),
        this.getPrompt("knowledge-base-tool"),
      ]);

      return {
        guestService,
        buttons,
        knowledgeBaseTool,
      };
    } catch (error) {
      console.error("Error fetching all prompts:", error);
      // Return all fallback prompts
      return {
        guestService: this.getFallbackPrompt("guest-service"),
        buttons: this.getFallbackPrompt("buttons"),
        knowledgeBaseTool: this.getFallbackPrompt("knowledge-base-tool"),
      };
    }
  }
}
