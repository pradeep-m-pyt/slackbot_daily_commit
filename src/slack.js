import { WebClient } from "@slack/web-api";
import { config } from "./config.js";

export async function postDigest(targetChannel = config.slack.channel, { blocks, fallbackText }, botToken = config.slack.botToken) {
  const client = new WebClient(botToken);

  let destination = targetChannel;

  // If target is a User ID (starts with U or W) or DM attempt, open DM channel first
  if (destination && (destination.startsWith("U") || destination.startsWith("W"))) {
    try {
      const dmRes = await client.conversations.open({ users: destination });
      if (dmRes.ok && dmRes.channel?.id) {
        destination = dmRes.channel.id;
      }
    } catch (err) {
      console.warn(`[slack] Could not open DM with user ${targetChannel}:`, err.message);
    }
  }

  // If target is a public channel ID (starts with C), attempt auto-join
  if (destination && destination.startsWith("C")) {
    try {
      await client.conversations.join({ channel: destination }).catch(() => {});
    } catch (e) {}
  }

  try {
    await client.chat.postMessage({
      channel: destination,
      text: fallbackText, // fallback for notifications/screen readers
      blocks,
    });
  } catch (err) {
    // If posting to DM ID directly failed with channel_not_found, attempt conversations.open fallback
    if (err.code === "slack_web_api_error" && err.data?.error === "channel_not_found" && targetChannel.startsWith("D")) {
      console.warn(`[slack] Channel ${targetChannel} not found directly, attempting to open DM conversation...`);
      try {
        const dmRes = await client.conversations.open({ channel: targetChannel });
        if (dmRes.ok && dmRes.channel?.id) {
          await client.chat.postMessage({
            channel: dmRes.channel.id,
            text: fallbackText,
            blocks,
          });
          return;
        }
      } catch (dmErr) {}
    }
    throw err;
  }
}
