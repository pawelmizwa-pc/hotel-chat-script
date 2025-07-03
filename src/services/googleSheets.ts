import { GoogleSpreadsheet } from "google-spreadsheet";
import json2md from "json2md";
import { Env } from "../types";

export class GoogleSheets {
  private documentId: string;
  private env: Env;

  constructor(env: Env) {
    this.env = env;
    this.documentId = env.GOOGLE_SHEETS_DOCUMENT_ID;
  }

  /**
   * Read the entire spreadsheet and return it as markdown format using json2md
   * @param sheetIndex - Optional sheet index (default: 0)
   * @returns Promise<string> - The entire spreadsheet formatted as markdown table
   */
  async readEntireSpreadsheetAsMarkdown(
    sheetIndex: number = 0
  ): Promise<string> {
    try {
      // Initialize the Google Spreadsheet with API Key authentication
      const doc = new GoogleSpreadsheet(this.documentId, {
        apiKey: this.env.GOOGLE_SHEETS_API_KEY,
      });

      // Load document info
      await doc.loadInfo();

      // Get the specified worksheet
      const sheet = doc.sheetsByIndex[sheetIndex];

      if (!sheet) {
        return json2md([
          { h1: "Error" },
          {
            p: `Nie znaleziono arkusza o indeksie ${sheetIndex} w dokumencie Google Sheets.`,
          },
        ]);
      }

      // Load the header row
      await sheet.loadHeaderRow();
      const headers = sheet.headerValues;

      if (!headers || headers.length === 0) {
        return json2md([
          { h1: sheet.title },
          { p: "Arkusz nie zawiera nagłówków." },
        ]);
      }

      // Get all rows from the sheet
      const rows = await sheet.getRows();

      if (rows.length === 0) {
        return json2md([
          { h1: sheet.title },
          {
            table: {
              headers: headers,
              rows: [headers.map(() => "*Brak danych*")],
            },
          },
        ]);
      }

      // Prepare table data
      const tableRows = rows.map((row) => {
        return headers.map((header) => {
          const cellValue = row.get(header) || "";
          // Clean and format cell content
          return (
            String(cellValue)
              .replace(/\n/g, " ")
              .replace(/\r/g, "")
              .replace(/\|/g, "\\|")
              .trim() || "-"
          );
        });
      });

      // Create markdown using json2md
      const markdownContent = json2md([
        { h1: sheet.title },
        {
          blockquote: `Dane z arkusza Google Sheets - ${doc.title}`,
        },
        {
          table: {
            headers: headers,
            rows: tableRows,
          },
        },
        { hr: "" },
        { h2: "Podsumowanie" },
        {
          ul: [
            `**Liczba wierszy:** ${rows.length}`,
            `**Liczba kolumn:** ${headers.length}`,
            `**Nazwa arkusza:** ${sheet.title}`,
            `**Ostatnia aktualizacja:** ${new Date().toLocaleString("pl-PL")}`,
          ],
        },
      ]);

      return markdownContent;
    } catch (error) {
      console.error("Error reading entire spreadsheet:", error);
      return json2md([
        { h1: "Error" },
        {
          blockquote: `Przepraszam, wystąpił błąd podczas odczytywania arkusza: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ]);
    }
  }

  /**
   * Read multiple sheets and return them as markdown using json2md
   * @param sheetIndices - Array of sheet indices to read (default: [0])
   * @returns Promise<string> - All specified sheets formatted as markdown
   */
  async readMultipleSheetsAsMarkdown(
    sheetIndices: number[] = [0]
  ): Promise<string> {
    try {
      const doc = new GoogleSpreadsheet(this.documentId, {
        apiKey: this.env.GOOGLE_SHEETS_API_KEY,
      });

      await doc.loadInfo();

      // Start with document header
      const markdownParts: any[] = [
        { h1: doc.title },
        {
          blockquote:
            "Kompletne dane z arkusza Google Sheets zawierającego informacje o hotelu",
        },
        {
          p: `Dokument zawiera ${doc.sheetCount} arkuszy. Poniżej przedstawiono dane z wybranych arkuszy.`,
        },
        { hr: "" },
      ];

      // Process each sheet
      for (const sheetIndex of sheetIndices) {
        try {
          const sheet = doc.sheetsByIndex[sheetIndex];
          if (!sheet) {
            markdownParts.push(
              { h2: `Arkusz ${sheetIndex + 1}` },
              { p: `Nie znaleziono arkusza o indeksie ${sheetIndex}.` }
            );
            continue;
          }

          // Load sheet data
          await sheet.loadHeaderRow();
          const headers = sheet.headerValues;

          if (!headers || headers.length === 0) {
            markdownParts.push(
              { h2: sheet.title },
              { p: "Arkusz nie zawiera nagłówków." }
            );
            continue;
          }

          const rows = await sheet.getRows();

          if (rows.length === 0) {
            markdownParts.push(
              { h2: sheet.title },
              { p: "Arkusz nie zawiera danych." },
              {
                table: {
                  headers: headers,
                  rows: [headers.map(() => "*Pusty*")],
                },
              }
            );
            continue;
          }

          // Prepare table data
          const tableRows = rows.map((row) => {
            return headers.map((header) => {
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

          // Add sheet content
          markdownParts.push(
            { h2: sheet.title },
            {
              table: {
                headers: headers,
                rows: tableRows,
              },
            },
            {
              p: `*Arkusz zawiera ${rows.length} wierszy i ${headers.length} kolumn.*`,
            }
          );
        } catch (sheetError) {
          console.error(`Error reading sheet ${sheetIndex}:`, sheetError);
          markdownParts.push(
            { h2: `Arkusz ${sheetIndex + 1}` },
            {
              blockquote: `Błąd podczas odczytywania arkusza: ${
                sheetError instanceof Error
                  ? sheetError.message
                  : String(sheetError)
              }`,
            }
          );
        }
      }

      // Add final summary
      markdownParts.push(
        { hr: "" },
        { h2: "Informacje o dokumencie" },
        {
          ul: [
            `**Tytuł dokumentu:** ${doc.title}`,
            `**Liczba arkuszy:** ${doc.sheetCount}`,
            `**Przetworzono arkuszy:** ${sheetIndices.length}`,
            `**Data generowania:** ${new Date().toLocaleString("pl-PL")}`,
          ],
        }
      );

      return json2md(markdownParts);
    } catch (error) {
      console.error("Error reading multiple sheets:", error);
      return json2md([
        { h1: "Error" },
        {
          blockquote: `Przepraszam, wystąpił błąd podczas odczytywania arkuszy: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ]);
    }
  }

  /**
   * Generate a comprehensive hotel knowledge base report in markdown
   * @returns Promise<string> - A detailed markdown report of all hotel data
   */
  async generateHotelKnowledgeBaseReport(): Promise<string> {
    try {
      const doc = new GoogleSpreadsheet(this.documentId, {
        apiKey: this.env.GOOGLE_SHEETS_API_KEY,
      });

      await doc.loadInfo();

      // Create comprehensive report
      const reportParts: any[] = [
        { h1: "🏨 Hotel Smile - Baza Wiedzy" },
        {
          blockquote:
            "Kompletny raport zawierający wszystkie informacje o usługach, cenach i ofercie hotelu",
        },
        {
          p: "Ten dokument zawiera wszystkie dane z systemu zarządzania wiedzą hotelu, wygenerowane automatycznie z arkuszy Google Sheets.",
        },
        { hr: "" },
        { h2: "📊 Przegląd dokumentu" },
        {
          ul: [
            `**Nazwa dokumentu:** ${doc.title}`,
            `**Liczba arkuszy:** ${doc.sheetCount}`,
            `**Data generowania:** ${new Date().toLocaleString("pl-PL")}`,
            `**Status:** Aktualny`,
          ],
        },
        { hr: "" },
      ];

      // Process each sheet with detailed information
      for (let i = 0; i < doc.sheetCount; i++) {
        try {
          const sheet = doc.sheetsByIndex[i];
          if (!sheet) continue;

          await sheet.loadHeaderRow();
          const headers = sheet.headerValues;
          const rows = await sheet.getRows();

          reportParts.push({ h2: `${i + 1}. ${sheet.title}` });

          if (!headers || headers.length === 0) {
            reportParts.push({ p: "*Arkusz nie zawiera nagłówków.*" });
            continue;
          }

          if (rows.length === 0) {
            reportParts.push({ p: "*Arkusz nie zawiera danych.*" });
            continue;
          }

          // Add sheet statistics
          reportParts.push({
            ul: [
              `**Kolumny:** ${headers.join(", ")}`,
              `**Liczba rekordów:** ${rows.length}`,
              `**Typ arkusza:** ${sheet.title}`,
            ],
          });

          // Prepare and add table data
          const tableRows = rows.map((row) => {
            return headers.map((header) => {
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

          reportParts.push({
            table: {
              headers: headers,
              rows: tableRows,
            },
          });
        } catch (sheetError) {
          console.error(`Error processing sheet ${i}:`, sheetError);
          reportParts.push(
            { h2: `${i + 1}. Arkusz ${i + 1}` },
            {
              blockquote: `Błąd podczas przetwarzania: ${
                sheetError instanceof Error
                  ? sheetError.message
                  : String(sheetError)
              }`,
            }
          );
        }
      }

      // Add footer
      reportParts.push(
        { hr: "" },
        { h2: "ℹ️ Informacje dodatkowe" },
        {
          p: "Ten raport został wygenerowany automatycznie przez system zarządzania wiedzą Hotel Smile. Wszystkie dane są aktualne na moment generowania raportu.",
        },
        {
          ul: [
            "Dane są synchronizowane z arkuszami Google Sheets",
            "Raport zawiera wszystkie dostępne informacje o usługach hotelu",
            "W przypadku pytań skontaktuj się z recepcją hotelu",
          ],
        }
      );

      return json2md(reportParts);
    } catch (error) {
      console.error("Error generating hotel knowledge base report:", error);
      return json2md([
        { h1: "🏨 Hotel Smile - Baza Wiedzy" },
        { h2: "Error" },
        {
          blockquote: `Przepraszam, wystąpił błąd podczas generowania raportu: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ]);
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
