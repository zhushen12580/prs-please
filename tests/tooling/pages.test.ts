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
  if: string;
  'runs-on': string;
  needs?: string;
  environment?: { name: string; url: string };
  steps: Step[];
}

function workflow() {
  return parse(readFileSync('.github/workflows/pages.yml', 'utf8')) as {
    on: Record<string, unknown>;
    permissions: Record<string, string>;
    jobs: Record<string, Job>;
  };
}

describe('公开仓库 GitHub Pages 发布契约', () => {
  test('main 推送与手动触发，两个任务都跳过私有仓库', () => {
    const pages = workflow();
    expect(pages.on).toEqual({ push: { branches: ['main'] }, workflow_dispatch: null });
    expect(pages.permissions).toEqual({ contents: 'read', pages: 'write', 'id-token': 'write' });
    expect(Object.keys(pages.jobs).sort()).toEqual(['build', 'deploy']);
    for (const job of Object.values(pages.jobs)) {
      expect(job.if).toBe('${{ !github.event.repository.private }}');
      expect(job['runs-on']).toBe('ubuntu-latest');
      for (const step of job.steps) expect(step['continue-on-error']).not.toBe(true);
    }
  });

  test('固定 Node 24，按锁文件安装并构建，再上传 dist 静态产物', () => {
    const { steps } = workflow().jobs.build;
    expect(steps).toEqual([
      { uses: 'actions/checkout@v7' },
      { uses: 'actions/setup-node@v7', with: { 'node-version': 24 } },
      { run: 'npm ci' },
      { run: 'npm run build' },
      { uses: 'actions/upload-pages-artifact@v5', with: { path: 'dist' } },
    ]);
  });

  test('默认构建路径匹配本仓库的 Pages 子路径', () => {
    const config = readFileSync('vite.config.ts', 'utf8');
    expect(config).toContain("base: process.env.PRS_PLEASE_BASE ?? '/prs-please/'");
    for (const guide of ['README.md', 'README.zh-CN.md']) {
      expect(readFileSync(guide, 'utf8')).toContain('https://zhushen12580.github.io/prs-please/');
    }
  });

  test('部署依赖成功构建，用内建凭据并显示 Pages 环境网址', () => {
    const pages = workflow();
    const deploy = pages.jobs.deploy;
    expect(deploy.needs).toBe('build');
    expect(deploy.environment).toEqual({
      name: 'github-pages',
      url: '${{ steps.deployment.outputs.page_url }}',
    });
    expect(deploy.steps).toEqual([{ id: 'deployment', uses: 'actions/deploy-pages@v5' }]);
    for (const job of Object.values(pages.jobs)) {
      for (const action of job.steps.filter((entry) => entry.uses)) {
        expect(action.with?.token).toBeUndefined();
        expect(action.with?.enablement).toBeUndefined();
      }
    }
    expect(readFileSync('.github/workflows/pages.yml', 'utf8')).not.toMatch(/secrets\.|git (?:push|remote|config)/);
  });
});
