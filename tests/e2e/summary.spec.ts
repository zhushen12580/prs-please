import { expect, test } from '@playwright/test';
import { nextReview, showDaySummary, startReview, submitDecision } from './helpers/play';

test('统计与逐题复盘：错证据、漏放、误伤和错裁问题分别统计，日结保留可读材料', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startReview(page);
  const steps = [
    ['d1-02', 'reject', ['disclosure']],
    ['d1-05', 'request_changes', ['disclosure']],
    ['d1-04', 'approve', []],
    ['d1-06', 'reject', ['ci-empty-failure']],
    ['d1-03', 'approve', ['disclosure']],
    ['d1-01', 'approve', []],
  ] as const;
  for (const [index, [id, verdict, evidenceIds]] of steps.entries()) {
    await expect(page.getByRole('heading', { name: new RegExp(`^PR ${id} ·`) })).toBeVisible();
    await submitDecision(page, verdict, evidenceIds);
    if (index < 5) await nextReview(page);
  }
  const summary = await showDaySummary(page, 1);
  for (const text of ['当日得分：25/60', '裁决正确：3/6', '违规合入：1', '放入 bug／后门：1', '误伤好 PR：1']) {
    await expect(summary.getByText(text, { exact: true })).toBeVisible();
  }
  const records = summary.getByRole('article');
  await expect(records).toHaveCount(6);
  const wrongEvidence = records.nth(1);
  await expect(wrongEvidence).toContainText('裁决正确，但证据不完整或含无关项');
  await expect(wrongEvidence).toContainText('本题得分：5/10');
  await expect(wrongEvidence).toContainText('适用规则：R1');
  await expect(wrongEvidence.getByRole('heading', { name: '你的证据', exact: true }).locator('+ ul')).toContainText('disclosure · AI 辅助披露');
  await expect(wrongEvidence.getByRole('heading', { name: '正确证据', exact: true }).locator('~ ul')).toContainText('ci-type-failure · CI 日志：');
  await expect(wrongEvidence).toContainText('TS2322');
  await expect(records.nth(3)).toContainText('裁决错误');
  await expect(records.nth(3)).toContainText('你的裁决：拒绝');
  await expect(records.nth(3)).toContainText('标准裁决：要求修改');
  await expect(records.nth(4)).toContainText('批准不要求选择证据，判分忽略已选证据。');
  await expect(records.nth(4)).toContainText('本题得分：10/10');
  await expect(records.nth(4)).toContainText('disclosure · AI 辅助披露');
  for (const record of await records.all()) {
    await expect(record.getByRole('heading', { name: '判题解释', exact: true }).locator('+ p')).toHaveText(/\S/);
    for (const link of await record.getByRole('link').all()) {
      await expect(link).toHaveAttribute('href', /^https:\/\//);
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      await expect(link.locator('+ p')).toHaveText(/\S/);
    }
  }
  await expect(page.locator('body')).not.toContainText('PR d2-');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
