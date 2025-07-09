import { GoogleSpreadsheet } from "google-spreadsheet";
import json2md from "json2md";
import { Env } from "../types";

export class GoogleSheets {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Collect markdown from every sheet in the spreadsheet
   * @param spreadSheetId - The ID of the Google Sheets document (optional, falls back to environment variable)
   * @returns Promise<string> - All sheets formatted as markdown
   */
  async collectAllSheetsAsMarkdown(spreadSheetId?: string): Promise<string> {
    try {
      const documentId = spreadSheetId || this.env.GOOGLE_SHEETS_DOCUMENT_ID;
      const doc = new GoogleSpreadsheet(documentId, {
        apiKey: this.env.GOOGLE_SHEETS_API_KEY,
      });

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
