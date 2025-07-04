import { Env } from "../types";

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export class EmailService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  async sendEmail(options: EmailOptions): Promise<string> {
    if (this.env.RESEND_API_KEY) {
      return this.sendWithResend(options);
    } else {
      return this.sendWithWebhook(options);
    }
  }

  private async sendWithResend(options: EmailOptions): Promise<string> {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from:
            this.env.RESEND_FROM_EMAIL ||
            `"Hotel Guest Service" <noreply@yourhotel.com>`,
          to: [options.to],
          subject: options.subject,
          text: options.text,
          html: options.html,
        }),
      });

      if (response.ok) {
        const result = (await response.json()) as { id: string };
        return `Email sent successfully via Resend: ${result.id}`;
      } else {
        const error = await response.text();
        console.error("Resend API error:", error);
        throw new Error(`Resend error: ${error}`);
      }
    } catch (error) {
      console.error("Error sending email via Resend:", error);
      throw error;
    }
  }

  private async sendWithWebhook(options: EmailOptions): Promise<string> {
    try {
      // For development/testing - log the email details
      const emailData = {
        from: `"${this.env.GMAIL_FROM_NAME || "Hotel Guest Service"}" <${
          this.env.GMAIL_USER
        }>`,
        to: options.to,
        subject: options.subject,
        text: options.text || "",
        html: options.html || "",
        timestamp: new Date().toISOString(),
        service: "gmail-webhook-pending",
      };

      console.log("Email data (implement webhook/service):", emailData);

      // You can integrate with any HTTP-based email service here
      // For example: Mailgun, SendGrid, Postmark, etc.

      return `Email logged for webhook processing - ${emailData.timestamp}`;
    } catch (error) {
      console.error("Error with webhook email:", error);
      throw error;
    }
  }
}
