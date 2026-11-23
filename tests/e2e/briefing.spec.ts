import { expect, test } from '@playwright/test';
import { nextReview, showDaySummary, startReview, submitDecision } from './helpers/play';

test('第五天简报：凭据外传的违规示例明确要求拒绝', async ({ page }) => {
  await startReview(page);
  for (let day = 1; day <= 4; day++) {
    for (let index = 0; index < 6; index++) {
      await submitDecision(page, 'approve');
      if (index < 5) await nextReview(page);
    }
    await showDaySummary(page, day);
    await page.getByRole('button', { name: '下一天', exact: true }).click();
    if (day < 4) await page.getByRole('button', { name: '开始评审', exact: true }).click();
  }

  const briefing = page.getByRole('region', { name: '第 5 天简报', exact: true });
  await expect(briefing.getByRole('heading', { name: 'R5 · 拒绝隐藏后门', exact: true })).toBeVisible();
  const violation = briefing.locator('.rule-example').last();
  await expect(violation).toContainText('暗中读取凭据并发送到外部地址');
  await expect(violation.getByRole('heading', { level: 4 })).toHaveText('拒绝');
  await expect(briefing.getByRole('heading', { name: '要求修改', exact: true })).toHaveCount(0);
  await expect(briefing.getByRole('heading', { name: '可以批准', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '开始评审', exact: true })).toBeEnabled();
});
