import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

function readme(): string {
  return readFileSync('README.md', 'utf8');
}

function bashBlocks(): string[] {
  return [...readme().matchAll(/^([ \t]*)```bash\r?\n([\s\S]*?)\r?\n\1```[ \t]*\r?$/gm)]
    .map((match) => match[2].split(/\r?\n/)
      .map((line) => line.startsWith(match[1]) ? line.slice(match[1].length) : line).join('\n'));
}

describe('English README contract', () => {
  test('provides English installation, gameplay and testing sections with the local entry point', () => {
    const guide = readme();
    expect(guide).toMatch(/^# PRs, Please\r?$/m);
    expect(guide).toMatch(/^## (?:Install|Run locally)\r?$/m);
    expect(guide).toMatch(/^## (?:Play|Usage)\b.+/m);
    expect(guide).toMatch(/^## (?:Test|Check)\b.+/m);
    expect(guide).toMatch(/Node\.js 24\b/);
    expect(bashBlocks()).toContain('npm ci');
    expect(bashBlocks()).toContain('npm run dev -- --host 127.0.0.1');
    expect(guide).toContain('http://127.0.0.1:5173/prs-please/');
    expect(guide).toContain('Ctrl+C');
  });

  test('every documented npm run command exists in the real manifest', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    const scripts = [...readme().matchAll(/\bnpm run ([\w:-]+)/g)].map((match) => match[1]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      expect(Object.hasOwn(manifest.scripts, script), `Undeclared README script: ${script}`).toBe(true);
    }
    for (const script of ['dev', 'typecheck', 'check:content', 'build', 'preview', 'test:e2e']) {
      expect(scripts).toContain(script);
    }
  });

  test('offers the complete ordered Ubuntu check sequence as one copyable block', () => {
    expect(bashBlocks()).toContain([
      'npm ci',
      'npx playwright install --with-deps chromium',
      'npm test',
      'npm run build',
      'npm run test:e2e',
    ].join('\n'));
    for (const block of bashBlocks()) {
      expect(block).not.toMatch(/^\s*[$>]\s/m);
      expect(block).not.toMatch(/<[^>]+>/);
    }
  });

  test('documents all six user-story browser-test filters', () => {
    const commands = bashBlocks().flatMap((block) => block.split('\n'));
    for (const filter of ['逐日规则', '证据与三种裁决', '完整五天', '种子复现', '存档与降级', '成绩卡下载']) {
      expect(commands).toContain(`npm run test:e2e -- --grep "${filter}"`);
    }
  });

  test('gives matching default and custom static preview commands and URLs', () => {
    const guide = readme();
    const commands = bashBlocks().flatMap((block) => block.split('\n'));
    const preview = 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort';
    expect(commands).toContain('npm run build');
    expect(commands).toContain(preview);
    expect(guide).toContain('http://127.0.0.1:4173/prs-please/');
    expect(commands).toContain('npm run build -- --base=/review-lab/');
    expect(commands).toContain(`PRS_PLEASE_BASE=/review-lab/ ${preview}`);
    expect(guide).toContain('http://127.0.0.1:4173/review-lab/');
  });

  test('links the contribution guide and MIT license and ends with the exact attribution line', () => {
    const guide = readme();
    for (const file of ['CONTRIBUTING.md', 'LICENSE']) {
      expect(guide).toMatch(new RegExp(`\\[[^\\]]+\\]\\(${file.replaceAll('.', '\\.')}\\)`));
      expect(existsSync(file)).toBe(true);
    }
    expect(readFileSync('LICENSE', 'utf8')).toContain('MIT License');
    expect(guide).toMatch(/\nBuilt with Claude Code & Codex\r?\n?$/);
  });

  test('documents the optional public base example and manual GitHub Pages deployment', () => {
    const guide = readme();
    expect(guide).toContain('[.env.example](.env.example)');
    const deployment = /^## Deploy to GitHub Pages\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(guide)?.[1];
    expect(deployment).toBeDefined();
    for (const text of ['Settings', 'Pages', 'GitHub Actions', 'Run workflow',
      '.github/workflows/pages.yml', 'GITHUB_REPOSITORY', 'dist/', 'built-in', 'token']) {
      expect(deployment).toContain(text);
    }
  });
});
