// All secrets come from environment variables ONLY.
// Locally: create a .env file (never commit it) and run `npm run dev`.
// In production: set these as GitHub Actions repo secrets (see README).

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

export const config = {
  github: {
    username: required("GITHUB_USERNAME"),
    token: required("GITHUB_TOKEN"), // Personal Access Token (fine-grained or classic, "repo" + "read:user" scopes)
    lookbackHours: Number(process.env.LOOKBACK_HOURS || 24),
  },
  slack: {
    botToken: required("SLACK_BOT_TOKEN"), // xoxb-...
    channel: required("SLACK_CHANNEL"), // channel ID like C0123ABCD, or #channel-name
  },
};
