import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface TrendTopicEmail {
  title: string;
  summary: string;
  category: string;
  relevanceScore: number;
  url?: string | null;
}

@Injectable()
export class BrevoService {
  private readonly logger = new Logger(BrevoService.name);
  private readonly apiKey: string;
  private readonly senderEmail: string;
  private readonly senderName: string;
  private readonly dailySummaryTemplateId: number;
  private readonly notificationTemplateId: number;
  private readonly frontendUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('BREVO_API_KEY', '');
    this.senderEmail = this.config.get<string>('BREVO_SENDER_EMAIL', 'noreply@creator-platform.com');
    this.senderName = this.config.get<string>('BREVO_SENDER_NAME', '創作者平台');
    this.dailySummaryTemplateId = this.config.get<number>('BREVO_TEMPLATE_DAILY_SUMMARY', 1);
    this.notificationTemplateId = this.config.get<number>('BREVO_TEMPLATE_NOTIFICATION', 2);
    this.frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3001');
  }

  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  async sendTrendDailySummary(
    email: string,
    displayName: string,
    topics: TrendTopicEmail[],
    aiAnalysis: string,
  ): Promise<void> {
    if (!this.isConfigured) {
      this.logger.warn('Brevo API key not configured, skipping email');
      return;
    }

    await this.sendTransactionalEmail({
      to: [{ email, name: displayName }],
      templateId: this.dailySummaryTemplateId,
      params: {
        displayName,
        date: new Date().toLocaleDateString('zh-TW'),
        aiAnalysis,
        topics: topics.map(t => ({
          title: t.title,
          summary: t.summary,
          category: t.category,
          score: Math.round(t.relevanceScore * 100),
          url: t.url || '',
        })),
        dashboardUrl: `${this.frontendUrl}/trends`,
      },
    });
  }

  async sendNotificationEmail(
    email: string,
    title: string,
    body: string,
  ): Promise<void> {
    if (!this.isConfigured) {
      this.logger.warn('Brevo API key not configured, skipping email');
      return;
    }

    await this.sendTransactionalEmail({
      to: [{ email, name: '' }],
      templateId: this.notificationTemplateId,
      params: {
        title,
        body,
        dashboardUrl: `${this.frontendUrl}/trends`,
      },
    });
  }

  /**
   * Send a campaign email with custom HTML content (no template).
   * Used by the email-marketing module to send campaigns.
   */
  async sendCampaignEmail(
    to: { email: string; name: string }[],
    subject: string,
    htmlContent: string,
    unsubscribeUrl?: string,
  ): Promise<{ success: boolean; messageId?: string }> {
    if (!this.isConfigured) {
      this.logger.warn('Brevo API key not configured, skipping campaign email');
      return { success: false };
    }

    // Append unsubscribe footer to HTML
    let finalHtml = htmlContent;
    if (unsubscribeUrl) {
      finalHtml += `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;font-size:12px;color:#9ca3af;">
<p>如果你不想再收到此類郵件，可以<a href="${unsubscribeUrl}" style="color:#6366f1;text-decoration:underline;">取消訂閱</a>。</p></div>`;
    }

    try {
      const payload: Record<string, unknown> = {
        sender: { email: this.senderEmail, name: this.senderName },
        to,
        subject,
        htmlContent: finalHtml,
      };

      // RFC 8058 List-Unsubscribe header
      if (unsubscribeUrl) {
        payload.headers = {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        };
      }

      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'api-key': this.apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Brevo campaign send error: ${response.status} ${error}`);
        return { success: false };
      }

      const result = await response.json();
      this.logger.log(`Campaign email sent to ${to.length} recipients`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      this.logger.error(`Failed to send campaign email: ${error}`);
      return { success: false };
    }
  }

  private async sendTransactionalEmail(payload: {
    to: { email: string; name: string }[];
    templateId: number;
    params: Record<string, any>;
  }): Promise<void> {
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'api-key': this.apiKey,
        },
        body: JSON.stringify({
          to: payload.to,
          templateId: payload.templateId,
          params: payload.params,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Brevo API error: ${response.status} ${error}`);
        return;
      }

      this.logger.log(`Email sent to ${payload.to.map(t => t.email).join(', ')}`);
    } catch (error) {
      this.logger.error(`Failed to send email: ${error}`);
    }
  }
}
