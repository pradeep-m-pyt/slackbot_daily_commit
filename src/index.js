import { config } from "./config.js";
import { fetchRecentCommits } from "./github.js";
import { formatDigest } from "./formatMessage.js";
import { postDigest } from "./slack.js";

async function main() {
  console.log(`[digest] Fetching commits for ${config.github.username}...`);
  const commitsByRepo = await fetchRecentCommits();

  console.log(
    `[digest] Found activity in ${commitsByRepo.size} repo(s). Formatting message...`
  );
  const message = formatDigest(commitsByRepo, {
    lookbackHours: config.github.lookbackHours,
  });

  console.log(`[digest] Posting to Slack channel ${config.slack.channel}...`);
  await postDigest(message);

  console.log("[digest] Done.");
}

main().catch((err) => {
  console.error("[digest] Failed:", err.message);
  process.exit(1);
});
