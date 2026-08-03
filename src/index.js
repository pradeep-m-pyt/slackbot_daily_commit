import { config } from "./config.js";
import { fetchRecentCommits } from "./github.js";
import { fetchJiraTasks, fetchJiraIssuesByKeys } from "./jira.js";
import { formatDigest } from "./formatMessage.js";
import { postDigest } from "./slack.js";

async function main() {
  const jiraEnabled = config.jira.enabled;
  if (jiraEnabled) {
    console.log(`[digest] Fetching data for GitHub (${config.github.username}) and Jira (${config.jira.email})...`);
  } else {
    console.log(`[digest] Fetching data for GitHub (${config.github.username}) [Jira integration disabled]...`);
  }
  
  // 1. Fetch GitHub and Jira data (Jira only if enabled)
  const [commitsByRepo, jiraTasks] = await Promise.all([
    fetchRecentCommits(),
    jiraEnabled
      ? fetchJiraTasks().catch((err) => {
          console.error("[digest] Warning: Failed to fetch Jira tasks:", err.message);
          return { completed: [], pending: [] };
        })
      : Promise.resolve({ completed: [], pending: [] }),
  ]);

  // 2. Parse commits for Jira ticket keys to establish mapping
  const commitsByIssue = new Map(); // Map<issueKey, string[]>
  const jiraKeyRegex = /\b([A-Z][A-Z0-9]+-[0-9]+)\b/g;
  const allReferencedKeys = new Set();

  for (const [repoName, commits] of commitsByRepo.entries()) {
    const shortRepo = repoName.split("/").pop();
    for (const item of commits) {
      const msg = typeof item === "string" ? item : item.message;
      const shaStr = typeof item === "object" && item.shortSha ? `[\`${item.shortSha}\`] ` : "";
      const matches = msg.match(jiraKeyRegex);
      if (matches) {
        for (const match of matches) {
          const key = match.toUpperCase();
          allReferencedKeys.add(key);
          if (!commitsByIssue.has(key)) {
            commitsByIssue.set(key, []);
          }
          commitsByIssue.get(key).push(`${shortRepo}: ${shaStr}${msg}`);
        }
      }
    }
  }

  // 3. Fetch details for missing Jira issues referenced in commits
  if (jiraEnabled && allReferencedKeys.size > 0) {
    const fetchedKeys = new Set([
      ...jiraTasks.completed.map((t) => t.key.toUpperCase()),
      ...jiraTasks.pending.map((t) => t.key.toUpperCase()),
    ]);
    const missingKeys = [...allReferencedKeys].filter((key) => !fetchedKeys.has(key));

    if (missingKeys.length > 0) {
      console.log(`[digest] Fetching details for ${missingKeys.length} referenced Jira issue(s) not in default feed...`);
      const missingIssues = await fetchJiraIssuesByKeys(missingKeys).catch((err) => {
        console.error("[digest] Warning: Failed to fetch missing Jira issues:", err.message);
        return [];
      });

      for (const issue of missingIssues) {
        const isDone = issue.statusCategory?.toLowerCase() === "done";
        if (isDone) {
          jiraTasks.completed.push(issue);
        } else {
          jiraTasks.pending.push(issue);
        }
      }
    }
  }

  console.log(
    `[digest] GitHub activity in ${commitsByRepo.size} repo(s). Jira tasks: ${jiraTasks.completed.length} completed, ${jiraTasks.pending.length} pending.`
  );
  
  // 4. Format and post to Slack
  const message = formatDigest(commitsByRepo, jiraTasks, commitsByIssue, {
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
