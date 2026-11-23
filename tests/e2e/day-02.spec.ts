import { expect, test, type Page } from '@playwright/test';
import { answerKey } from '../fixtures/answer-key';
import { nextReview, startReview, submitDecision } from './helpers/play';

const firstDayOrders: Record<string, string[]> = {
  'maintainer-001': ['d1-02', 'd1-05', 'd1-04', 'd1-06', 'd1-03', 'd1-01'],
  'maintainer-002': ['d1-03', 'd1-01', 'd1-05', 'd1-02', 'd1-04', 'd1-06'],
};

async function finishFirstDay(page: Page, seed = 'maintainer-001'): Promise<void> {
  await startReview(page, seed);
  for (const [index, id] of firstDayOrders[seed].entries()) {
    await expect(page.getByRole('heading', { name: new RegExp(`^PR ${id}`) })).toBeVisible();
    const answer = answerKey[id];
    await submitDecision(page, answer.verdict, answer.evidenceSets[0] ?? []);
    if (index < 5) await nextReview(page);
  }
  await page.getByRole('button', { name: '查看日结', exact: true }).click();
  await expect(page.getByText('当日得分：60/60', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '下一天', exact: true }).click();
  await expect(page.getByRole('heading', { name: '第 2 天简报', exact: true })).toBeFocused();
}

test.describe('第二天API查证 · 逐日规则', () => {
  test('通过第一天后解锁 R2，API 资料与证据保持，R1 继续生效，十二题全对 120 分', async ({ page }) => {
    await finishFirstDay(page);
    const briefing = page.getByRole('region', { name: '第 2 天简报', exact: true });
    await expect(briefing.getByRole('heading', { name: 'R2 · 核对项目 API', exact: true })).toBeVisible();
    await expect(briefing).toContainText('今日新规则');
    await expect(briefing).toContainText('先等待结果再读取游标');
    await expect(briefing).toContainText('即使 CI 通过，也应要求修改');
    await expect(briefing).toContainText('R1');
    await page.getByRole('button', { name: '开始评审', exact: true }).click();
    await expect(page.locator('time')).toHaveText('09:00');
    await expect(page.getByText('累计得分：60 分', { exact: true })).toBeVisible();

    const ids = ['d2-01', 'd2-02', 'd2-03', 'd2-04', 'd2-05', 'd2-06'];
    const times = ['10:30', '12:00', '13:30', '15:00', '16:30', '18:00'];
    for (const [index, id] of ids.entries()) {
      await expect(page.getByRole('heading', { name: new RegExp(`^PR ${id}`) })).toBeVisible();
      await expect(page.getByLabel(`待审进度：第 ${index + 1} 份，共 6 份`)).toHaveText(`${index + 1}/6`);
      await expect(page.getByText('第 2 天', { exact: true })).toBeVisible();
      const api = page.getByRole('region', { name: 'API 参考', exact: true });
      if (index >= 1 && index <= 4) await expect(api).toBeVisible();
      else await expect(api).toHaveCount(0);
      await expect(page.getByText(index === 5 ? 'CI 失败' : 'CI 通过', { exact: true })).toBeVisible();

      if (id === 'd2-03') {
        const evidence = page.locator('[data-evidence-id="path-invented-call"]');
        await evidence.focus();
        await page.keyboard.press('Space');
        await api.scrollIntoViewIfNeeded();
        await expect(api).toContainText('不存在 canonicalize');
        await expect(evidence).toHaveAttribute('aria-pressed', 'true');
        await page.getByRole('button', { name: '规则手册', exact: true }).click();
        const manual = page.getByRole('dialog', { name: '规则手册', exact: true });
        await expect(manual.getByText('生效中', { exact: true })).toHaveCount(2);
        await expect(manual).toContainText('R1 · CI 必须通过');
        await expect(manual).toContainText('R2 · 核对项目 API');
        for (const [ruleId, body] of [
          ['R3', '使用 AI 辅助必须在 PR 描述的披露栏说明。'],
          ['R4', '不得删除或削弱相关测试来制造 CI 通过。'],
          ['R5', '不得引入隐藏执行、凭据外传或绕过验证的后门。'],
        ]) {
          await expect(manual).toContainText(`${ruleId} · 待解锁`);
          await expect(page.getByText(body, { exact: true })).toHaveCount(0);
        }
        await page.keyboard.press('Escape');
        await expect(page.getByRole('button', { name: '规则手册', exact: true })).toBeFocused();
        await expect(evidence).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('time')).toHaveText('12:00');
      }
      const answer = answerKey[id];
      await submitDecision(page, answer.verdict, id === 'd2-03' ? [] : answer.evidenceSets[0] ?? []);
      const feedback = page.getByRole('region', { name: '裁决反馈', exact: true });
      await expect(feedback).toContainText('本题得分：10/10');
      if (index >= 2) await expect(feedback).toContainText(index === 5 ? '适用规则：R1' : '适用规则：R2');
      await expect(page.locator('time')).toHaveText(times[index]);
      await expect(page.getByText(`累计得分：${70 + index * 10} 分`, { exact: true })).toBeVisible();
      if (index < 5) await nextReview(page);
    }
    await page.getByRole('button', { name: '查看日结', exact: true }).click();
    const summary = page.getByRole('region', { name: '第 2 天日结', exact: true });
    await expect(summary.getByRole('article')).toHaveCount(6);
    for (const [index, id] of ids.entries()) await expect(summary.getByRole('article').nth(index)).toContainText(id);
    for (const text of ['当日得分：60/60', '裁决正确：6/6', '违规合入：0', '放入 bug／后门：0', '误伤好 PR：0']) {
      await expect(summary.getByText(text, { exact: true })).toBeVisible();
    }
    await expect(summary).not.toContainText('d1-');
    await expect(page.getByRole('button', { name: '下一天', exact: true })).toBeVisible();
  });

  test('手机与另一种子只改变日内顺序，全部批准会放入三份 API bug 和一份 CI bug', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await finishFirstDay(page, 'maintainer-002');
    await page.getByRole('button', { name: '开始评审', exact: true }).click();
    const ids = ['d2-02', 'd2-01', 'd2-05', 'd2-04', 'd2-03', 'd2-06'];
    for (const [index, id] of ids.entries()) {
      await expect(page.getByRole('heading', { name: new RegExp(`^PR ${id}`) })).toBeVisible();
      if (id !== 'd2-01' && id !== 'd2-06') {
        await expect(page.getByRole('region', { name: 'API 参考', exact: true })).toBeVisible();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await submitDecision(page, 'approve');
      await expect(page.getByRole('region', { name: '裁决反馈', exact: true }))
        .toContainText(`本题得分：${index < 2 ? 10 : 0}/10`);
      if (index < 5) await nextReview(page);
    }
    await expect(page.getByText('累计得分：80 分', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '查看日结', exact: true }).click();
    for (const text of ['当日得分：20/60', '裁决正确：2/6', '违规合入：4', '放入 bug／后门：4', '误伤好 PR：0']) {
      await expect(page.getByText(text, { exact: true })).toBeVisible();
    }
    await expect(page.locator('time')).toHaveText('18:00');
    await expect(page.getByRole('button', { name: '下一天', exact: true })).toBeVisible();
  });
});
