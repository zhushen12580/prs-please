import { expect, test, type Page } from '@playwright/test';
import { answerKey } from '../fixtures/answer-key';
import { campaignOrders } from './helpers/campaign';
import { nextReview, readReviewId, showDaySummary, startReview, submitDecision } from './helpers/play';

async function completeAndRead(page: Page, seed: string, perfect: boolean): Promise<string[][]> {
  const observed: string[][] = [];
  for (let day = 1; day <= 5; day++) {
    await expect(page.getByRole('heading', { name: `第 ${day} 天简报`, exact: true })).toBeFocused();
    await expect(page.locator('.briefing code')).toHaveText(seed);
    await page.getByRole('button', { name: '开始评审', exact: true }).click();
    await expect(page.locator('time')).toHaveText('09:00');
    await expect(page.locator('[aria-pressed="true"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '提交裁决', exact: true })).toBeDisabled();
    if (day === 1) await expect(page.getByText('累计得分：0 分', { exact: true })).toBeVisible();
    const ids: string[] = [];
    for (let index = 0; index < 6; index++) {
      const id = await readReviewId(page);
      ids.push(id);
      const answer = answerKey[id];
      await submitDecision(page, perfect ? answer.verdict : 'approve', perfect ? answer.evidenceSets[0] ?? [] : []);
      if (index < 5) await nextReview(page);
    }
    observed.push(ids);
    expect(ids).toEqual(campaignOrders[seed][day - 1]);
    const daily = await showDaySummary(page, day);
    await expect(daily.getByRole('article')).toHaveCount(6);
    await page.getByRole('button', { name: day === 5 ? '查看最终成绩' : '下一天', exact: true }).click();
  }
  const final = page.getByRole('region', { name: '最终成绩', exact: true });
  await expect(final.getByRole('article')).toHaveCount(30);
  await expect(final.getByText(`总得分：${perfect ? 300 : 110}/300`, { exact: true })).toBeVisible();
  await expect(final.getByText(`裁决正确：${perfect ? 30 : 11}/30`, { exact: true })).toBeVisible();
  expect(new Set(observed.flat()).size).toBe(30);
  expect(observed.flat()).toEqual(campaignOrders[seed].flat());
  return observed;
}

test.describe('种子复现', () => {
  test('同一浏览器完成两局相同种子及另一种子的全部 90 次裁决，重玩清空旧成绩', async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./');
    await page.getByRole('button', { name: '开始值班', exact: true }).click();
    const first = await completeAndRead(page, 'maintainer-001', true);
    const final = page.getByRole('region', { name: '最终成绩', exact: true });
    const previousReview = await final.innerText();
    const replay = page.getByRole('button', { name: '同种子再来一次', exact: true });
    await expect(replay).toBeVisible();
    await replay.click();
    let confirmation = page.getByRole('dialog', { name: '覆盖当前值班？', exact: true });
    await expect(confirmation).toContainText('maintainer-001');
    await confirmation.getByRole('button', { name: '取消', exact: true }).click();
    await expect(replay).toBeFocused();
    expect(await final.innerText()).toBe(previousReview);
    await replay.click();
    confirmation = page.getByRole('dialog', { name: '覆盖当前值班？', exact: true });
    await confirmation.getByRole('button', { name: '确认覆盖', exact: true }).click();
    const second = await completeAndRead(page, 'maintainer-001', false);
    expect(second).toEqual(first);

    await page.getByRole('button', { name: '返回首页', exact: true }).click();
    await expect(page.getByRole('heading', { name: '轮到你值班了。', exact: true })).toBeFocused();
    await expect(page.getByRole('button', { name: '继续值班', exact: true })).toBeVisible();
    await page.getByLabel('挑战种子').fill('  maintainer-002  ');
    await page.getByRole('button', { name: '重新开始', exact: true }).click();
    confirmation = page.getByRole('dialog', { name: '覆盖当前值班？', exact: true });
    await expect(confirmation).toContainText('maintainer-001');
    await expect(confirmation).toContainText('maintainer-002');
    await confirmation.getByRole('button', { name: '确认覆盖', exact: true }).click();
    const other = await completeAndRead(page, 'maintainer-002', false);
    expect(other).not.toEqual(first);
    for (const [index, ids] of other.entries()) expect([...ids].sort()).toEqual([...first[index]].sort());
  });

  test('手机首页覆盖确认支持键盘取消并保留草稿，确认后才重开', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await startReview(page);
    await submitDecision(page, 'approve');
    await nextReview(page);
    await page.locator('[data-evidence-id="disclosure"]').click();
    await page.getByRole('button', { name: '要求修改', exact: true }).click();
    await page.getByRole('button', { name: '返回首页', exact: true }).click();
    await page.getByLabel('挑战种子').fill('bad seed');
    await page.getByRole('button', { name: '重新开始', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('1–32');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByLabel('挑战种子').fill('maintainer-002');
    const restart = page.getByRole('button', { name: '重新开始', exact: true });
    await restart.click();
    const confirmation = page.getByRole('dialog', { name: '覆盖当前值班？', exact: true });
    const cancel = confirmation.getByRole('button', { name: '取消', exact: true });
    const confirm = confirmation.getByRole('button', { name: '确认覆盖', exact: true });
    await expect(cancel).toBeFocused();
    await expect(confirmation).toContainText(/清空.*成绩.*草稿/);
    await page.keyboard.press('Shift+Tab');
    await expect(confirm).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(cancel).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(confirmation).toHaveCount(0);
    await expect(restart).toBeFocused();
    await expect(page.getByLabel('挑战种子')).toHaveValue('maintainer-002');
    await page.getByRole('button', { name: '继续值班', exact: true }).click();
    expect(await readReviewId(page)).toBe('d1-05');
    await expect(page.locator('time')).toHaveText('10:30');
    await expect(page.getByLabel('待审进度：第 2 份，共 6 份')).toHaveText('2/6');
    await expect(page.locator('[data-evidence-id="disclosure"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: '要求修改', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('累计得分：10 分', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '提交裁决', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '返回首页', exact: true }).click();
    await page.getByLabel('挑战种子').fill('maintainer-002');
    await restart.click();
    await confirm.click();
    await expect(page.getByRole('heading', { name: '第 1 天简报', exact: true })).toBeFocused();
    await page.getByRole('button', { name: '开始评审', exact: true }).click();
    expect(await readReviewId(page)).toBe('d1-03');
    await expect(page.locator('time')).toHaveText('09:00');
    await expect(page.locator('[aria-pressed="true"]')).toHaveCount(0);
    await expect(page.getByText('累计得分：0 分', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '提交裁决', exact: true })).toBeDisabled();
  });
});
