import { GoogleSpreadsheet } from "google-spreadsheet";
// @ts-ignore
import json2md from "json2md";
import { Env } from "../types";

export class GoogleSheets {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Create a JWT token for Google service account authentication using Web Crypto API
   * This is compatible with Cloudflare Workers environment
   */
  private async createJWT(): Promise<string> {
    const header = {
      alg: "RS256",
      typ: "JWT",
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: this.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600, // 1 hour
      iat: now,
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;

    // Import the private key
    const privateKeyPem = this.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(
      /\\n/g,
      "\n"
    );
    const privateKey = await this.importPrivateKey(privateKeyPem);

    // Sign the token
    const encoder = new TextEncoder();
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      privateKey,
      encoder.encode(unsignedToken)
    );

    const encodedSignature = this.base64UrlEncode(signature);
    return `${unsignedToken}.${encodedSignature}`;
  }

  /**
   * Import private key for signing
   */
  private async importPrivateKey(privateKeyPem: string): Promise<CryptoKey> {
    // Remove PEM header/footer and whitespace
    const privateKeyData = privateKeyPem
      .replace(/-----BEGIN PRIVATE KEY-----/, "")
      .replace(/-----END PRIVATE KEY-----/, "")
      .replace(/\s+/g, "");

    // Convert base64 to ArrayBuffer
    const binaryData = Uint8Array.from(atob(privateKeyData), (c) =>
      c.charCodeAt(0)
    );

    return await crypto.subtle.importKey(
      "pkcs8",
      binaryData,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );
  }

  /**
   * Base64 URL encode
   */
  private base64UrlEncode(data: string | ArrayBuffer): string {
    let base64: string;

    if (typeof data === "string") {
      base64 = btoa(data);
    } else {
      const bytes = new Uint8Array(data);
      const binary = Array.from(bytes, (byte) =>
        String.fromCharCode(byte)
      ).join("");
      base64 = btoa(binary);
    }

    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  /**
   * Get access token using service account JWT
   */
  private async getAccessToken(): Promise<string> {
    const jwt = await this.createJWT();

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to get access token: ${response.status} ${errorText}`
      );
    }

    const data = (await response.json()) as { access_token: string };
    return data.access_token;
  }

  /**
   * Create GoogleSpreadsheet instance with service account authentication
   */
  private async createAuthenticatedDoc(
    documentId: string
  ): Promise<GoogleSpreadsheet> {
    const accessToken = await this.getAccessToken();

    return new GoogleSpreadsheet(documentId, {
      token: accessToken,
    });
  }

  /**
   * Collect markdown from every sheet in the spreadsheet
   * @param spreadSheetId - The ID of the Google Sheets document (optional, falls back to environment variable)
   * @returns Promise<string> - All sheets formatted as markdown
   */
  async collectAllSheetsAsMarkdown(spreadSheetId?: string): Promise<string> {
    try {
      const documentId = spreadSheetId || this.env.GOOGLE_SHEETS_DOCUMENT_ID;
      const doc = await this.createAuthenticatedDoc(documentId);

      await doc.loadInfo();

      const markdownParts: any[] = [
        { h1: doc.title },
        {
          blockquote: `Wszystkie dane z arkusza Google Sheets - ${doc.sheetCount} arkuszy`,
        },
        { hr: "" },
      ];

      // Process all sheets in parallel for much faster performance
      const sheetPromises = [];
      for (let i = 0; i < doc.sheetCount; i++) {
        const sheet = doc.sheetsByIndex[i];
        if (!sheet) continue;

        sheetPromises.push(this.processSheet(sheet, i));
      }

      // Wait for all sheets to be processed
      const sheetResults = await Promise.allSettled(sheetPromises);

      // Add results in original order
      sheetResults.forEach((result) => {
        if (result.status === "fulfilled") {
          markdownParts.push(...result.value);
        } else {
          console.error("Sheet processing failed:", result.reason);
          markdownParts.push(
            { h2: "Błąd arkusza" },
            {
              blockquote: `Błąd podczas przetwarzania: ${
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason)
              }`,
            }
          );
        }
      });

      return json2md(markdownParts);
    } catch (error) {
      console.error("Error collecting all sheets as markdown:", error);
      return json2md([
        { h1: "Error" },
        { p: "Spreadsheet ID: " + spreadSheetId },
        {
          blockquote: `Przepraszam, wystąpił błąd podczas odczytywania arkuszy: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ]);
    }
  }

  /**
   * Collect markdown from a specific sheet by name
   * @param spreadSheetId - The ID of the Google Sheets document (optional, falls back to environment variable)
   * @param sheetName - The name of the sheet to collect
   * @returns Promise<string> - Sheet formatted as markdown
   */
  async collectSheetAsMarkdown(
    spreadSheetId?: string,
    sheetName?: string
  ): Promise<string> {
    try {
      const documentId = spreadSheetId || this.env.GOOGLE_SHEETS_DOCUMENT_ID;
      const doc = await this.createAuthenticatedDoc(documentId);

      await doc.loadInfo();

      // Find the sheet by name
      const sheet = sheetName
        ? doc.sheetsByTitle[sheetName]
        : doc.sheetsByIndex[0]; // Default to first sheet if no name provided

      if (!sheet) {
        throw new Error(`Sheet "${sheetName}" not found in spreadsheet`);
      }

      // Process the specific sheet
      const sheetMarkdownParts = await this.processSheet(sheet, 0);

      return json2md(sheetMarkdownParts);
    } catch (error) {
      console.error(
        `Error collecting sheet "${sheetName}" as markdown:`,
        error
      );
      return json2md([
        { h2: "Error" },
        { p: `Sheet: ${sheetName}` },
        {
          blockquote: `Przepraszam, wystąpił błąd podczas odczytywania arkusza: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ]);
    }
  }

  /**
   * Process a single sheet in parallel
   * @param sheet The sheet to process
   * @param index Sheet index for error reporting
   * @returns Promise<any[]> Markdown parts for this sheet
   */
  private async processSheet(sheet: any, index: number): Promise<any[]> {
    try {
      // Load header and rows in parallel
      const [, rows] = await Promise.all([
        sheet.loadHeaderRow(),
        sheet.getRows(),
      ]);

      const headers = sheet.headerValues;

      if (!headers || headers.length === 0) {
        return [
          { h2: sheet.title },
          { p: "Arkusz nie zawiera nagłówków." },
          { hr: "" },
        ];
      }

      if (rows.length === 0) {
        return [
          { h2: sheet.title },
          { p: "Arkusz nie zawiera danych." },
          { hr: "" },
        ];
      }

      // Prepare table data
      const tableRows = rows.map((row: any) => {
        return headers.map((header: string) => {
          const cellValue = row.get(header) || "";
          return (
            String(cellValue)
              .replace(/\n/g, " ")
              .replace(/\r/g, "")
              .replace(/\|/g, "\\|")
              .trim() || "-"
          );
        });
      });

      return [
        { h2: sheet.title },
        {
          table: {
            headers: headers,
            rows: tableRows,
          },
        },
        { hr: "" },
      ];
    } catch (sheetError) {
      console.error(`Error processing sheet ${index}:`, sheetError);
      return [
        { h2: `Arkusz ${index + 1}` },
        {
          blockquote: `Błąd podczas przetwarzania: ${
            sheetError instanceof Error
              ? sheetError.message
              : String(sheetError)
          }`,
        },
        { hr: "" },
      ];
    }
  }
}
