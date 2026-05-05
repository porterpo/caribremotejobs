import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger";

const MAX_DESC_CHARS = 4000;

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic();
  return client;
}

export async function generateJobSummary(
  title: string,
  company: string,
  description: string,
): Promise<string | null> {
  const ai = getClient();
  if (!ai) return null;

  const trimmed = description.slice(0, MAX_DESC_CHARS);

  try {
    const message = await ai.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 250,
      messages: [
        {
          role: "user",
          content:
            `Write a 2–3 sentence neutral summary of this job posting in your own words. ` +
            `Cover the role, key responsibilities, and main requirements. ` +
            `Do not copy phrases from the original. Do not add information not in the posting.\n\n` +
            `Job: ${title} at ${company}\n\n${trimmed}`,
        },
      ],
    });

    const block = message.content[0];
    if (block?.type !== "text") return null;
    return block.text.trim() || null;
  } catch (err) {
    logger.warn({ err, title, company }, "Failed to generate job summary");
    return null;
  }
}
