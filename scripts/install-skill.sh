#!/bin/bash
# 把本插件携带的技能载荷安装到 DSH 用户技能目录（不装插件也能用技能）。
#
# 用法：./scripts/install-skill.sh [目标目录]
#   默认目标：$DSH_HOME/skills/release-infringement-audit（$DSH_HOME 默认 ~/.dsh）
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
TARGET="${1:-$DSH_HOME/skills/release-infringement-audit}"

if [ ! -f "$HERE/skill/SKILL.md" ]; then
    echo "找不到技能载荷：$HERE/skill/SKILL.md" >&2
    exit 1
fi

mkdir -p "$TARGET"
# 只同步技能内容，不带走插件代码与 node_modules
cp -R "$HERE/skill/." "$TARGET/"
find "$TARGET" -name '__pycache__' -type d -prune -exec rm -rf {} + 2>/dev/null || true

echo "✅ 技能已安装到 $TARGET"
echo "   自测：python3 \"$TARGET/scripts/selftest.py\""
