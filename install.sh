#!/usr/bin/env sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
install_root=${CODEX_PING_INSTALL_ROOT:-"$HOME/.codex-ping"}
skill_root=${CODEX_PING_SKILL_ROOT:-"$HOME/.agents/skills/codex-ping"}

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required: https://www.python.org/downloads/" >&2
  exit 1
fi

mkdir -p "$install_root" "$skill_root/agents"
cp "$repo_root/codexping.py" "$install_root/codexping.py"
cp "$repo_root/.agents/skills/codex-ping/SKILL.md" "$skill_root/SKILL.md"
cp "$repo_root/.agents/skills/codex-ping/agents/openai.yaml" "$skill_root/agents/openai.yaml"

if command -v curl >/dev/null 2>&1 && curl -fsS --max-time 10 \
  'https://codex-world-bus.mingowu1.workers.dev/health' >/dev/null; then
  echo 'Relay: online'
else
  echo 'Warning: installed, but the public relay could not be reached.' >&2
fi

echo "Client: $install_root"
echo "Skill:  $skill_root"
echo 'Done. Start a new Codex task and say: 我叫小明'
