import { config } from "./config.js";

const GITHUB_API = "https://api.github.com";

async function githubRequest(path) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${config.github.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "github-slack-digest",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API error ${res.status} on ${path}: ${body}`);
  }

  return res.json();
}

/**
 * Fetches PushEvents for the configured user within the lookback window,
 * including private repo activity (since we're authenticated as that user).
 * Returns a map of { repoName: [commitMessage, ...] }.
 */
export async function fetchRecentCommits() {
  const since = Date.now() - config.github.lookbackHours * 60 * 60 * 1000;
  const { username } = config.github;

  // The events API is paginated; walk pages until events fall outside the window.
  const commitsByRepo = new Map();
  let page = 1;
  let keepGoing = true;

  while (keepGoing && page <= 10) {
    const events = await githubRequest(
      `/users/${username}/events?per_page=100&page=${page}`
    );

    if (events.length === 0) break;

    for (const event of events) {
      const eventTime = new Date(event.created_at).getTime();
      if (eventTime < since) {
        keepGoing = false;
        continue;
      }

      if (event.type !== "PushEvent") continue;

      const repoName = event.repo?.name || "unknown-repo";
      const commits = event.payload?.commits || [];

      for (const commit of commits) {
        // Skip merge commits / noisy auto-messages if desired
        const message = commit.message?.split("\n")[0]?.trim();
        if (!message) continue;

        if (!commitsByRepo.has(repoName)) commitsByRepo.set(repoName, []);
        commitsByRepo.get(repoName).push(message);
      }
    }

    page += 1;
  }

  return commitsByRepo;
}
