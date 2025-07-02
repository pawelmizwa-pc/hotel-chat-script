import { Tool } from "@langchain/core/tools";
import { Env } from "../types";

export class GoogleSheetsKnowledgeBaseTool extends Tool {
  name = "knowledge_base_search";
  description: string;
  private env: Env;
  private documentId: string;

  constructor(env: Env, toolDescription: string) {
    super();
    this.env = env;
    this.description = toolDescription;
    this.documentId = env.GOOGLE_SHEETS_DOCUMENT_ID;
  }

  private async getAccessToken(): Promise<string> {
    // Use service account authentication with proper JWT signing
    const header = { alg: "RS256", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);

    const payload = {
      iss: this.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    };

    const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, "");
    const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, "");

    // Import private key and sign JWT
    const privateKey = this.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, "\n");
    const keyData = await crypto.subtle.importKey(
      "pkcs8",
      this.pemToArrayBuffer(privateKey),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const textEncoder = new TextEncoder();
    const data = textEncoder.encode(`${encodedHeader}.${encodedPayload}`);
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      keyData,
      data
    );
    const encodedSignature = btoa(
      String.fromCharCode(...new Uint8Array(signature))
    ).replace(/=/g, "");

    const jwt = `${encodedHeader}.${encodedPayload}.${encodedSignature}`;

    // Exchange JWT for access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    const tokenData = (await tokenResponse.json()) as any;
    if (!tokenResponse.ok) {
      throw new Error(
        `Failed to get access token: ${JSON.stringify(tokenData)}`
      );
    }

    return tokenData.access_token;
  }

  private pemToArrayBuffer(pem: string): ArrayBuffer {
    const b64Lines = pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
    const b64 = b64Lines.replace(/\n/g, "");
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  async _call(query: string): Promise<string> {
    try {
      // Use Google Sheets API to search the knowledge base
      const accessToken = await this.getAccessToken();
      const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${this.documentId}/values/Sheet1`;

      const response = await fetch(sheetsUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Google Sheets API error: ${response.statusText}`);
      }

      const data = (await response.json()) as any;
      const rows = data.values || [];

      // Search through the sheet data for relevant information
      const searchResults = this.searchInRows(rows, query);

      if (searchResults.length === 0) {
        return `Nie znaleziono informacji na temat: ${query}`;
      }

      return searchResults.join("\n\n");
    } catch (error) {
      console.error("Error accessing Google Sheets:", error);
      return `Przepraszam, wystąpił błąd podczas wyszukiwania informacji. Skontaktuj się z recepcją hotelu.`;
    }
  }

  private searchInRows(rows: string[][], query: string): string[] {
    const queryLower = query.toLowerCase();
    const results: string[] = [];

    for (const row of rows) {
      const rowText = row.join(" ").toLowerCase();
      if (rowText.includes(queryLower)) {
        results.push(row.join(" - "));
      }
    }

    // If no direct matches, try partial matches
    if (results.length === 0) {
      const queryWords = queryLower.split(" ");
      for (const row of rows) {
        const rowText = row.join(" ").toLowerCase();
        const matchCount = queryWords.filter((word) =>
          rowText.includes(word)
        ).length;

        if (matchCount > 0) {
          results.push(row.join(" - "));
        }
      }
    }

    return results.slice(0, 5); // Limit to top 5 results
  }
}
