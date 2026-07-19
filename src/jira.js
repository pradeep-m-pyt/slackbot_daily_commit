import { config } from "./config.js";

/**
 * Fetches recent completed tasks (last 24 hours) and all pending tasks assigned to the user from Jira.
 * Returns { completed: [{ key, summary, status }], pending: [{ key, summary, status }] }.
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

async function queryJira(host, jql, authHeader) {
  const url = `https://${host}/rest/api/3/search/jql`;
  
  const res = await fetch(url, {
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
    throw new Error(`Jira API error ${res.status}: ${errorBody}`);
  }

  const data = await res.json();
  const issues = data.issues || [];

  return issues.map((issue) => ({
    key: issue.key,
    summary: issue.fields?.summary || "No Summary",
    status: issue.fields?.status?.name || "Unknown",
  }));
}
