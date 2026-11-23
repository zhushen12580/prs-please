import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parse } from 'yaml';

interface Step {
  id?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  'continue-on-error'?: boolean;
}

interface Job {
  'runs-on': string;
  'timeout-minutes': number;
  needs?: string;
  permissions?: Record<string, string>;
  environment?: { name: string; url: string };
  steps: Step[];
}

function workflow() {
  return parse(readFileSync('.github/workflows/pages.yml', 'utf8')) as {
    on: Record<string, unknown>;
    permissions: Record<string, string>;
    concurrency: { group: string; 'cancel-in-progress': boolean };
    jobs: Record<string, Job>;
  };
}

describe('手动 GitHub Pages 发布契约', () => {
  test('只有手动触发，默认只读权限，串行发布且任务有超时', () => {
    const pages = workflow();
    expect(Object.keys(pages.on)).toEqual(['workflow_dispatch']);
    expect(pages.permissions).toEqual({ contents: 'read' });
    expect(pages.concurrency.group).toBe('pages');
    expect(pages.concurrency['cancel-in-progress']).toBe(false);
    expect(Object.keys(pages.jobs).sort()).toEqual(['build', 'deploy']);
    for (const job of Object.values(pages.jobs)) {
      expect(job['runs-on']).toBe('ubuntu-24.04');
      expect(job['timeout-minutes']).toBeGreaterThan(0);
      expect(job['timeout-minutes']).toBeLessThanOrEqual(30);
      for (const step of job.steps) expect(step['continue-on-error']).not.toBe(true);
    }
  });

  test('固定 Node 24，按锁文件安装、测试、构建，再上传 dist 静态产物', () => {
    const build = workflow().jobs.build;
    const { steps } = build;
    const checkout = steps.findIndex((step) => step.uses?.startsWith('actions/checkout@'));
    const setup = steps.findIndex((step) => step.uses?.startsWith('actions/setup-node@'));
    const install = steps.findIndex((step) => step.run === 'npm ci');
    const tests = steps.findIndex((step) => step.run === 'npm test');
    const bundle = steps.findIndex((step) => step.run?.startsWith('npm run build'));
    const configure = steps.findIndex((step) => step.uses?.startsWith('actions/configure-pages@'));
    const upload = steps.findIndex((step) => step.uses?.startsWith('actions/upload-pages-artifact@'));
    expect(checkout).toBeGreaterThanOrEqual(0);
    expect(setup).toBeGreaterThan(checkout);
    expect(install).toBeGreaterThan(setup);
    expect(tests).toBeGreaterThan(install);
    expect(bundle).toBeGreaterThan(tests);
    expect(configure).toBeGreaterThan(checkout);
    expect(upload).toBeGreaterThan(Math.max(bundle, configure));
    expect(steps[checkout].with?.['persist-credentials']).toBe(false);
    expect(String(steps[setup].with?.['node-version'])).toMatch(/^24(?:\.x)?$/);
    expect(steps[setup].with?.cache).toBe('npm');
    expect(steps[setup].with?.['cache-dependency-path']).toBe('package-lock.json');
    expect(steps[upload].with?.path).toBe('dist');
    expect(steps[upload].with?.name).toBe('github-pages');
    expect(build.permissions).toEqual({ contents: 'read', pages: 'read' });
  });

  test.each(['prs-please', 'review-lab'])('从 GitHub 内建仓库信息推导 /%s/，不依赖 remote', (repository) => {
    const command = workflow().jobs.build.steps.find((step) => step.run?.startsWith('npm run build'))?.run;
    expect(command).toBeDefined();
    // 执行实际工作流的 shell 展开；npm 替身只输出参数，不重复安装或构建。
    const args = execFileSync('bash', ['-eu', '-c', `npm() { printf '%s\\n' "$@"; }\n${command}`], {
      env: { ...process.env, BASH_ENV: '', GITHUB_REPOSITORY: `example-owner/${repository}` },
      encoding: 'utf8',
    }).trim().split('\n');
    expect(args).toEqual(['run', 'build', '--', `--base=/${repository}/`]);
  });

  test('部署依赖成功构建，仅用 GitHub 内建凭据并显示 Pages 环境网址', () => {
    const pages = workflow();
    const deploy = pages.jobs.deploy;
    expect(deploy.needs).toBe('build');
    expect(deploy.permissions).toEqual({ pages: 'write', 'id-token': 'write' });
    expect(deploy.environment?.name).toBe('github-pages');
    expect(deploy.steps).toHaveLength(1);
    const step = deploy.steps[0];
    expect(step.uses).toMatch(/^actions\/deploy-pages@/);
    expect(step.id).toBeTruthy();
    expect(deploy.environment?.url).toBe(`\${{ steps.${step.id}.outputs.page_url }}`);
    expect(step.with?.artifact_name).toBe('github-pages');
    for (const job of Object.values(pages.jobs)) {
      for (const action of job.steps.filter((entry) => entry.uses)) {
        expect(action.with?.token).toBeUndefined();
        expect(action.with?.enablement).toBeUndefined();
      }
    }
    expect(readFileSync('.github/workflows/pages.yml', 'utf8')).not.toMatch(/secrets\.|git (?:push|remote|config)/);
  });
});
