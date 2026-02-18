#!/bin/bash

# deploy.sh — Publishes HTML install pages to GitHub Pages
#
# Usage:
#   ./deploy.sh                  # Deploy all HTML files from output/
#   ./deploy.sh path/to/file.html  # Deploy a specific HTML file
#
# What it does:
#   1. Copies HTML files to the gh-pages branch
#   2. Pushes to GitHub
#   3. Prints the live URL(s) for students

set -e

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$REPO_ROOT/output"
PAGES_URL="https://8digit.github.io/airtable-base-replicator"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check for files to deploy
if [ -n "$1" ]; then
  # Specific file(s) passed as arguments
  FILES=("$@")
  for f in "${FILES[@]}"; do
    if [ ! -f "$f" ]; then
      echo -e "${YELLOW}⚠️  File not found: $f${NC}"
      exit 1
    fi
  done
else
  # Default: all HTML files in output/
  if [ ! -d "$OUTPUT_DIR" ] || [ -z "$(ls -A "$OUTPUT_DIR"/*.html 2>/dev/null)" ]; then
    echo -e "${YELLOW}⚠️  No HTML files found in output/${NC}"
    echo "   Run the admin UI or CLI first to generate install pages."
    exit 1
  fi
  FILES=("$OUTPUT_DIR"/*.html)
fi

echo -e "${CYAN}📦 Deploying to GitHub Pages...${NC}"

# Save current branch
CURRENT_BRANCH=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)

# Create a temp directory for the deploy
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# Clone just the gh-pages branch (shallow, fast)
git clone --branch gh-pages --single-branch --depth 1 "$REPO_ROOT" "$TMPDIR/deploy" 2>/dev/null

# Copy HTML files
for f in "${FILES[@]}"; do
  cp "$f" "$TMPDIR/deploy/"
  echo -e "  ${GREEN}✓${NC} $(basename "$f")"
done

# Generate a simple index page listing all install files
cd "$TMPDIR/deploy"
INSTALL_FILES=(install-*.html)
if [ ${#INSTALL_FILES[@]} -gt 0 ] && [ -f "${INSTALL_FILES[0]}" ]; then
  cat > index.html << 'INDEXEOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Airtable Base Replicator — Install Pages</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 min-h-screen flex items-center justify-center p-8">
  <div class="max-w-lg w-full">
    <h1 class="text-2xl font-bold text-gray-800 mb-2">📋 Install Pages</h1>
    <p class="text-gray-500 mb-6">Click a link to open the installer for that course base.</p>
    <div class="space-y-3" id="links"></div>
  </div>
  <script>
    // Auto-detect install HTML files
    const links = document.getElementById('links');
INDEXEOF

  for f in "${INSTALL_FILES[@]}"; do
    NAME=$(echo "$f" | sed 's/install-//;s/\.html//;s/-/ /g')
    # Capitalize first letter of each word
    DISPLAY_NAME=$(echo "$NAME" | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1')
    echo "    links.innerHTML += '<a href=\"$f\" class=\"block p-4 bg-white rounded-lg shadow hover:shadow-md transition border border-gray-200 text-blue-600 hover:text-blue-800 font-medium\">$DISPLAY_NAME</a>';" >> index.html
  done

  cat >> index.html << 'INDEXEOF2'
  </script>
</body>
</html>
INDEXEOF2
fi

# Commit and push
git add -A
if git diff --cached --quiet; then
  echo -e "\n${YELLOW}ℹ️  No changes to deploy (files are already up to date).${NC}"
else
  git commit -m "Deploy install pages — $(date '+%Y-%m-%d %H:%M')" --quiet
  git push origin gh-pages --quiet 2>/dev/null
  echo -e "\n${GREEN}✅ Deployed successfully!${NC}"
fi

# Print URLs
echo ""
echo -e "${CYAN}🔗 Student install links:${NC}"
echo ""
for f in "${FILES[@]}"; do
  BASENAME=$(basename "$f")
  echo -e "   ${GREEN}${PAGES_URL}/${BASENAME}${NC}"
done
echo ""
echo -e "${YELLOW}⏱  First deploy takes ~1 min to go live. Subsequent deploys are faster.${NC}"
echo -e "   Index page: ${PAGES_URL}/"
