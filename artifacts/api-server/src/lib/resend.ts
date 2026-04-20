import { Resend } from "resend";
import { logger } from "./logger";

let connectionSettings: { settings: { api_key: string; from_email?: string } } | null = null;

async function getCredentials(): Promise<{ apiKey: string; fromEmail: string }> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken || !hostname) {
    throw new Error("Replit connector credentials not found");
  }

  const res = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=resend",
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": xReplitToken,
      },
    }
  );

  const data = await res.json() as { items?: Array<{ settings: { api_key: string; from_email?: string } }> };
  connectionSettings = data.items?.[0] ?? null;

  if (!connectionSettings?.settings?.api_key) {
    throw new Error("Resend not connected");
  }

  return {
    apiKey: connectionSettings.settings.api_key,
    fromEmail: connectionSettings.settings.from_email ?? "alerts@caribbeanremote.com",
  };
}

export async function getResendClient(): Promise<{ client: Resend; fromEmail: string }> {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail,
  };
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
      subject: "You're subscribed to CaribbeanRemote job alerts",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #0d9488;">Welcome to CaribbeanRemote alerts!</h1>
          <p>You've successfully subscribed to job alerts. We'll notify you when new remote jobs matching your interests are posted.</p>
          <p>If you'd like to unsubscribe at any time, <a href="${process.env.APP_URL ?? "https://caribbeanremote.com"}/unsubscribe/${unsubscribeToken}">click here</a>.</p>
          <hr style="border: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #6b7280;">CaribbeanRemote — Remote jobs for Caribbean professionals</p>
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
    : (process.env.APP_URL ?? "https://caribbeanremote.com");
  const postJobUrl = `${appUrl}/post-job?orderId=${params.orderId}`;

  const productLabels: Record<string, string> = {
    single: "Single Job Posting",
    pack: "3-Job Pack",
    monthly: "Monthly Unlimited",
    featured: "Featured Job Posting",
  };
  const productLabel = productLabels[params.productType] ?? params.productType;

  try {
    await client.emails.send({
      from: fromEmail,
      to: params.email,
      subject: "Your CaribbeanRemote order is confirmed",
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
          <p style="font-size: 12px; color: #6b7280;">CaribbeanRemote — Remote jobs for Caribbean professionals</p>
        </div>
      `,
    });
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
}): Promise<void> {
  try {
    const { client, fromEmail } = await getResendClient();
    const appUrl = process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : (process.env.APP_URL ?? "https://caribbeanremote.com");
    const editUrl = `${appUrl}/post-job?sessionId=${encodeURIComponent(params.sessionId)}`;

    await client.emails.send({
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
          <p style="font-size: 14px; color: #374151;">Once approved, your job will appear live on CaribbeanRemote and job seekers will be able to apply directly.</p>
          <hr style="border: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #6b7280;">CaribbeanRemote — Remote jobs for Caribbean professionals</p>
        </div>
      `,
    });
  } catch (err) {
    logger.error({ err }, "Failed to send job submission confirmation email");
  }
}

export async function sendCertificationApplicationConfirmation(params: {
  email: string;
  companyName: string;
}): Promise<void> {
  const { client, fromEmail } = await getResendClient();
  try {
    await client.emails.send({
      from: fromEmail,
      to: params.email,
      subject: "Your Caribbean Friendly Certification application has been received",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #0d9488;">Application Received!</h1>
          <p>Hi there,</p>
          <p>Thank you for applying for <strong>Caribbean Friendly Certification</strong> for <strong>${params.companyName}</strong>.</p>
          <p>Our team will review your application and get back to you within <strong>2 business days</strong>. Once approved, your company will receive a verified badge displayed on your job listings.</p>
          <p style="font-size: 14px; color: #6b7280;">If you have any questions in the meantime, feel free to reply to this email.</p>
          <hr style="border: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #6b7280;">CaribbeanRemote — Remote jobs for Caribbean professionals</p>
        </div>
      `,
    });
  } catch (err) {
    logger.error({ err }, "Failed to send certification application confirmation email");
    throw err;
  }
}

export async function sendCertificationApprovalConfirmation(params: {
  email: string;
  companyName: string;
}): Promise<void> {
  const { client, fromEmail } = await getResendClient();
  const appUrl = process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
    : (process.env.APP_URL ?? "https://caribbeanremote.com");
  try {
    await client.emails.send({
      from: fromEmail,
      to: params.email,
      subject: "Congratulations! Your Caribbean Friendly Certification has been approved",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #0d9488;">Certification Approved!</h1>
          <p>Hi there,</p>
          <p>Great news — <strong>${params.companyName}</strong> has been approved as a <strong>Caribbean Friendly Certified</strong> employer!</p>
          <p>Your company will now display a verified Caribbean Friendly badge on all of your job listings on CaribbeanRemote, signalling to candidates that you actively support Caribbean remote professionals.</p>
          <p>Your certification is valid for one year from today.</p>
          <a href="${appUrl}/jobs" style="display: inline-block; background: #0d9488; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 8px 0;">View Your Listings</a>
          <hr style="border: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #6b7280;">CaribbeanRemote — Remote jobs for Caribbean professionals</p>
        </div>
      `,
    });
  } catch (err) {
    logger.error({ err }, "Failed to send certification approval confirmation email");
    throw err;
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
          <h1 style="color: #0d9488;">New Remote Jobs on CaribbeanRemote</h1>
          <ul>${jobList}</ul>
          <a href="${process.env.APP_URL ?? "https://caribbeanremote.com"}/jobs" style="background: #0d9488; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View all jobs</a>
          <hr style="border: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #6b7280;"><a href="${process.env.APP_URL ?? "https://caribbeanremote.com"}/unsubscribe/${unsubscribeToken}">Unsubscribe</a></p>
        </div>
      `,
    });
  } catch (err) {
    logger.error({ err }, "Failed to send job alert email");
  }
}
