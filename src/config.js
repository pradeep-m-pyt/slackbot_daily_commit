import fs from "fs";
import path from "path";

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

export function getUsers() {
  const usersJsonPath = path.resolve(process.cwd(), "config/users.json");
  if (fs.existsSync(usersJsonPath)) {
    try {
      const raw = fs.readFileSync(usersJsonPath, "utf8");
      const userList = JSON.parse(raw);
      const activeUsers = userList.filter((u) => u.enabled !== false);

      if (activeUsers.length > 0) {
        return activeUsers.map((u) => {
          const jiraToken = u.jiraApiTokenEnvVar
            ? process.env[u.jiraApiTokenEnvVar] || process.env.JIRA_API_TOKEN
            : process.env.JIRA_API_TOKEN;

          const githubToken = u.githubTokenEnvVar
            ? process.env[u.githubTokenEnvVar] || globalGithubToken
            : globalGithubToken;

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
              email: u.jiraEmail,
              token: jiraToken,
              lookbackHours,
            },
            slack: {
              botToken: globalSlackBotToken,
              channel: u.slackChannel || process.env.SLACK_CHANNEL,
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
