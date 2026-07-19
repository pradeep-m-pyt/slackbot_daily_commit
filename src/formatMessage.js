/**
 * Builds a Slack Block Kit payload from a { repoName: [commitMessages] } map.
 */
export function formatDigest(commitsByRepo, { lookbackHours }) {
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
      text: { type: "plain_text", text: `📋 Daily Commit Digest — ${today}` },
    },
  ];

  if (totalCommits === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `_No commits found in the last ${lookbackHours}h. Rest day? 🌴_`,
      },
    });
    return { blocks, fallbackText: "No commits in the last 24h." };
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `*${totalCommits}* commit(s) across *${commitsByRepo.size}* project(s) in the last ${lookbackHours}h`,
      },
    ],
  });
  blocks.push({ type: "divider" });

  for (const [repoName, messages] of commitsByRepo.entries()) {
    const shortRepo = repoName.split("/").pop();
    const bulletList = messages
      .slice(0, 10) // keep messages readable, avoid Slack block-size issues
      .map((m) => `• ${escapeMrkdwn(m)}`)
      .join("\n");

    const overflow =
      messages.length > 10 ? `\n_...and ${messages.length - 10} more_` : "";

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*📁 ${shortRepo}*  (${messages.length})\n${bulletList}${overflow}`,
      },
    });
  }

  return {
    blocks,
    fallbackText: `Daily digest: ${totalCommits} commits across ${commitsByRepo.size} projects.`,
  };
}

function escapeMrkdwn(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
