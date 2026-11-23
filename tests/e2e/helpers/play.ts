import { expect, type Locator, type Page } from '@playwright/test';
import type { Verdict } from '../../../src/game/types';

const verdictLabels: Record<Verdict, string> = { approve: '批准', request_changes: '要求修改', reject: '拒绝' };

// 辅助函数只通过页面控件操作；答案由测试独立提供。
export async function startReview(page: Page, seed = 'maintainer-001'): Promise<void> {
  await page.goto('./');
  await page.getByLabel('挑战种子').fill(seed);
  const restart = page.getByRole('button', { name: '重新开始', exact: true });
  if (await restart.isVisible()) {
    await restart.click();
    await page.getByRole('button', { name: '确认覆盖', exact: true }).click();
  } else {
    await page.getByRole('button', { name: '开始值班', exact: true }).click();
  }
  await page.getByRole('button', { name: '开始评审', exact: true }).click();
}

export async function submitDecision(page: Page, verdict: Verdict, evidenceIds: readonly string[] = []): Promise<void> {
  for (const id of evidenceIds) await page.locator(`[data-evidence-id="${id}"]`).click();
  await page.getByRole('button', { name: verdictLabels[verdict], exact: true }).click();
  await page.getByRole('button', { name: '提交裁决', exact: true }).click();
  await expect(page.getByRole('region', { name: '裁决反馈', exact: true })).toBeVisible();
}

export async function nextReview(page: Page): Promise<void> {
  await page.getByRole('button', { name: '下一份', exact: true }).click();
}

export async function readReviewId(page: Page): Promise<string> {
  const title = await page.getByRole('heading', { level: 2, name: /^PR / }).innerText();
  const id = /^PR ([A-Za-z0-9_-]+) ·/.exec(title)?.[1];
  if (!id) throw new Error(`无法读取 PR 编号：${title}`);
  return id;
}

export async function showDaySummary(page: Page, day: number): Promise<Locator> {
  await page.getByRole('button', { name: '查看日结', exact: true }).click();
  const summary = page.getByRole('region', { name: `第 ${day} 天日结`, exact: true });
  await expect(summary.getByRole('heading', { name: `第 ${day} 天日结`, exact: true })).toBeFocused();
  await expect(summary.locator('time')).toHaveText('18:00');
  return summary;
}
