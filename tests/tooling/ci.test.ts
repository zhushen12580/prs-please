import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parse } from 'yaml';

interface Step {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  if?: string;
  'continue-on-error'?: boolean;
}

interface CheckJob {
  'runs-on': string;
  'timeout-minutes': number;
  permissions?: unknown;
  environment?: unknown;
  steps: Step[];
}

function readWorkflow() {
  return parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as {
    on: Record<string, unknown>;
    permissions: Record<string, string>;
    jobs: Record<string, CheckJob>;
  };
}

function checkJob() {
  const jobs = Object.values(readWorkflow().jobs);
  expect(jobs).toHaveLength(1);
  return jobs[0];
}

describe('Ubuntu 无人值守检查 CI', () => {
  test('push 和 pull_request 触发 Ubuntu 24.04 检查，权限只读且有合理超时', () => {
    const workflow = readWorkflow();
    expect(Object.keys(workflow.on).sort()).toEqual(['pull_request', 'push']);
    expect(workflow.permissions).toEqual({ contents: 'read' });
    const job = checkJob();
    expect(job['runs-on']).toBe('ubuntu-24.04');
    expect(Number.isInteger(job['timeout-minutes'])).toBe(true);
    expect(job['timeout-minutes']).toBeGreaterThan(0);
    expect(job['timeout-minutes']).toBeLessThanOrEqual(30);
    expect(job.permissions).toBeUndefined();
  });

  test('安装前检出代码并设置固定 Node 24，npm 缓存依据锁文件', () => {
    const { steps } = checkJob();
    const checkoutIndex = steps.findIndex((step) => step.uses?.startsWith('actions/checkout@'));
    const setupIndex = steps.findIndex((step) => step.uses?.startsWith('actions/setup-node@'));
    const installIndex = steps.findIndex((step) => step.run?.trim().startsWith('npm ci'));
    expect(checkoutIndex).toBeGreaterThanOrEqual(0);
    expect(setupIndex).toBeGreaterThan(checkoutIndex);
    expect(installIndex).toBeGreaterThan(setupIndex);
    expect(steps[checkoutIndex].with?.['persist-credentials']).toBe(false);
    const options = steps[setupIndex].with;
    expect(String(options?.['node-version'])).toMatch(/^24(?:\.x)?$/);
    expect(options?.cache).toBe('npm');
    expect(options?.['cache-dependency-path']).toBe('package-lock.json');
  });

  test('按顺序执行锁定安装、Chromium、单测、生产构建与浏览器检查，失败即失败', () => {
    const runSteps = checkJob().steps.filter((step) => step.run !== undefined);
    const commands = runSteps.flatMap((step) => step.run!.trim().split(/\r?\n/)
      .map((command) => command.trim()).filter(Boolean));
    expect(commands).toEqual([
      'npm ci',
      'npx playwright install --with-deps chromium',
      'npm test',
      'npm run build',
      'npm run test:e2e',
    ]);
    for (const step of runSteps) {
      expect(step.if).toBeUndefined();
      expect(step['continue-on-error']).not.toBe(true);
    }
  });

  test('检查工作流只使用检出与 Node 设置 action，发布由独立手动工作流负责', () => {
    const job = checkJob();
    expect(job.steps.flatMap((step) => step.uses ? [step.uses.split('@')[0]] : []))
      .toEqual(['actions/checkout', 'actions/setup-node']);
    expect(job.environment).toBeUndefined();
    const pages = parse(readFileSync('.github/workflows/pages.yml', 'utf8')) as { on: Record<string, unknown> };
    expect(Object.keys(pages.on)).toEqual(['workflow_dispatch']);
  });
});
