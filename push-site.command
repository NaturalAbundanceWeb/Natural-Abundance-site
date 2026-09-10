#!/bin/bash
# Natural Abundance — Push site changes to GitHub (double-click to run)

cd "$(dirname "$0")"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Natural Abundance Site → GitHub Push"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check for unpushed commits or uncommitted changes
UNPUSHED=$(git log @{u}.. --oneline 2>/dev/null)
UNCOMMITTED=$(git status --short)

if [ -z "$UNPUSHED" ] && [ -z "$UNCOMMITTED" ]; then
  echo "✓ Nothing to push — repository is already up to date."
  echo ""
  echo "Press any key to close..."
  read -n 1
  exit 0
fi

if [ -n "$UNPUSHED" ]; then
  echo "Commits ready to push:"
  git log @{u}.. --oneline
  echo ""
fi

if [ -n "$UNCOMMITTED" ]; then
  echo "Uncommitted changes (not yet committed):"
  git status --short
  echo ""
fi

git push

if [ $? -eq 0 ]; then
  echo ""
  echo "✓ Pushed successfully! Netlify will deploy in ~30 seconds."
  echo "  Live at: https://naturalabundance.co"
else
  echo ""
  echo "✗ Push failed. Check your internet connection and try again."
fi

echo ""
echo "Press any key to close..."
read -n 1
