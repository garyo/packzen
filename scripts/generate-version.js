#!/usr/bin/env node
/**
 * Generate version information from git
 * Run at build time to create src/lib/version.ts
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getGitInfo() {
  try {
    // Get git commit hash (short form)
    let commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();

    // Check for uncommitted changes (excluding untracked files)
    const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    const modifiedFiles = gitStatus.split('\n').filter((line) => line && !line.startsWith('??'));
    const hasChanges = modifiedFiles.length > 0;
    if (hasChanges) {
      commitHash += '+';
    }

    // Try to get git tag, fallback to commit hash if no tag
    let version;
    try {
      version = execSync('git describe --tags --exact-match', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
    } catch {
      // No exact tag, use commit hash
      version = commitHash;
    }

    return { version, commitHash };
  } catch (error) {
    console.warn('Git not available, using fallback version info');
    return { version: 'dev', commitHash: 'unknown' };
  }
}

const isDev = process.env.NODE_ENV === 'development';
const { version, commitHash } = getGitInfo();
const buildDate = new Date().toISOString();

const versionContent = `/**
 * Auto-generated version information
 * Generated at build time by scripts/generate-version.js
 */

export const VERSION_INFO = {
  version: '${isDev ? 'dev' : version}',
  commitHash: '${commitHash}',
  buildDate: '${buildDate}',
  isDev: ${isDev},
} as const;
`;

const outputPath = join(__dirname, '../src/lib/version.ts');
writeFileSync(outputPath, versionContent, 'utf8');

console.log(`✓ Generated version info: ${isDev ? 'dev' : version} (${commitHash}) at ${buildDate}`);
