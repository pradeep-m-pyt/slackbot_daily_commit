import { config } from "./config.js";
import { fetchWithRetry } from "./http.js";

const GITHUB_API = "https://api.github.com";

async function githubRequest(path, token) {
  const res = await fetchWithRetry(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
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

export async function fetchRecentCommits(githubConfig = config.github) {
  const lookbackHours = githubConfig.lookbackHours || 24;
  const sinceMs = Date.now() - lookbackHours * 60 * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();
  const username = githubConfig.username;
  const token = githubConfig.token;

  const commitsByRepo = new Map();
  const candidateRepos = new Set();

  // 1. Public + private events (authenticated)
  try {
    const events = await githubRequest(`/users/${username}/events?per_page=100`, token).catch(() => []);
    if (Array.isArray(events)) {
      for (const event of events) {
        const eventTime = new Date(event.created_at).getTime();
        if (eventTime >= sinceMs && event.type === "PushEvent" && event.repo?.name) {
          candidateRepos.add(event.repo.name);
        }
      }
    }
  } catch (err) {
    console.warn(`[digest] Public events lookup warning for ${username}:`, err.message);
  }

  // 2. All user-accessible repos (owner + collaborator + org member), paginated up to 3 pages
  //    Bug #4 fix: was per_page=20 with no affiliation — missed most org repos
  try {
    let page = 1;
    while (page <= 3) {
      const userRepos = await githubRequest(
        `/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member&page=${page}`,
        token
      ).catch(() => []);
      if (!Array.isArray(userRepos) || userRepos.length === 0) break;

      let foundAny = false;
      for (const repo of userRepos) {
        const updatedAt = new Date(repo.updated_at).getTime();
        if (updatedAt >= sinceMs && repo.full_name) {
          candidateRepos.add(repo.full_name);
          foundAny = true;
        }
      }

      // Stop paginating if last repo on this page is older than our lookback window
      if (!foundAny && userRepos.length > 0) {
        const oldestOnPage = new Date(userRepos[userRepos.length - 1].updated_at).getTime();
        if (oldestOnPage < sinceMs) break;
      }

      if (userRepos.length < 100) break;
      page++;
    }
  } catch (err) {
    console.warn(`[digest] User repos lookup warning for ${username}:`, err.message);
  }

  // 3. Process candidate repos
  for (const repoName of candidateRepos) {
    try {
      const commitMap = new Map(); // sha -> CommitObject

      // Fetch all branches up to page 5
      let allBranches = [];
      let page = 1;
      while (page <= 5) {
        const branches = await githubRequest(`/repos/${repoName}/branches?per_page=100&page=${page}`, token).catch(() => []);
        if (!Array.isArray(branches) || branches.length === 0) break;
        allBranches.push(...branches);
        if (branches.length < 100) break;
        page++;
      }

      const branchList = allBranches.length > 0 ? allBranches.map((b) => b.name) : [null];

      // Process branches in chunks of 50 for fast parallel processing
      const chunkSize = 50;
      for (let i = 0; i < branchList.length; i += chunkSize) {
        const chunk = branchList.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (branchName) => {
            const branchParam = branchName ? `&sha=${encodeURIComponent(branchName)}` : "";
            const commitsData = await githubRequest(
              `/repos/${repoName}/commits?since=${sinceIso}&per_page=100${branchParam}`,
              token
            ).catch(() => []);

            if (!Array.isArray(commitsData)) return;

            for (const item of commitsData) {
              const sha = item.sha;
              const shortSha = sha ? sha.substring(0, 7) : "";
              const authorLogin = (item.author?.login || "").toLowerCase();
              const committerLogin = (item.committer?.login || "").toLowerCase();
              const authorEmail = (item.commit?.author?.email || "").toLowerCase();
              const authorName = (item.commit?.author?.name || "").toLowerCase();
              const targetUser = username.toLowerCase();
              const userPrefix = targetUser.split("-")[0].split(".")[0]; // e.g. "kharthik" from "kharthik-pyt" or "pradeep"

              const isMatch =
                authorLogin === targetUser ||
                committerLogin === targetUser ||
                authorEmail.includes(targetUser) ||
                (userPrefix && authorEmail.includes(userPrefix)) ||
                authorName.includes(targetUser) ||
                (userPrefix && authorName.includes(userPrefix));

              if (isMatch && sha) {
                const message = item.commit?.message?.split("\n")[0]?.trim() || "No commit message";
                const commitUrl = item.html_url || `https://github.com/${repoName}/commit/${sha}`;

                if (!commitMap.has(sha)) {
                  commitMap.set(sha, {
                    sha,
                    shortSha,
                    message,
                    url: commitUrl,
                    branch: branchName || "default",
                    author: item.commit?.author?.name || username,
                    date: item.commit?.author?.date || "",
                  });
                }
              }
            }
          })
        );
      }

      if (commitMap.size > 0) {
        // Sort commits by date descending
        const sortedCommits = Array.from(commitMap.values()).sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        commitsByRepo.set(repoName, sortedCommits);
      }
    } catch (err) {
      console.error(`[digest] Failed to fetch commits for ${repoName} (${username}):`, err.message);
    }
  }

  return commitsByRepo;
}
