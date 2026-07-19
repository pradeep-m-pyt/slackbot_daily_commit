import { config } from "./config.js";
import { fetchRecentCommits } from "./github.js";
import { fetchJiraTasks } from "./jira.js";
import { formatDigest } from "./formatMessage.js";
import { postDigest } from "./slack.js";

async function main() {
  console.log(`[digest] Fetching data for GitHub (${config.github.username}) and Jira (${config.jira.email})...`);
  
  const [commitsByRepo, jiraTasks] = await Promise.all([
    fetchRecentCommits(),
    fetchJiraTasks().catch((err) => {
      console.error("[digest] Warning: Failed to fetch Jira tasks:", err.message);
      return { completed: [], pending: [] }; // fall back to empty list so GitHub digest still works
    }),
  ]);

  console.log(
    `[digest] GitHub activity in ${commitsByRepo.size} repo(s). Jira tasks: ${jiraTasks.completed.length} completed, ${jiraTasks.pending.length} pending.`
  );
  
  const message = formatDigest(commitsByRepo, jiraTasks, {
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
