import { Tool } from "@langchain/core/tools";
import { GoogleSpreadsheet } from "google-spreadsheet";
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

  async _call(query: string): Promise<string> {
    try {
      // Initialize the Google Spreadsheet with API Key authentication
      const doc = new GoogleSpreadsheet(this.documentId, {
        apiKey: this.env.GOOGLE_SHEETS_API_KEY,
      });

      // Load document info
      await doc.loadInfo();

      // Get the first worksheet (or you can get by title: doc.sheetsByTitle['Sheet1'])
      const sheet = doc.sheetsByIndex[0];

      if (!sheet) {
        return `Nie znaleziono arkusza w dokumencie Google Sheets.`;
      }

      // Get all rows from the sheet
      const rows = await sheet.getRows();

      if (rows.length === 0) {
        return `Arkusz Google Sheets jest pusty.`;
      }

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

  private searchInRows(rows: any[], query: string): string[] {
    const queryLower = query.toLowerCase();
    const results: string[] = [];

    for (const row of rows) {
      // Get all values from the row
      const rowValues = Object.values(row.toObject());
      const rowText = rowValues.join(" ").toLowerCase();

      if (rowText.includes(queryLower)) {
        results.push(rowValues.join(" - "));
      }
    }

    // If no direct matches, try partial matches
    if (results.length === 0) {
      const queryWords = queryLower.split(" ");
      for (const row of rows) {
        const rowValues = Object.values(row.toObject());
        const rowText = rowValues.join(" ").toLowerCase();
        const matchCount = queryWords.filter((word) =>
          rowText.includes(word)
        ).length;

        if (matchCount > 0) {
          results.push(rowValues.join(" - "));
        }
      }
    }

    return results.slice(0, 5); // Limit to top 5 results
  }
}
