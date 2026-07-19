import { WebClient } from "@slack/web-api";
import { config } from "./config.js";

const client = new WebClient(config.slack.botToken);

export async function postDigest({ blocks, fallbackText }) {
  await client.chat.postMessage({
    channel: config.slack.channel,
    text: fallbackText, // fallback for notifications/screen readers
    blocks,
  });
}
