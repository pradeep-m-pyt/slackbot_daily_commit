/**
 * Builds a Slack Block Kit payload from a GitHub commit map and Jira tasks object.
 * Bug #5 fix: accepts per-user jiraConfig instead of relying on global config singleton.
 */
export function formatDigest(commitsByRepo, jiraTasks, commitsByIssue, { lookbackHours, jiraConfig }) {
  const totalCommits = [...commitsByRepo.values()].reduce(
    (sum, msgs) => sum + msgs.length,
    0
  );
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `📋 Daily Work Digest — ${today}` },
    },
  ];

  const githubContext = `*${totalCommits}* commit(s) in *${commitsByRepo.size}* repo(s)`;
  // Bug #5 fix: use per-user jiraConfig.enabled, not global config.jira.enabled
  const jiraEnabled = jiraConfig?.enabled ?? false;
  const jiraContext = jiraEnabled
    ? `*${jiraTasks.completed.length}* task(s) completed, *${jiraTasks.pending.length}* pending`
    : "Jira integration disabled";

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Activity in the last ${lookbackHours}h: ${githubContext}  |  ${jiraContext}`,
      },
    ],
  });

  blocks.push({ type: "divider" });

  // 1. GitHub Commits
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: "💻 *GitHub Commits*" },
  });

  if (totalCommits === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `_No commits found in the last ${lookbackHours}h._`,
      },
    });
  } else {
    for (const [repoName, commits] of commitsByRepo.entries()) {
      const shortRepo = repoName.split("/").pop();
      const repoUrl = `https://github.com/${repoName}`;
      const jiraHost = jiraConfig?.host || null;

      const bulletList = commits
        .slice(0, 10)
        .map((c) => {
          if (typeof c === "string") {
            const escaped = escapeMrkdwn(c);
            // Bug #5 fix: use per-user jira host
            return `• ${linkifyJiraKeys(escaped, jiraHost)}`;
          }
          const escapedMsg = escapeMrkdwn(c.message);
          const linkifiedMsg = linkifyJiraKeys(escapedMsg, jiraHost);
          const shaLink = c.url && c.shortSha ? `<${c.url}|\`${c.shortSha}\`>` : "";
          const branchBadge = c.branch ? ` _[${escapeMrkdwn(c.branch)}]_` : "";
          return `• ${shaLink} ${linkifiedMsg}${branchBadge}`.trim();
        })
        .join("\n");

      const overflow =
        commits.length > 10 ? `\n_...and ${commits.length - 10} more_` : "";

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*📁 <${repoUrl}|${shortRepo}>* (${commits.length})\n${bulletList}${overflow}`,
        },
      });
    }
  }

  // Bug #5 fix: only render Jira sections if THIS USER's Jira is enabled
  if (jiraEnabled) {
    blocks.push({ type: "divider" });

    // 2. Jira Completed
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "✅ *Completed Works (Jira)*" },
    });

    const jiraHost = jiraConfig?.host || null;

    if (jiraTasks.completed.length === 0) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `_No tasks completed in the last ${lookbackHours}h._`,
        },
      });
    } else {
      const list = jiraTasks.completed
        .slice(0, 10)
        .map((t) => {
          let taskLine = `• *${t.key}*: ${escapeMrkdwn(t.summary)}`;
          const associatedCommits = commitsByIssue.get(t.key.toUpperCase());
          if (associatedCommits && associatedCommits.length > 0) {
            const commitLines = associatedCommits
              .map((c) => {
                const escaped = escapeMrkdwn(c);
                const linkified = linkifyJiraKeys(escaped, jiraHost);
                return `  - _${linkified}_`;
              })
              .join("\n");
            taskLine += `\n${commitLines}`;
          }
          return taskLine;
        })
        .join("\n");
      const overflow =
        jiraTasks.completed.length > 10
          ? `\n_...and ${jiraTasks.completed.length - 10} more_`
          : "";
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `${list}${overflow}` },
      });
    }

    blocks.push({ type: "divider" });

    // 3. Jira Pending
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "⏳ *Pending Works (Jira)*" },
    });

    if (jiraTasks.pending.length === 0) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `_No pending tasks._`,
        },
      });
    } else {
      const list = jiraTasks.pending
        .slice(0, 15)
        .map((t) => {
          let taskLine = `• *${t.key}*: ${escapeMrkdwn(t.summary)}  _[${t.status}]_`;
          const associatedCommits = commitsByIssue.get(t.key.toUpperCase());
          if (associatedCommits && associatedCommits.length > 0) {
            const commitLines = associatedCommits
              .map((c) => {
                const escaped = escapeMrkdwn(c);
                const linkified = linkifyJiraKeys(escaped, jiraHost);
                return `  - _${linkified}_`;
              })
              .join("\n");
            taskLine += `\n${commitLines}`;
          }
          return taskLine;
        })
        .join("\n");
      const overflow =
        jiraTasks.pending.length > 15
          ? `\n_...and ${jiraTasks.pending.length - 15} more_`
          : "";
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `${list}${overflow}` },
      });
    }
  }

  return {
    blocks,
    fallbackText: `Daily Work Digest: ${totalCommits} commits, ${jiraTasks.completed.length} completed, ${jiraTasks.pending.length} pending.`,
  };
}

function escapeMrkdwn(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function linkifyJiraKeys(text, host) {
  if (!host) return text;
  const jiraKeyRegex = /\b([A-Z][A-Z0-9]+-[0-9]+)\b/g;
  return text.replace(jiraKeyRegex, (match) => `<https://${host}/browse/${match}|${match}>`);
}
