/**
 * Builds a Slack Block Kit payload from a GitHub commit map and Jira tasks object.
 */
export function formatDigest(commitsByRepo, jiraTasks, { lookbackHours }) {
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
  const jiraContext = `*${jiraTasks.completed.length}* task(s) completed, *${jiraTasks.pending.length}* pending`;

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
    for (const [repoName, messages] of commitsByRepo.entries()) {
      const shortRepo = repoName.split("/").pop();
      const bulletList = messages
        .slice(0, 10)
        .map((m) => `• ${escapeMrkdwn(m)}`)
        .join("\n");

      const overflow =
        messages.length > 10 ? `\n_...and ${messages.length - 10} more_` : "";

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*📁 ${shortRepo}* (${messages.length})\n${bulletList}${overflow}`,
        },
      });
    }
  }

  blocks.push({ type: "divider" });

  // 2. Jira Completed
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: "✅ *Completed Works (Jira)*" },
  });

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
      .map((t) => `• *${t.key}*: ${escapeMrkdwn(t.summary)}`)
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
      .map((t) => `• *${t.key}*: ${escapeMrkdwn(t.summary)}  _[${t.status}]_`)
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

  return {
    blocks,
    fallbackText: `Daily Work Digest: ${totalCommits} commits, ${jiraTasks.completed.length} completed, ${jiraTasks.pending.length} pending.`,
  };
}

function escapeMrkdwn(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
