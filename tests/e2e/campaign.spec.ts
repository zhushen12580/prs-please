import { expect, test, type Locator } from '@playwright/test';
import { answerKey } from '../fixtures/answer-key';
import { campaignOrders } from './helpers/campaign';
import { nextReview, readReviewId, showDaySummary, submitDecision } from './helpers/play';

const labels = { approve: '批准', request_changes: '要求修改', reject: '拒绝' };
const times = ['10:30', '12:00', '13:30', '15:00', '16:30', '18:00'];

async function expectExplanation(root: Locator): Promise<void> {
  for (const name of ['生效规则', '你的证据', '正确证据', '判题解释', '灵感来源与原创改写']) {
    await expect(root.getByRole('heading', { name, exact: true })).toHaveCount(1);
  }
  await expect(root.getByRole('heading', { name: '判题解释', exact: true }).locator('+ p')).toHaveText(/\S/);
  const links = root.getByRole('link');
  expect(await links.count()).toBeGreaterThan(0);
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute('href', /^https:\/\//);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toHaveText(/\S/);
    await expect(link.locator('+ p')).toHaveText(/\S/);
  }
}

test.describe('完整五天', () => {
  test.describe.configure({ timeout: 90_000 });

  for (const perfect of [true, false]) {
    test(perfect ? '全正确：300/300、30/30、零违规与误伤，30 条可读复盘'
      : '全新手机上下文全批准：110/300、11/30、15 个 bug／后门、19 次违规合入', async ({ page }) => {
      // Playwright 为每个场景创建独立的浏览器上下文；所有进度只由真实控件产生。
      if (!perfect) await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('./');
      await expect(page.getByLabel('挑战种子')).toHaveValue('maintainer-001');
      await page.getByRole('button', { name: '开始值班', exact: true }).click();
      const seen: string[] = [];
      const feedbackDetails: string[] = [];
      for (const [dayIndex, ids] of campaignOrders['maintainer-001'].entries()) {
        const day = dayIndex + 1;
        await expect(page.getByRole('heading', { name: `第 ${day} 天简报`, exact: true })).toBeFocused();
        await page.getByRole('button', { name: '开始评审', exact: true }).click();
        await expect(page.locator('time')).toHaveText('09:00');
        await page.getByRole('button', { name: '规则手册', exact: true }).click();
        const manual = page.getByRole('dialog', { name: '规则手册', exact: true });
        await expect(manual.getByText('生效中', { exact: true })).toHaveCount(day);
        await expect(manual.getByRole('heading', { name: /待解锁/ })).toHaveCount(5 - day);
        await page.keyboard.press('Escape');
        for (const [index, id] of ids.entries()) {
          await expect(page.getByRole('heading', { name: new RegExp(`^PR ${id} ·`) })).toBeVisible();
          await expect(page.getByLabel(`待审进度：第 ${index + 1} 份，共 6 份`)).toHaveText(`${index + 1}/6`);
          const actualId = await readReviewId(page);
          expect(actualId).toBe(id);
          expect(seen).not.toContain(actualId);
          seen.push(actualId);
          const answer = answerKey[id];
          const verdict = perfect ? answer.verdict : 'approve';
          if (!perfect) await expect(page.locator('[data-evidence-id][aria-pressed="true"]')).toHaveCount(0);
          await submitDecision(page, verdict, perfect ? answer.evidenceSets[0] ?? [] : []);
          const feedback = page.getByRole('region', { name: '裁决反馈', exact: true });
          await expect(feedback.getByText(`你的裁决：${labels[verdict]}`, { exact: true })).toBeVisible();
          await expect(feedback.getByText(`标准裁决：${labels[answer.verdict]}`, { exact: true })).toBeVisible();
          await expect(feedback.getByText(`本题得分：${perfect || answer.verdict === 'approve' ? 10 : 0}/10`, { exact: true })).toBeVisible();
          await expectExplanation(feedback);
          feedbackDetails.push(await feedback.locator('.result-details').innerText());
          await expect(page.locator('time')).toHaveText(times[index]);
          if (index < 5) await nextReview(page);
        }
        const summary = await showDaySummary(page, day);
        const dailyRecords = summary.getByRole('article');
        await expect(dailyRecords).toHaveCount(6);
        await expect(summary.getByText(`当日得分：${perfect ? 60 : day === 1 ? 30 : 20}/60`, { exact: true })).toBeVisible();
        await expect(summary.getByText(`裁决正确：${perfect ? 6 : day === 1 ? 3 : 2}/6`, { exact: true })).toBeVisible();
        await expect(summary.getByText(`放入 bug／后门：${perfect ? 0 : [3, 4, 1, 4, 3][dayIndex]}`, { exact: true })).toBeVisible();
        await expect(summary.getByText(`违规合入：${perfect ? 0 : day === 1 ? 3 : 4}`, { exact: true })).toBeVisible();
        await expect(summary.getByText('误伤好 PR：0', { exact: true })).toBeVisible();
        for (const [index, id] of ids.entries()) {
          const record = dailyRecords.nth(index);
          await expect(record.getByRole('heading', { level: 3, name: /^PR / })).toContainText(`PR ${id} ·`);
          await expect(record.locator('.result-details')).toHaveText(feedbackDetails[dayIndex * 6 + index], { useInnerText: true });
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        if (day < 5) await page.getByRole('button', { name: '下一天', exact: true }).click();
        else {
          await expect(page.getByRole('button', { name: '下一天', exact: true })).toHaveCount(0);
          await page.getByRole('button', { name: '查看最终成绩', exact: true }).click();
        }
      }
      expect(seen).toEqual(campaignOrders['maintainer-001'].flat());
      expect(new Set(seen).size).toBe(30);
      const final = page.getByRole('region', { name: '最终成绩', exact: true });
      await expect(final.getByRole('heading', { name: '最终成绩', exact: true })).toBeFocused();
      for (const text of perfect
        ? ['总得分：300/300', '裁决正确：30/30', '放入 bug／后门：0', '违规合入：0', '误伤好 PR：0']
        : ['总得分：110/300', '裁决正确：11/30', '放入 bug／后门：15', '违规合入：19', '误伤好 PR：0']) {
        await expect(final.getByText(text, { exact: true })).toBeVisible();
      }
      const records = final.getByRole('article');
      await expect(records).toHaveCount(30);
      for (const [index, id] of seen.entries()) {
        const record = records.nth(index);
        await expect(record.getByRole('heading', { level: 3, name: /^PR / })).toContainText(`PR ${id} ·`);
        await expectExplanation(record);
        await expect(record.locator('.result-details')).toHaveText(feedbackDetails[index], { useInnerText: true });
      }
      await records.last().scrollIntoViewIfNeeded();
      await expect(records.last().getByRole('heading', { name: '判题解释', exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});
