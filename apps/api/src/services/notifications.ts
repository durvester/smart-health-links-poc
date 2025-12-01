/**
 * Notifications Service (Stubbed)
 *
 * Will eventually integrate with:
 * - Twilio for SMS notifications
 * - AWS SES for email notifications
 *
 * For now, logs to console.
 */

import { config } from '../config.js';

// ============================================
// Types
// ============================================

export interface ShlDeliveryNotification {
  type: 'delivery';
  patientName: string;
  phone: string | null;
  email: string | null;
  viewerUrl: string;
  expiresAt: Date;
  documentCount: number;
}

export interface ShlAccessNotification {
  type: 'access';
  patientName: string;
  phone: string | null;
  email: string | null;
  recipient: string;
  location: string | null;
  accessTime: Date;
}

export type NotificationType = ShlDeliveryNotification | ShlAccessNotification;

export interface DeliveryResult {
  sms: 'sent' | 'failed' | 'skipped';
  email: 'sent' | 'failed' | 'skipped';
}

// ============================================
// Notification Service
// ============================================

/**
 * Check if SMS notifications are configured
 */
function isSmsConfigured(): boolean {
  return !!(
    config.TWILIO_ACCOUNT_SID &&
    config.TWILIO_AUTH_TOKEN &&
    config.TWILIO_PHONE_NUMBER
  );
}

/**
 * Check if email notifications are configured
 */
function isEmailConfigured(): boolean {
  return !!config.SES_FROM_EMAIL;
}

/**
 * Send SMS notification via Twilio
 * Currently stubbed - logs to console
 */
async function sendSms(to: string, message: string): Promise<boolean> {
  if (!isSmsConfigured()) {
    console.log(`[SMS STUB] Would send to ${to}:`);
    console.log(`  ${message}`);
    return true;
  }

  // TODO: Implement Twilio integration
  // const client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
  // await client.messages.create({
  //   body: message,
  //   from: config.TWILIO_PHONE_NUMBER,
  //   to,
  // });

  console.log(`[SMS STUB] Would send to ${to}:`);
  console.log(`  ${message}`);
  return true;
}

/**
 * Send email notification via AWS SES
 * Currently stubbed - logs to console
 */
async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<boolean> {
  if (!isEmailConfigured()) {
    console.log(`[EMAIL STUB] Would send to ${to}:`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body: ${body}`);
    return true;
  }

  // TODO: Implement AWS SES integration
  // const ses = new SESClient({ region: config.AWS_REGION });
  // await ses.send(new SendEmailCommand({ ... }));

  console.log(`[EMAIL STUB] Would send to ${to}:`);
  console.log(`  Subject: ${subject}`);
  console.log(`  Body: ${body}`);
  return true;
}

/**
 * Format expiration date for notifications
 */
function formatExpiration(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ============================================
// Public API
// ============================================

/**
 * Send SHL delivery notification (link was created and sent)
 */
export async function sendDeliveryNotification(
  notification: ShlDeliveryNotification
): Promise<DeliveryResult> {
  const { patientName, phone, email, viewerUrl, expiresAt, documentCount } = notification;

  const result: DeliveryResult = {
    sms: 'skipped',
    email: 'skipped',
  };

  // SMS notification
  if (phone) {
    const message = `Your healthcare provider has shared ${documentCount} document(s) with you. View them securely at: ${viewerUrl} (expires ${formatExpiration(expiresAt)})`;

    try {
      await sendSms(phone, message);
      result.sms = 'sent';
    } catch (error) {
      console.error('Failed to send SMS:', error);
      result.sms = 'failed';
    }
  }

  // Email notification
  if (email) {
    const subject = `Your healthcare documents from ${patientName}`;
    const body = `
Hello,

Your healthcare provider has shared ${documentCount} document(s) with you.

Click the link below to view your documents securely:
${viewerUrl}

This link will expire on ${formatExpiration(expiresAt)}.

For your security, you may be asked to provide your name before viewing the documents.

If you did not expect to receive this message, please contact your healthcare provider.
    `.trim();

    try {
      await sendEmail(email, subject, body);
      result.email = 'sent';
    } catch (error) {
      console.error('Failed to send email:', error);
      result.email = 'failed';
    }
  }

  return result;
}

/**
 * Send SHL access notification (someone viewed the link)
 */
export async function sendAccessNotification(
  notification: ShlAccessNotification
): Promise<void> {
  const { phone, email, recipient, location, accessTime } = notification;

  const locationStr = location || 'Unknown location';
  const timeStr = accessTime.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  // SMS notification
  if (phone) {
    const message = `Your health documents were viewed by "${recipient}" from ${locationStr} at ${timeStr}. If this wasn't you or someone you authorized, contact your healthcare provider.`;

    try {
      await sendSms(phone, message);
    } catch (error) {
      console.error('Failed to send access SMS:', error);
    }
  }

  // Email notification
  if (email) {
    const subject = `Your health documents were accessed`;
    const body = `
Hello,

Your health documents were accessed:

- Viewed by: ${recipient}
- Location: ${locationStr}
- Time: ${timeStr}

If this was you or someone you authorized, no action is needed.

If you did not authorize this access, please contact your healthcare provider immediately.
    `.trim();

    try {
      await sendEmail(email, subject, body);
    } catch (error) {
      console.error('Failed to send access email:', error);
    }
  }
}
