import { expect, test } from '@playwright/test';
import { answerKey } from '../fixtures/answer-key';
import { campaignOrders } from './helpers/campaign';
import { nextReview, submitDecision } from './helpers/play';

const ruleTitles = ['CI 必须通过', '核对项目 API', '披露 AI 辅助', '保持相关测试的覆盖', '拒绝隐藏后门'];
const ruleBodies = [
  'CI 必须通过；失败须修复后重审。', '使用的项目 API 必须存在且符合随附说明。',
  '使用 AI 辅助必须在 PR 描述的披露栏说明。', '不得删除或削弱相关测试来制造 CI 通过。',
  '不得引入隐藏执行、凭据外传或绕过验证的后门。',
];

test.describe('逐日规则 · 第五天与五天通关入口', () => {
  for (const [seed, mobile] of [['maintainer-001', false], ['maintainer-002', true]] as const) {
    test(`${seed} ${mobile ? '手机' : '桌面'}：每天只解锁一条规则，30 次裁决后经日结进入最终成绩`, async ({ page }) => {
      if (mobile) await page.setViewportSize({ width: 390, height: 844 });
      const externalRequests: string[] = [];
      await page.route('**/*', async (route) => {
        if (new URL(route.request().url()).origin === 'http://127.0.0.1:4173') await route.continue();
        else { externalRequests.push(route.request().url()); await route.abort(); }
      });
      await page.goto('./');
      await page.getByLabel('挑战种子').fill(seed);
      await page.getByRole('button', { name: '开始值班', exact: true }).click();
      const seen: string[] = [];
      for (const [dayIndex, ids] of campaignOrders[seed].entries()) {
        const day = dayIndex + 1;
        const briefing = page.getByRole('region', { name: `第 ${day} 天简报`, exact: true });
        await expect(briefing.getByRole('heading', { name: `第 ${day} 天简报`, exact: true })).toBeFocused();
        await expect(briefing).toContainText('今日新规则');
        await expect(briefing.getByRole('heading', { name: `R${day} · ${ruleTitles[dayIndex]}`, exact: true })).toBeVisible();
        await expect(briefing).toContainText(ruleBodies[dayIndex]);
        for (const body of ruleBodies.slice(day)) await expect(page.locator('body')).not.toContainText(body);
        await page.getByRole('button', { name: '开始评审', exact: true }).click();
        await expect(page.locator('time')).toHaveText('09:00');
        await expect(page.getByText(`累计得分：${dayIndex * 60} 分`, { exact: true })).toBeVisible();
        await page.getByRole('button', { name: '规则手册', exact: true }).click();
        const manual = page.getByRole('dialog', { name: '规则手册', exact: true });
        await expect(manual.getByText('生效中', { exact: true })).toHaveCount(day);
        await expect(manual.getByRole('heading', { name: /待解锁/ })).toHaveCount(5 - day);
        for (const index of [0, 1, 2, 3, 4]) {
          if (index < day) {
            await expect(manual.getByRole('heading', { name: `R${index + 1} · ${ruleTitles[index]}`, exact: true })).toBeVisible();
            await expect(manual).toContainText(ruleBodies[index]);
          } else {
            await expect(manual).not.toContainText(ruleTitles[index]);
            await expect(page.locator('body')).not.toContainText(ruleBodies[index]);
          }
        }
        await page.keyboard.press('Escape');
        await expect(page.getByRole('button', { name: '规则手册', exact: true })).toBeFocused();
        for (const [index, id] of ids.entries()) {
          await expect(page.getByRole('heading', { name: new RegExp(`^PR ${id}`) })).toBeVisible();
          await expect(page.getByLabel(`待审进度：第 ${index + 1} 份，共 6 份`)).toHaveText(`${index + 1}/6`);
          expect(seen).not.toContain(id);
          seen.push(id);
          const answer = answerKey[id];
          await submitDecision(page, answer.verdict, answer.evidenceSets[0] ?? []);
          const feedback = page.getByRole('region', { name: '裁决反馈', exact: true });
          await expect(feedback).toContainText('本题得分：10/10');
          if (id === 'd5-03' || id === 'd5-04') {
            await expect(feedback).toContainText('标准裁决：拒绝');
            await expect(feedback).toContainText('适用规则：R5');
            await expect(feedback.getByRole('link', { name: /信任.*隐藏/ })).toHaveAttribute('href', 'https://www.openwall.com/lists/oss-security/2024/03/29/4');
          }
          if (day === 5) {
            await expect(page.getByText('CI 通过', { exact: true })).toBeVisible();
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
          }
          if (index < 5) await nextReview(page);
        }
        await expect(page.locator('time')).toHaveText('18:00');
        await expect(page.getByRole('button', { name: '查看最终成绩', exact: true })).toHaveCount(0);
        await page.getByRole('button', { name: '查看日结', exact: true }).click();
        const summary = page.getByRole('region', { name: `第 ${day} 天日结`, exact: true });
        await expect(summary.getByRole('article')).toHaveCount(6);
        await expect(summary).toContainText('当日得分：60/60');
        if (day < 5) await page.getByRole('button', { name: '下一天', exact: true }).click();
        else {
          await expect(page.getByRole('button', { name: '下一天', exact: true })).toHaveCount(0);
          await expect(page.getByRole('region', { name: '最终成绩', exact: true })).toHaveCount(0);
          await page.getByRole('button', { name: '查看最终成绩', exact: true }).click();
        }
      }
      const final = page.getByRole('region', { name: '最终成绩', exact: true });
      await expect(final.getByRole('heading', { name: '最终成绩', exact: true })).toBeFocused();
      await expect(final.getByText('总得分：300/300', { exact: true })).toBeVisible();
      await expect(final).toContainText(`挑战种子：${seed}`);
      const records = final.getByRole('article');
      await expect(records).toHaveCount(30);
      for (const [index, id] of seen.entries()) {
        await expect(records.nth(index).getByRole('heading', { level: 3 })).toContainText(`PR ${id}`);
        await expect(records.nth(index)).toContainText('本题得分：10/10');
      }
      expect(new Set(seen).size).toBe(30);
      for (const name of ['下一天', '下一份', '提交裁决', '查看日结', '查看最终成绩']) {
        await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
      }
      await expect(page.locator('body')).not.toContainText('第 6 天');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(externalRequests).toEqual([]);
    });
  }
});
