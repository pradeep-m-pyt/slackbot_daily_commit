import { WebClient } from "@slack/web-api";
import { config } from "./config.js";

const client = new WebClient(config.slack.botToken);

export async function postDigest({ blocks, fallbackText }) {
  try {
    // Attempt to join public channel if not already in channel
    await client.conversations.join({ channel: config.slack.channel }).catch(() => {});
  } catch (e) {}

  await client.chat.postMessage({
    channel: config.slack.channel,
    text: fallbackText, // fallback for notifications/screen readers
    blocks,
  });
}
