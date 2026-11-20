// Stamps build-meta.json into dist-electron/ so the packaged app knows its exact GitHub commit SHA, branch, and build time
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));

let commitSha = process.env.GITHUB_SHA || '';
let branch = process.env.GITHUB_REF_NAME || 'main';
let commitMessage = '';

if (!commitSha) {
  try {
    commitSha = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    branch = execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'main';
    commitMessage = execSync('git log -1 --pretty=%s', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    commitSha = 'local-dev';
  }
}

const meta = {
  version: pkg.version,
  commitSha,
  shortSha: commitSha.length >= 7 ? commitSha.slice(0, 7) : commitSha,
  commitMessage,
  branch,
  builtAt: new Date().toISOString(),
  repoOwner: 'sigmasigmaboi124',
  repoName: 'Crosshair',
  repoUrl: 'https://github.com/sigmasigmaboi124/Crosshair',
};

fs.mkdirSync(path.join(process.cwd(), 'dist-electron'), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), 'dist-electron', 'build-meta.json'), JSON.stringify(meta, null, 2));
console.log(`Stamped dist-electron/build-meta.json (v${meta.version} @ ${meta.shortSha})`);
