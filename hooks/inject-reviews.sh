#!/usr/bin/env bash
# Agent Reviewer hook for Kimi Code CLI (UserPromptSubmit).
#
# When the user submits a prompt, look for staged review comments written by
# the Agent Reviewer VS Code extension (<cwd>/.agent-reviewer/pending-reviews.md).
# If present, print them to stdout so they are appended to the prompt's context,
# then rename the file to .consumed — the extension watches for that
# disappearance and clears the staged comments in the editor.
#
# Always exits 0 (fail-open): this hook must never block a prompt.
set -u

input=$(cat)

# Session cwd from the hook payload (jq preferred, sed fallback).
if command -v jq >/dev/null 2>&1; then
  cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
else
  cwd=$(printf '%s' "$input" | sed -n 's/.*"cwd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
fi
[ -n "${cwd:-}" ] || exit 0

pending="$cwd/.agent-reviewer/pending-reviews.md"

# Nothing staged (or already consumed): no file, or no review entries.
[ -f "$pending" ] || exit 0
grep -q '^## \[ref' "$pending" || exit 0

echo "The user staged code review comments in VS Code (Agent Reviewer). Each entry cites the path, line range, and verbatim code it refers to, followed by the user's note. Address these reviews in the context of the user's message:"
echo
cat "$pending"

mv -f "$pending" "$pending.consumed"
exit 0
