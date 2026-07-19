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

export async function fetchRecentCommits() {
  const sinceMs = Date.now() - config.github.lookbackHours * 60 * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();
  const { username } = config.github;

  const commitsByRepo = new Map();
  const targetRepos = new Set();
  let page = 1;
  let keepGoing = true;

  // 1. Identify which repositories have push events in the lookback window
  while (keepGoing && page <= 10) {
    const events = await githubRequest(
      `/users/${username}/events?per_page=100&page=${page}`
    );

    if (events.length === 0) break;

    for (const event of events) {
      const eventTime = new Date(event.created_at).getTime();
      if (eventTime < sinceMs) {
        keepGoing = false;
        continue;
      }

      if (event.type !== "PushEvent") continue;

      const repoName = event.repo?.name;
      if (repoName) {
        targetRepos.add(repoName);
      }
    }

    page += 1;
  }

  // 2. Fetch actual commits for each repository from the Commits API
  for (const repoName of targetRepos) {
    try {
      const commitsData = await githubRequest(
        `/repos/${repoName}/commits?since=${sinceIso}&author=${username}`
      );

      const messages = [];
      for (const item of commitsData) {
        const message = item.commit?.message?.split("\n")[0]?.trim();
        if (message) {
          messages.push(message);
        }
      }

      if (messages.length > 0) {
        commitsByRepo.set(repoName, messages);
      }
    } catch (err) {
      console.error(`[digest] Failed to fetch commits for ${repoName}:`, err.message);
    }
  }

  return commitsByRepo;
}
