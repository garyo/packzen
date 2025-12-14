#!/usr/bin/env node
/**
 * Set up git hooks for the repository
 * Run automatically via the "prepare" npm script
 */

import { writeFileSync, chmodSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const hooksDir = join(__dirname, '../.git/hooks');
const preCommitPath = join(hooksDir, 'pre-commit');

// Pre-commit hook script
const preCommitHook = `#!/bin/sh
# Pre-commit hook: Check Prettier formatting

echo "🔍 Checking code formatting with Prettier..."

# Run prettier check
bun run format:check

# Capture exit code
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo ""
  echo "❌ Formatting check failed!"
  echo "💡 Run 'bun run format' to fix formatting issues."
  exit 1
fi

echo "✅ Formatting check passed!"
exit 0
`;

try {
  // Check if .git directory exists
  if (!existsSync(hooksDir)) {
    console.log('⚠️  .git/hooks directory not found. Skipping git hook setup.');
    console.log('   (This is normal for fresh clones - hooks will be set up on next install)');
    process.exit(0);
  }

  // Write pre-commit hook
  writeFileSync(preCommitPath, preCommitHook, 'utf8');

  // Make it executable
  chmodSync(preCommitPath, 0o755);

  console.log('✅ Git pre-commit hook installed successfully');
  console.log('   → Prettier formatting will be checked before each commit');
} catch (error) {
  console.error('❌ Failed to set up git hooks:', error.message);
  // Don't fail the install process
  process.exit(0);
}
