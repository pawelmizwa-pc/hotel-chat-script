import { Tool } from "@langchain/core/tools";
import { Env, ServiceRequest } from "../types";

export class GmailServiceRequestTool extends Tool {
  name = "send_service_request";
  description: string;
  private env: Env;

  constructor(env: Env, toolDescription: string) {
    super();
    this.env = env;
    this.description = toolDescription;
  }

  async _call(input: string): Promise<string> {
    try {
      // Parse the input as JSON to extract service request details
      const serviceRequest: ServiceRequest = JSON.parse(input);

      // Validate required fields
      if (
        !serviceRequest.Requested_Service ||
        !serviceRequest.Guest_Information ||
        !serviceRequest.Preferred_Time
      ) {
        return "Błąd: Wymagane są wszystkie pola - Usługa, Informacje o gościu i Preferowany czas.";
      }

      // Get Gmail access token
      const accessToken = await this.getGmailAccessToken();

      // Compose email
      const emailContent = this.composeEmail(serviceRequest);

      // Send email via Gmail API
      const result = await this.sendEmail(accessToken, emailContent);

      if (result.success) {
        return `Zamówienie zostało wysłane do recepcji hotelu. Numer referencyjny: ${result.messageId}. Recepcja skontaktuje się z Państwem w przypadku jakichkolwiek problemów z realizacją usługi lub harmonogramem.`;
      } else {
        return "Przepraszam, wystąpił błąd podczas wysyłania zamówienia. Proszę skontaktować się bezpośrednio z recepcją hotelu.";
      }
    } catch (error) {
      console.error("Error sending service request:", error);
      return "Przepraszam, wystąpił błąd podczas przetwarzania zamówienia. Proszę skontaktować się z recepcją hotelu.";
    }
  }

  private async getGmailAccessToken(): Promise<string> {
    // Use OAuth2 refresh token to get access token
    const tokenUrl = "https://oauth2.googleapis.com/token";

    const params = new URLSearchParams({
      client_id: this.env.GMAIL_CLIENT_ID,
      client_secret: this.env.GMAIL_CLIENT_SECRET,
      refresh_token: this.env.GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    });

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = (await response.json()) as any;

    if (!response.ok) {
      throw new Error(
        `Failed to get Gmail access token: ${JSON.stringify(data)}`
      );
    }

    return data.access_token;
  }

  private composeEmail(serviceRequest: ServiceRequest): string {
    const subject = "Request Oferty Specjalnej";
    const body = `
      <h3>Nowe zamówienie usługi hotelowej</h3>
      <p><strong>Usługa:</strong> ${serviceRequest.Requested_Service}</p>
      <p><strong>Zamawiający:</strong> ${serviceRequest.Guest_Information}</p>
      <p><strong>Preferowany czas:</strong> ${serviceRequest.Preferred_Time}</p>
      ${
        serviceRequest.Comments
          ? `<p><strong>Komentarz:</strong> ${serviceRequest.Comments}</p>`
          : ""
      }
      <hr>
      <p><em>Wiadomość wysłana automatycznie przez system rezerwacji Hotel Smile</em></p>
    `;

    // Create RFC 2822 format email
    const email = [
      `To: ${this.env.SERVICE_EMAIL_TO}`,
      `Subject: ${subject}`,
      "Content-Type: text/html; charset=utf-8",
      "",
      body,
    ].join("\r\n");

    // Base64 encode for Gmail API
    return btoa(email)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  private async sendEmail(
    accessToken: string,
    encodedEmail: string
  ): Promise<{ success: boolean; messageId?: string }> {
    const gmailUrl =
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

    const response = await fetch(gmailUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: encodedEmail,
      }),
    });

    const data = (await response.json()) as any;

    if (response.ok) {
      return {
        success: true,
        messageId: data.id,
      };
    } else {
      console.error("Gmail API error:", data);
      return {
        success: false,
      };
    }
  }
}
