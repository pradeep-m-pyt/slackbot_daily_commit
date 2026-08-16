import fs from "fs";
import path from "path";

// ─── JIRA_TOKENS_JSON: single consolidated secret for all users (Phase 3) ───
// Format: '{"pradeep": "ATATT3x...", "kharthik": "ATATT3x...", "ravi": "..."}'
// Falls back to per-user env vars (JIRA_API_TOKEN_{ID}) then to JIRA_API_TOKEN
let jiraTokensMap = {};
if (process.env.JIRA_TOKENS_JSON) {
  try {
    jiraTokensMap = JSON.parse(process.env.JIRA_TOKENS_JSON);
  } catch (err) {
    console.warn("[config] Warning: JIRA_TOKENS_JSON is not valid JSON:", err.message);
  }
}

// ─── Local tokens.json (for local dev — gitignored, populated by setup wizard) ───
const tokensJsonPath = path.resolve(process.cwd(), "config/tokens.json");
let localTokens = {};
if (fs.existsSync(tokensJsonPath)) {
  try {
    localTokens = JSON.parse(fs.readFileSync(tokensJsonPath, "utf8"));
  } catch (err) {
    console.warn("[config] Warning: config/tokens.json is not valid JSON:", err.message);
  }
}

function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
      `Set it in .env locally or in your GitHub Actions secrets.`
    );
  }
  return value;
}

const globalGithubToken = required("GITHUB_TOKEN");
const globalSlackBotToken = required("SLACK_BOT_TOKEN");
const globalJiraHost = process.env.JIRA_HOST || "wwmib.atlassian.net";
const lookbackHours = Number(process.env.LOOKBACK_HOURS || 24);

/**
 * Resolves a user's Jira API token using the following priority:
 * 1. JIRA_TOKENS_JSON env var (production — GitHub Actions)
 * 2. config/tokens.json (local dev — populated by setup wizard)
 * 3. Per-user env var from jiraApiTokenEnvVar field (legacy)
 * 4. Global JIRA_API_TOKEN env var (fallback)
 */
function resolveJiraToken(user) {
  return (
    jiraTokensMap[user.id] ||
    localTokens[user.id]?.jiraToken ||
    (user.jiraApiTokenEnvVar ? process.env[user.jiraApiTokenEnvVar] : null) ||
    process.env.JIRA_API_TOKEN ||
    null
  );
}

/**
 * Resolves a user's GitHub token.
 * Per-user tokens can be stored in tokens.json (populated by setup wizard).
 */
function resolveGithubToken(user) {
  return (
    localTokens[user.id]?.githubToken ||
    (user.githubTokenEnvVar ? process.env[user.githubTokenEnvVar] : null) ||
    globalGithubToken
  );
}

export function getUsers() {
  const usersJsonPath = path.resolve(process.cwd(), "config/users.json");
  if (fs.existsSync(usersJsonPath)) {
    try {
      const raw = fs.readFileSync(usersJsonPath, "utf8");
      const userList = JSON.parse(raw);
      const activeUsers = userList.filter((u) => u.enabled !== false);

      if (activeUsers.length > 0) {
        return activeUsers.map((u) => {
          const jiraToken = resolveJiraToken(u);
          const githubToken = resolveGithubToken(u);

          // Support both new `slackUserId` field and legacy `slackChannel`
          const slackTarget = u.slackUserId || u.slackChannel || process.env.SLACK_CHANNEL;

          return {
            id: u.id || u.githubUsername,
            name: u.name || u.githubUsername,
            github: {
              username: u.githubUsername,
              token: githubToken,
              lookbackHours,
            },
            jira: {
              enabled: !!(globalJiraHost && u.jiraEmail && jiraToken),
              host: globalJiraHost,
              email: u.jiraEmail || null,
              token: jiraToken,
              lookbackHours,
            },
            slack: {
              botToken: globalSlackBotToken,
              channel: slackTarget,
            },
          };
        });
      }
    } catch (err) {
      console.warn("[config] Failed to parse config/users.json, falling back to legacy single-user env vars:", err.message);
    }
  }

  // Fallback to legacy single-user configuration from .env
  return [
    {
      id: process.env.GITHUB_USERNAME || "default",
      name: process.env.GITHUB_USERNAME || "Default User",
      github: {
        username: required("GITHUB_USERNAME"),
        token: globalGithubToken,
        lookbackHours,
      },
      jira: {
        enabled: !!(globalJiraHost && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN),
        host: globalJiraHost,
        email: process.env.JIRA_EMAIL || null,
        token: process.env.JIRA_API_TOKEN || null,
        lookbackHours,
      },
      slack: {
        botToken: globalSlackBotToken,
        channel: required("SLACK_CHANNEL"),
      },
    },
  ];
}

// Legacy named export — kept for backward compatibility with jira.js / github.js defaults
export const config = {
  github: {
    username: process.env.GITHUB_USERNAME || "",
    token: globalGithubToken,
    lookbackHours,
  },
  slack: {
    botToken: globalSlackBotToken,
    channel: process.env.SLACK_CHANNEL || "",
  },
  jira: {
    enabled: !!(globalJiraHost && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN),
    host: globalJiraHost,
    email: process.env.JIRA_EMAIL || null,
    token: process.env.JIRA_API_TOKEN || null,
  },
};
