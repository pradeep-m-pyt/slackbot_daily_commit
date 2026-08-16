import { getUsers } from "./config.js";
import { fetchRecentCommits } from "./github.js";
import { fetchJiraTasks, fetchJiraIssuesByKeys } from "./jira.js";
import { formatDigest } from "./formatMessage.js";
import { postDigest } from "./slack.js";

async function processUserDigest(user) {
  console.log(`\n------------------------------------------------------------`);
  console.log(`[digest] Processing digest for ${user.name} (GH: ${user.github.username}, Jira: ${user.jira.email || "disabled"})...`);

  // 1. Fetch GitHub and Jira data for this specific user
  const [commitsByRepo, jiraTasks] = await Promise.all([
    fetchRecentCommits(user.github).catch((err) => {
      console.error(`[digest] Error fetching GitHub commits for ${user.name}:`, err.message);
      return new Map();
    }),
    user.jira.enabled
      ? fetchJiraTasks(user.jira).catch((err) => {
          console.error(`[digest] Warning: Failed to fetch Jira tasks for ${user.name}:`, err.message);
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
  if (user.jira.enabled && allReferencedKeys.size > 0) {
    const fetchedKeys = new Set([
      ...jiraTasks.completed.map((t) => t.key.toUpperCase()),
      ...jiraTasks.pending.map((t) => t.key.toUpperCase()),
    ]);
    const missingKeys = [...allReferencedKeys].filter((key) => !fetchedKeys.has(key));

    if (missingKeys.length > 0) {
      console.log(`[digest] Fetching details for ${missingKeys.length} referenced Jira issue(s) for ${user.name}...`);
      const missingIssues = await fetchJiraIssuesByKeys(missingKeys, user.jira).catch((err) => {
        console.error(`[digest] Warning: Failed to fetch missing Jira issues for ${user.name}:`, err.message);
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

  const totalCommits = [...commitsByRepo.values()].reduce((sum, list) => sum + list.length, 0);
  console.log(
    `[digest] Summary for ${user.name}: ${totalCommits} commit(s) in ${commitsByRepo.size} repo(s). Jira tasks: ${jiraTasks.completed.length} completed, ${jiraTasks.pending.length} pending.`
  );

  // 4. Format and post to Slack
  const message = formatDigest(commitsByRepo, jiraTasks, commitsByIssue, {
    lookbackHours: user.github.lookbackHours,
    jiraConfig: user.jira, // Bug #5 fix: pass per-user jira config
  });

  console.log(`[digest] Posting digest for ${user.name} to Slack target ${user.slack.channel}...`);
  await postDigest(user.slack.channel, message, user.slack.botToken);
  console.log(`[digest] Successfully sent digest for ${user.name}.`);
}

async function main() {
  const users = getUsers();
  console.log(`[digest] Loaded ${users.length} active user configuration(s).`);

  for (const user of users) {
    try {
      await processUserDigest(user);
    } catch (err) {
      console.error(`[digest] Failed processing digest for ${user.name}:`, err.message);
    }
  }

  console.log(`\n[digest] All user digests completed.`);
}

main().catch((err) => {
  console.error("[digest] Fatal error in main runner:", err.message);
  process.exit(1);
});
