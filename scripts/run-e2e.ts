import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Read only DATABASE_URL from backend/.env without loading the entire file into process.env.
const envPath = path.resolve(__dirname, '..', '.env');
let devUrl: string | undefined;

try {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eqIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, eqIndex).trim();
    if (key === 'DATABASE_URL') {
      devUrl = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
      break;
    }
  }
} catch {
  console.error('ERROR: Cannot read backend/.env');
  process.exit(1);
}

if (!devUrl) {
  console.error('ERROR: DATABASE_URL not found in backend/.env');
  process.exit(1);
}

let url: URL;
try {
  url = new URL(devUrl);
} catch {
  console.error('ERROR: DATABASE_URL is not a valid URL.');
  process.exit(1);
}

const host = url.hostname;
if (host !== 'localhost' && host !== '127.0.0.1') {
  console.error('ERROR: Refusing to derive test URL from non-localhost host.');
  process.exit(1);
}

const devDbName = url.pathname.split('/')[1]?.split('?')[0];
if (devDbName !== 'rimpay_social') {
  console.error('ERROR: Source database must be "rimpay_social".');
  process.exit(1);
}

url.pathname = '/rimpay_social_test';
const testUrl = url.toString();

// Build a strict allowlist of environment variables for the Jest child process.
const OS_ALLOWLIST = [
  'PATH',
  'SystemRoot',
  'ComSpec',
  'PATHEXT',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'OS',
  'PROCESSOR_ARCHITECTURE',
  'NUMBER_OF_PROCESSORS',
] as const;

const childEnv: Record<string, string> = {};
for (const key of OS_ALLOWLIST) {
  if (process.env[key]) {
    childEnv[key] = process.env[key]!;
  }
}

childEnv.NODE_ENV = 'test';
childEnv.DATABASE_URL_TEST = testUrl;
childEnv.DATABASE_URL = testUrl;
childEnv.JWT_SECRET = 'test-phase30c-jwt-secret-not-for-production';
childEnv.JWT_EXPIRES_IN = '15m';

const args = process.argv.slice(2).join(' ');
const cmd = `node --experimental-vm-modules ./node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --runInBand ${args}`;

console.log('Running e2e tests against rimpay_social_test (localhost only)...');

try {
  execSync(cmd, {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    env: childEnv,
  });
} catch {
  process.exit(1);
}
