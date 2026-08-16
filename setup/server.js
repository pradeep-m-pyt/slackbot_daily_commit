/**
 * Daily Digest — Onboarding Setup Wizard Server
 * Run: npm run setup
 * Opens: http://localhost:3001
 *
 * This server handles:
 *  - Serving the wizard UI
 *  - Live validation of GitHub and Jira credentials
 *  - Writing new users to config/users.json and config/tokens.json
 *  - Sending a test Slack DM to verify delivery
 */

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = 3001;

const USERS_JSON = path.join(ROOT, "config", "users.json");
const TOKENS_JSON = path.join(ROOT, "config", "tokens.json");

// ── Helpers ────────────────────────────────────────────────────────────────

function readJSON(filePath, fallback = []) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJSON(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}

// ── API Handlers ──────────────────────────────────────────────────────────

async function validateGitHub(body) {
  const { username, token } = body;
  if (!username || !token) return { ok: false, error: "Username and token are required." };

  try {
    const res = await fetch(`https://api.github.com/users/${username}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "daily-digest-setup",
      },
    });

    if (res.status === 401) return { ok: false, error: "Invalid token. Check your GitHub PAT." };
    if (res.status === 404) return { ok: false, error: `GitHub user "${username}" not found.` };
    if (!res.ok) return { ok: false, error: `GitHub API error: ${res.status}` };

    const data = await res.json();
    return { ok: true, name: data.name || username, avatar: data.avatar_url };
  } catch (err) {
    return { ok: false, error: `Network error: ${err.message}` };
  }
}

async function validateJira(body) {
  const { email, token, host } = body;
  const jiraHost = host || process.env.JIRA_HOST || "wwmib.atlassian.net";
  if (!email || !token) return { ok: false, error: "Email and token are required." };

  const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
  const cleanHost = jiraHost.replace(/^https?:\/\//, "").replace(/\/$/, "");

  try {
    const res = await fetch(`https://${cleanHost}/rest/api/3/myself`, {
      headers: { Authorization: authHeader, Accept: "application/json" },
    });

    if (res.status === 401) return { ok: false, error: "Invalid Jira credentials. Check your email and API token." };
    if (res.status === 403) {
      const body = await res.text();
      if (body.includes("SUSPENDED_PAYMENT")) {
        return { ok: false, error: "Jira subscription is suspended. Renew at admin.atlassian.com." };
      }
      return { ok: false, error: "Jira access denied (403)." };
    }
    if (!res.ok) return { ok: false, error: `Jira API error: ${res.status}` };

    const data = await res.json();
    return { ok: true, displayName: data.displayName || email };
  } catch (err) {
    return { ok: false, error: `Network error: ${err.message}` };
  }
}

async function saveUser(body) {
  const { id, name, githubUsername, githubToken, jiraEmail, jiraToken, slackUserId } = body;

  if (!id || !name || !githubUsername || !slackUserId) {
    return { ok: false, error: "Missing required fields: id, name, githubUsername, slackUserId." };
  }

  // Update users.json (non-sensitive profile data)
  const users = readJSON(USERS_JSON, []);
  const existingIdx = users.findIndex((u) => u.id === id);
  const userEntry = {
    id,
    name,
    githubUsername,
    jiraEmail: jiraEmail || null,
    slackUserId,
    enabled: true,
  };

  if (existingIdx >= 0) {
    users[existingIdx] = userEntry;
  } else {
    users.push(userEntry);
  }
  writeJSON(USERS_JSON, users);

  // Update tokens.json (sensitive — gitignored)
  const tokens = readJSON(TOKENS_JSON, {});
  tokens[id] = {
    githubToken: githubToken || null,
    jiraToken: jiraToken || null,
  };
  writeJSON(TOKENS_JSON, tokens);

  return { ok: true };
}

async function sendTestSlack(body) {
  const { slackUserId, name } = body;
  const botToken = process.env.SLACK_BOT_TOKEN;

  if (!botToken) return { ok: false, error: "SLACK_BOT_TOKEN not set. Start server with: npm run setup" };
  if (!slackUserId) return { ok: false, error: "Slack User ID is required." };

  try {
    // Try to open DM (requires im:write scope)
    const dmRes = await fetch("https://slack.com/api/conversations.open", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ users: slackUserId }),
    });

    const dmData = await dmRes.json();
    let channelId = slackUserId;

    if (dmData.ok && dmData.channel?.id) {
      channelId = dmData.channel.id;
    }

    const postRes = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: channelId,
        text: `👋 Hi *${name}*! You've been successfully set up for Daily Digest. You'll receive your first digest tomorrow at 8:08 AM IST. 🚀`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `👋 Hi *${name}*! You've been successfully set up for *Daily Digest*.\n\nYou'll receive your first digest tomorrow at *8:08 AM IST* with your:\n• 💻 GitHub commits from the last 24h\n• ✅ Completed Jira tasks\n• ⏳ Pending Jira tasks`,
            },
          },
          { type: "divider" },
          {
            type: "context",
            elements: [{ type: "mrkdwn", text: "Sent by _Daily Digest Bot_ • Setup complete ✅" }],
          },
        ],
      }),
    });

    const postData = await postRes.json();
    if (!postData.ok) {
      return { ok: false, error: `Slack error: ${postData.error}. Bot may need 'im:write' scope added in api.slack.com/apps.` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Network error: ${err.message}` };
  }
}

// ── HTTP Server ─────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" });
    return res.end();
  }

  // Serve wizard UI
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    const htmlPath = path.join(__dirname, "public", "index.html");
    try {
      const html = fs.readFileSync(htmlPath, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);
    } catch {
      res.writeHead(404);
      return res.end("Wizard UI not found. Check setup/public/index.html");
    }
  }

  // API routes
  if (req.method === "POST") {
    const body = await readBody(req);

    if (url.pathname === "/api/validate/github") {
      return json(res, 200, await validateGitHub(body));
    }
    if (url.pathname === "/api/validate/jira") {
      return json(res, 200, await validateJira(body));
    }
    if (url.pathname === "/api/save") {
      return json(res, 200, await saveUser(body));
    }
    if (url.pathname === "/api/send-test") {
      return json(res, 200, await sendTestSlack(body));
    }
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log("\n╔═════════════════════════════════════════════╗");
  console.log("║     Daily Digest — Onboarding Wizard        ║");
  console.log("╠═════════════════════════════════════════════╣");
  console.log(`║  Open: http://localhost:${PORT}                 ║`);
  console.log("║  Share this link with new team members      ║");
  console.log("╚═════════════════════════════════════════════╝\n");

  // Auto-open browser
  const open = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  import("child_process").then(({ exec }) => exec(`${open} http://localhost:${PORT}`));
});
