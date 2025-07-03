import { google } from "googleapis";
import { Env } from "../types";

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  cc?: string;
  bcc?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    encoding?: string;
  }>;
}

export class GmailService {
  private env: Env;
  private gmail: any;

  constructor(env: Env) {
    this.env = env;
    this.initializeGmailClient();
  }

  private initializeGmailClient() {
    const oauth2Client = new google.auth.OAuth2(
      this.env.GMAIL_CLIENT_ID,
      this.env.GMAIL_CLIENT_SECRET,
      "https://developers.google.com/oauthplayground"
    );

    oauth2Client.setCredentials({
      refresh_token: this.env.GMAIL_REFRESH_TOKEN,
      access_token: this.env.GMAIL_ACCESS_TOKEN,
    });

    this.gmail = google.gmail({ version: "v1", auth: oauth2Client });
  }

  /**
   * Send an email using Gmail API
   * @param options - Email options including to, subject, text/html content
   * @returns Promise<string> - Success message or error details
   */
  async sendEmail(options: EmailOptions): Promise<string> {
    try {
      const { to, subject, text, html, cc, bcc, attachments } = options;

      // Create email message
      const email = this.createEmailMessage({
        to,
        subject,
        text,
        html,
        cc,
        bcc,
        attachments,
      });

      // Send email
      const response = await this.gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: email,
        },
      });

      return `Email sent successfully! Message ID: ${response.data.id}`;
    } catch (error) {
      console.error("Error sending email:", error);
      return `Failed to send email: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }


  /**
   * Create a base64 encoded email message
   * @param options - Email options
   * @returns string - Base64 encoded email message
   */
  private createEmailMessage(options: EmailOptions): string {
    const { to, subject, text, html, cc, bcc, attachments } = options;

    const boundary = `----${Math.random().toString(36).substr(2, 9)}`;
    let email = "";

    // Headers
    email += `To: ${to}\r\n`;
    if (cc) email += `Cc: ${cc}\r\n`;
    if (bcc) email += `Bcc: ${bcc}\r\n`;
    email += `Subject: ${subject}\r\n`;
    email += `MIME-Version: 1.0\r\n`;

    if (attachments && attachments.length > 0) {
      email += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
    } else if (html) {
      email += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;
    } else {
      email += `Content-Type: text/plain; charset="UTF-8"\r\n\r\n`;
      email += text || "";
      return Buffer.from(email)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    }

    // Text part
    if (text) {
      email += `--${boundary}\r\n`;
      email += `Content-Type: text/plain; charset="UTF-8"\r\n\r\n`;
      email += `${text}\r\n`;
    }

    // HTML part
    if (html) {
      email += `--${boundary}\r\n`;
      email += `Content-Type: text/html; charset="UTF-8"\r\n\r\n`;
      email += `${html}\r\n`;
    }

    // Attachments
    if (attachments) {
      attachments.forEach((attachment) => {
        email += `--${boundary}\r\n`;
        email += `Content-Type: application/octet-stream\r\n`;
        email += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n`;
        email += `Content-Transfer-Encoding: ${
          attachment.encoding || "base64"
        }\r\n\r\n`;
        email += `${attachment.content}\r\n`;
      });
    }

    email += `--${boundary}--`;

    return Buffer.from(email)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  /**
   * Refresh access token using refresh token
   * @returns Promise<boolean> - Success status
   */
  async refreshAccessToken(): Promise<boolean> {
    try {
      const oauth2Client = new google.auth.OAuth2(
        this.env.GMAIL_CLIENT_ID,
        this.env.GMAIL_CLIENT_SECRET,
        "https://developers.google.com/oauthplayground"
      );

      oauth2Client.setCredentials({
        refresh_token: this.env.GMAIL_REFRESH_TOKEN,
      });

      const { credentials } = await oauth2Client.refreshAccessToken();

      // In a real application, you would want to update the stored access token
      // For now, we'll just update the local client
      oauth2Client.setCredentials(credentials);
      this.gmail = google.gmail({ version: "v1", auth: oauth2Client });

      return true;
    } catch (error) {
      console.error("Error refreshing access token:", error);
      return false;
    }
  }
}
