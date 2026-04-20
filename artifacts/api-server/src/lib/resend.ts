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
