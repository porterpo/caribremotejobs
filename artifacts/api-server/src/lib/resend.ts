import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger";

const SMTP_HOST =
  process.env.TITAN_SMTP_HOST ??
  process.env.BLUEHOST_SMTP_HOST ??
  "smtp.titan.email";
const SMTP_PORT = Number(process.env.TITAN_SMTP_PORT ?? process.env.BLUEHOST_SMTP_PORT ?? 465);
const SMTP_USER =
  process.env.TITAN_SMTP_USER ??
  process.env.BLUEHOST_SMTP_USER ??
  "hello@caribremotejobs.com";
const SMTP_PASS = process.env.TITAN_SMTP_PASSWORD ?? process.env.BLUEHOST_SMTP_PASSWORD;
const FROM_EMAIL =
  process.env.MAIL_FROM ?? `CaribRemotejobs <${SMTP_USER}>`;

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  if (!SMTP_PASS) {
    throw new Error("SMTP password is not configured");
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

type SendArgs = {
  from?: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

type SendResult = { data: { id: string } | null; error: Error | null };

const mailClient = {
  emails: {
    async send(args: SendArgs): Promise<SendResult> {
      try {
        const info = await getTransporter().sendMail({
          from: args.from ?? FROM_EMAIL,
          to: args.to,
          subject: args.subject,
          html: args.html,
          text: args.text,
        });
        return { data: { id: info.messageId }, error: null };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        return { data: null, error };
      }
    },
  },
};

export async function getResendClient(): Promise<{
  client: typeof mailClient;
  fromEmail: string;
}> {
  return { client: mailClient, fromEmail: FROM_EMAIL };
}

export async function sendTestEmail(to: string): Promise<SendResult> {
  return mailClient.emails.send({
    to,
    subject: "CaribRemotejobs.com — Test email",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #0d9488;">It works!</h1>
        <p>This is a test email from <strong>CaribRemotejobs.com</strong> sent through your mailbox.</p>
        <p style="font-size: 12px; color: #6b7280;">If you received this, your outgoing email is configured correctly.</p>
      </div>
    `,
  });
}

export async function sendAlertConfirmation(
  email: string,
  unsubscribeToken: string
): Promise<void> {
  try {
    const { client, fromEmail } = await getResendClient();
    await client.emails.send({
      from: fromEmail,
      to: email,
      subject: "You're subscribed to CaribRemotejobs.com job alerts",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #0d9488;">Welcome to CaribRemotejobs.com alerts!</h1>
          <p>You've successfully subscribed to job alerts. We'll notify you when new remote jobs matching your interests are posted.</p>
          <p>If you'd like to unsubscribe at any time, <a href="${process.env.APP_URL ?? "https://caribremotejobs.com"}/unsubscribe/${unsubscribeToken}">click here</a>.</p>
          <hr style="border: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #6b7280;">CaribRemotejobs.com — Remote jobs for Caribbean professionals</p>
        </div>
      `,
    });
  } catch (err) {
    logger.error({ err }, "Failed to send alert confirmation email");
  }
}

export async function sendOrderConfirmation(params: {
  email: string;
  orderId: number;
  productType: string;
  jobsRemaining: number;
}): Promise<void> {
  const { client, fromEmail } = await getResendClient();
  const appUrl = process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
    : (process.env.APP_URL ?? "https://caribremotejobs.com");
  const postJobUrl = `${appUrl}/post-job?orderId=${params.orderId}`;

  const productLabels: Record<string, string> = {
    single: "Single Job Posting",
    pack: "3-Job Pack",
    monthly: "Monthly Unlimited",
    featured: "Featured Job Posting",
  };
  const productLabel = productLabels[params.productType] ?? params.productType;

  try {
    const { error } = await client.emails.send({
      from: fromEmail,
      to: params.email,
      subject: "Your CaribRemotejobs.com order is confirmed",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #0d9488;">Order Confirmed!</h1>
          <p>Thank you for your purchase. Here are your order details:</p>
          <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; font-weight: bold; border: 1px solid #e5e7eb;">Order ID</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">#${params.orderId}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; font-weight: bold; border: 1px solid #e5e7eb;">Product</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${productLabel}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; font-weight: bold; border: 1px solid #e5e7eb;">Job Slots</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${params.jobsRemaining === 999 ? "Unlimited" : params.jobsRemaining}</td>
            </tr>
          </table>
          <p>You're ready to post your job. Use the link below to get started:</p>
          <a href="${postJobUrl}" style="display: inline-block; background: #0d9488; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Post Your Job</a>
          <p style="margin-top: 16px; font-size: 14px; color: #6b7280;">You can return to this link at any time to submit your job posting.</p>
          <hr style="border: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #6b7280;">Lost this email? Visit <a href="${appUrl}/post-job" style="color: #0d9488;">${appUrl}/post-job</a> to have your submission link resent.</p>
          <p style="font-size: 12px; color: #6b7280;">CaribRemotejobs.com — Remote jobs for Caribbean professionals</p>
        </div>
      `,
    });
    if (error) {
      logger.error({ err: error }, "Failed to send order confirmation email");
      throw error;
    }
  } catch (err) {
    logger.error({ err }, "Failed to send order confirmation email");
    throw err;
  }
}

export async function sendJobSubmissionConfirmation(params: {
  email: string;
  sessionId: string;
  jobTitle: string;
  companyName: string;
}): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    const appUrl = process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : (process.env.APP_URL ?? "https://caribremotejobs.com");
    const editUrl = `${appUrl}/post-job?sessionId=${encodeURIComponent(params.sessionId)}`;

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: params.email,
      subject: "Your job listing is under review — here's your edit link",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #0d9488;">Job Submitted Successfully!</h1>
          <p>Hi there,</p>
          <p>We've received your listing for <strong>${params.jobTitle}</strong> at <strong>${params.companyName}</strong>. It's currently <strong>pending review</strong> and will go live once our team approves it — usually within 1 business day.</p>
          <p>Need to make changes before it goes live? You can edit your listing at any time using the link below:</p>
          <a href="${editUrl}" style="display: inline-block; background: #0d9488; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 8px 0;">Edit Your Listing</a>
          <p style="margin-top: 16px; font-size: 14px; color: #6b7280;">Or copy this link: <a href="${editUrl}">${editUrl}</a></p>
          <p style="font-size: 14px; color: #374151;">Once approved, your job will appear live on CaribRemotejobs.com and job seekers will be able to apply directly.</p>
          <hr style="border: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #6b7280;">Lost this link? Visit <a href="${appUrl}/post-job" style="color: #0d9488;">${appUrl}/post-job</a> to have it resent.</p>
          <p style="font-size: 12px; color: #6b7280;">CaribRemotejobs.com — Remote jobs for Caribbean professionals</p>
        </div>
      `,
    });

    if (error) {
      logger.error({ error }, "Failed to send job submission confirmation email");
      return false;
    }

    logger.info({ emailId: data?.id }, "Job submission confirmation email sent");
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send job submission confirmation email");
    return false;
  }
}

export async function sendJobAlerts(
  email: string,
  unsubscribeToken: string,
  jobs: Array<{ title: string; companyName: string; applyUrl: string; category: string }>
): Promise<void> {
  if (jobs.length === 0) return;
  try {
    const { client, fromEmail } = await getResendClient();
    const jobList = jobs
      .map(
        (j) =>
          `<li><strong><a href="${j.applyUrl}">${j.title}</a></strong> at ${j.companyName} (${j.category})</li>`
      )
      .join("");

    await client.emails.send({
      from: fromEmail,
      to: email,
      subject: `${jobs.length} new remote job${jobs.length > 1 ? "s" : ""} for Caribbean professionals`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #0d9488;">New Remote Jobs on CaribRemotejobs.com</h1>
          <ul>${jobList}</ul>
          <a href="${process.env.APP_URL ?? "https://caribremotejobs.com"}/jobs" style="background: #0d9488; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View all jobs</a>
          <hr style="border: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #6b7280;"><a href="${process.env.APP_URL ?? "https://caribremotejobs.com"}/unsubscribe/${unsubscribeToken}">Unsubscribe</a></p>
        </div>
      `,
    });
  } catch (err) {
    logger.error({ err }, "Failed to send job alert email");
  }
}

export async function sendShareLinkExpiryReminder(params: {
  email: string;
  expiresAt: Date;
}): Promise<boolean> {
  const appUrl = process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
    : (process.env.APP_URL ?? "https://caribremotejobs.com");
  const expiryLabel = params.expiresAt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  try {
    const { client, fromEmail } = await getResendClient();
    const { error } = await client.emails.send({
      from: fromEmail,
      to: params.email,
      subject: "Your CaribRemotejobs.com resume share link expires soon",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #0d9488;">Your resume share link expires soon</h1>
          <p>Heads up — the share link you created for your CaribRemotejobs.com resume will expire on <strong>${expiryLabel}</strong>.</p>
          <p>If employers still need to view your resume after that date, generate a fresh link or extend the expiry from your resume page.</p>
          <a href="${appUrl}/resume?tab=upload" style="display: inline-block; background: #0d9488; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 8px 0;">Manage My Share Link</a>
          <p style="font-size: 14px; color: #6b7280; margin-top: 16px;">If you no longer need a share link, you can ignore this email — it will simply stop working on the date above.</p>
          <hr style="border: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #6b7280;">CaribRemotejobs.com — Remote jobs for Caribbean professionals</p>
        </div>
      `,
    });
    if (error) {
      logger.error({ error }, "Failed to send share link expiry reminder email");
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send share link expiry reminder email");
    return false;
  }
}

export async function sendSeekerProWelcomeEmail(email: string): Promise<void> {
  const appUrl = process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
    : (process.env.APP_URL ?? "https://caribremotejobs.com");
  try {
    const { client, fromEmail } = await getResendClient();
    await client.emails.send({
      from: fromEmail,
      to: email,
      subject: "Welcome to CaribRemotejobs.com Pro!",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #0d9488;">You're now a Pro member!</h1>
          <p>Thank you for upgrading to <strong>CaribRemotejobs.com Pro</strong>. Your subscription is active and all Pro benefits are unlocked.</p>
          <h2 style="font-size: 16px; margin-top: 24px;">What's included with Pro:</h2>
          <ul style="line-height: 1.8;">
            <li><strong>Unlimited applications</strong> — no weekly cap on job applications</li>
            <li><strong>Resume share link</strong> — a permanent link employers can always access</li>
            <li><strong>Application history</strong> — track every job you've applied to</li>
            <li><strong>Priority access</strong> — be first to see new Caribbean remote listings</li>
          </ul>
          <a href="${appUrl}/resume" style="display: inline-block; background: #0d9488; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 16px;">Go to My Resume</a>
          <hr style="border: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #6b7280;">CaribRemotejobs.com — Remote jobs for Caribbean professionals</p>
        </div>
      `,
    });
  } catch (err) {
    logger.error({ err }, "Failed to send Seeker Pro welcome email");
  }
}
