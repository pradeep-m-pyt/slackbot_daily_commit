# GitHub → Slack Daily Commit Digest

Every day at **8:00 AM IST**, this posts a Slack message summarizing your GitHub
commits from the previous 24 hours, grouped by repo.

Runs on **GitHub Actions' free scheduler** — no server, no cron daemon, no
laptop that has to stay on. Secrets live in GitHub's encrypted Secrets store,
never in code.

---

## ⚠️ Before anything else: rotate your credentials

You shared a live Slack bot token and GitHub password earlier. Do this now:

1. **Slack:** [api.slack.com/apps](https://api.slack.com/apps) → your app →
   OAuth & Permissions → **Regenerate** the Bot Token.
2. **GitHub:** Change your account password. Then create a **Personal Access
   Token** instead (GitHub API doesn't accept plain passwords anymore):
   - Go to GitHub → Settings → Developer settings → Personal access tokens →
     Fine-grained tokens → Generate new token.
   - Scope: read access to your repos (`Contents: read` is enough; add
     `Metadata: read` which is required by default). For simplicity you can
     also use a **classic** token with the `repo` scope if you have private repos.

Never paste tokens into chat, code, or commit them to git.

---

## 1. Slack app setup

1. In your Slack app config → **OAuth & Permissions**, make sure the bot has
   the `chat:write` scope (add it if missing, then reinstall the app to your
   workspace — this regenerates the bot token, use the new one).
2. Invite the bot to the channel you want the digest posted in:
   `/invite @your-bot-name` in that channel.
3. Get the **Channel ID**: open the channel in Slack → View channel details →
   scroll down → Channel ID (looks like `C0123ABCD`). Using the ID is more
   reliable than the `#channel-name`.

## 2. Local test run

```bash
git clone <this-repo-once-you-push-it>
cd github-slack-digest
npm install
cp .env.example .env
```

Fill in `.env` with your **new, rotated** values:

```
GITHUB_USERNAME=your-github-username
GITHUB_TOKEN=github_pat_xxxxxxxx
SLACK_BOT_TOKEN=xoxb-xxxxxxxxxxxx
SLACK_CHANNEL=C0123ABCD
LOOKBACK_HOURS=24
```

Run it:

```bash
npm run dev
```

You should see a message land in Slack. Fix any errors before moving on.

## 3. Deploy the schedule

1. Push this project to a **private** GitHub repo.
2. In that repo: Settings → Secrets and variables → Actions → New repository
   secret. Add all four:
   - `DIGEST_GH_USERNAME`
   - `DIGEST_GH_TOKEN`
   - `SLACK_BOT_TOKEN`
   - `SLACK_CHANNEL`
3. That's it. `.github/workflows/daily-digest.yml` will run automatically at
   08:00 IST daily.
4. To test without waiting: go to the **Actions** tab → "Daily Commit Digest"
   → **Run workflow** (this works because of `workflow_dispatch` in the yml).

## How it works

- `src/github.js` — pulls your `PushEvent`s from GitHub's authenticated
  Events API for the last N hours (private repo activity included, since
  you're authenticated as yourself).
- `src/formatMessage.js` — turns that into a Slack Block Kit message grouped
  by repo.
- `src/slack.js` — posts it via `chat.postMessage`.
- `src/config.js` — loads and validates all secrets from env vars; fails
  loudly if anything's missing, rather than posting a broken message.

## Adjusting the schedule

Edit the `cron` line in `.github/workflows/daily-digest.yml`. It's always
UTC — IST is UTC+5:30, so `IST time - 5:30 = UTC cron time`. Example: for
9:00 PM IST use `30 15 * * *`.

## Notes / limits

- GitHub's Events API only returns the last ~90 days / 300 events and is
  eventually consistent (a few minutes of lag is normal) — fine for a daily
  digest, not for real-time use.
- If you push more than ~10 commits to one repo in a day, the message trims
  the list and shows a "+N more" note to stay within Slack's block size limits.
