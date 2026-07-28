import { config } from "./config.js";
import { fetchWithRetry } from "./http.js";

/**
 * Fetches recent completed tasks (last 24 hours) and all pending tasks assigned to the user from Jira.
 * Returns { completed: [{ key, summary, status, statusCategory }], pending: [{ key, summary, status, statusCategory }] }.
 */
export async function fetchJiraTasks() {
  const jiraHost = config.jira.host;
  const email = config.jira.email;
  const token = config.jira.token;

  const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
  const lookbackHours = config.github.lookbackHours || 24;

  // JQL Queries
  const completedJql = `assignee = currentUser() AND statusCategory = Done AND updated >= -${lookbackHours}h ORDER BY updated DESC`;
  const pendingJql = `assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC`;

  const [completedIssues, pendingIssues] = await Promise.all([
    queryJira(jiraHost, completedJql, authHeader),
    queryJira(jiraHost, pendingJql, authHeader),
  ]);

  return {
    completed: completedIssues,
    pending: pendingIssues,
  };
}

/**
 * Fetches specific Jira issues by their keys (e.g., TEST-101, PROJ-102) in a single request.
 */
export async function fetchJiraIssuesByKeys(keys) {
  if (!keys || keys.length === 0) return [];

  const jiraHost = config.jira.host;
  const email = config.jira.email;
  const token = config.jira.token;
  const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;

  const jql = `key in (${keys.map((k) => `"${k}"`).join(",")})`;
  return queryJira(jiraHost, jql, authHeader);
}

async function queryJira(host, jql, authHeader) {
  const url = `https://${host}/rest/api/3/search/jql`;
  
  try {
    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jql: jql,
        maxResults: 50,
        fields: ["summary", "status"],
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      console.error(`[jira] API error ${res.status} on JQL query "${jql}": ${errorBody}`);
      return [];
    }

    const data = await res.json();
    const issues = data.issues || [];

    return issues.map((issue) => ({
      key: issue.key,
      summary: issue.fields?.summary || "No Summary",
      status: issue.fields?.status?.name || "Unknown",
      statusCategory: issue.fields?.status?.statusCategory?.name || "Unknown",
    }));
  } catch (err) {
    console.error(`[jira] Network/Request error on JQL query "${jql}":`, err.message);
    return [];
  }
}
