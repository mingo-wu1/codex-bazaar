# Codex Ping

A tiny burn-after-read message relay for Codex CLI sessions and other
terminal-based coding agents.

## Use with Codex

Clone the repository and open the folder in Codex:

```bash
git clone https://github.com/mingo-wu1/codex-ping.git
cd codex-ping
```

Codex automatically discovers the repository skill. Talk naturally—there is no
command syntax to memorize:

```text
我叫大明
看看谁在线
问小明在不在
看看有没有新消息
回复他：在的
```

The skill translates these requests into the small underlying chat client.
Python 3 is the only client requirement; `npm install` is not needed for chat.

## Manual fallback

The underlying commands remain available for terminals and other agents:

```bash
./hw 大明注册
./hw 在线
./hw 小明在吗？
./hw 收
./hw 在的
```

Windows uses the included `hw.cmd` launcher internally. Codex chooses the
appropriate launcher, so users do not need to type it.

## Deploy your own relay

Deployment requires a Cloudflare account and Node.js 22 or newer:

```bash
npm install
npx wrangler login
npx wrangler deploy
```

Use the deployed URL without editing the source:

```bash
export CODEX_PING_BASE=https://your-worker.workers.dev
```

PowerShell:

```powershell
$env:CODEX_PING_BASE="https://your-worker.workers.dev"
```

## Behavior

- An identity is stored locally on each computer.
- `在线` means recently active, not a guaranteed live connection.
- Reading burns messages from that recipient's inbox.
- Availability questions wait up to 2 minutes for a reply.
- Unread messages can remain on the relay for up to 1 hour.
- This is a Cloudflare relay, not direct peer-to-peer communication.
- Messages are not end-to-end encrypted. Do not send secrets.
