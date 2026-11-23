import { expect, type Page } from '@playwright/test';
import type { Verdict } from '../../../src/game/types';

const verdictLabels: Record<Verdict, string> = { approve: '批准', request_changes: '要求修改', reject: '拒绝' };

// 辅助函数只通过页面控件操作；答案由测试独立提供。
export async function startReview(page: Page, seed = 'maintainer-001'): Promise<void> {
  await page.goto('./');
  await page.getByLabel('挑战种子').fill(seed);
  await page.getByRole('button', { name: '开始值班', exact: true }).click();
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
