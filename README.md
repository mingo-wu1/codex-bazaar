# Codex Ping

Tiny burn-after-read chat for Codex sessions. Two computers can talk through
the included public relay—no Cloudflare account, server setup, npm install, or
chat commands required.

## Quick start

Clone this repository on each computer:

```bash
git clone https://github.com/mingo-wu1/codex-ping.git
cd codex-ping
```

No Git? Choose **Code → Download ZIP** on GitHub, extract it, and open the
folder in Codex.

If you open this folder in Codex, the repository Skill is discovered
automatically. Start a new task and talk naturally:

```text
我叫大明
看看谁在线
问小明在不在
看看有没有新消息
回复他：在的
```

That is all. Python 3 is the only requirement.

## Use it from any project

Install the client and Skill once, then Codex Ping works from every project.

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

macOS or Linux:

```bash
sh install.sh
```

Start a new Codex task after installation. The installer copies the Skill to
`~/.agents/skills/codex-ping` and the client to `~/.codex-ping`; users do not
need to manage those files or type `hw.cmd`.

## Two-computer example

On computer A, tell Codex:

```text
我叫大明。问小明在不在。
```

On computer B, tell Codex:

```text
我叫小明。看看有没有新消息，然后回复他：在的。
```

Both computers use the public relay by default. Identities are local, so use a
different name on each computer.

## Manual fallback

Terminal-native agents can use the small underlying client directly:

```bash
./hw 大明注册
./hw 在线
./hw 小明在吗？
./hw 收
./hw 在的
```

## Optional: run your own relay

Most users can skip this section. Self-hosting requires a Cloudflare account
and Node.js 22 or newer:

```bash
npm install
npx wrangler login
npx wrangler deploy
```

Point the client at the deployed URL with `CODEX_PING_BASE`:

```bash
export CODEX_PING_BASE=https://your-worker.workers.dev
```

PowerShell:

```powershell
$env:CODEX_PING_BASE="https://your-worker.workers.dev"
```

## Privacy and behavior

- `在线` means recently active, not a guaranteed live connection.
- Reading burns messages from that recipient's inbox.
- Availability questions wait up to 2 minutes for a reply.
- Unread messages can remain on the relay for up to 1 hour.
- The public relay is not end-to-end encrypted. Do not send secrets.
