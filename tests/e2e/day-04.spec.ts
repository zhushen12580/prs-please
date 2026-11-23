import { expect, test, type Page } from '@playwright/test';
import { answerKey } from '../fixtures/answer-key';
import { nextReview, startReview, submitDecision } from './helpers/play';

const orders: Record<string, string[][]> = {
  'maintainer-001': [
    ['d1-02', 'd1-05', 'd1-04', 'd1-06', 'd1-03', 'd1-01'],
    ['d2-01', 'd2-02', 'd2-03', 'd2-04', 'd2-05', 'd2-06'],
    ['d3-05', 'd3-01', 'd3-02', 'd3-03', 'd3-06', 'd3-04'],
    ['d4-02', 'd4-06', 'd4-04', 'd4-05', 'd4-01', 'd4-03'],
  ],
  'maintainer-002': [
    ['d1-03', 'd1-01', 'd1-05', 'd1-02', 'd1-04', 'd1-06'],
    ['d2-02', 'd2-01', 'd2-05', 'd2-04', 'd2-03', 'd2-06'],
    ['d3-01', 'd3-06', 'd3-02', 'd3-04', 'd3-05', 'd3-03'],
    ['d4-02', 'd4-05', 'd4-01', 'd4-03', 'd4-04', 'd4-06'],
  ],
};

async function reachFourthDay(page: Page, seed = 'maintainer-001'): Promise<void> {
  await startReview(page, seed);
  for (const dayIndex of [0, 1, 2]) {
    for (const [index, id] of orders[seed][dayIndex].entries()) {
      await expect(page.getByRole('heading', { name: new RegExp(`^PR ${id}`) })).toBeVisible();
      const answer = answerKey[id];
      await submitDecision(page, answer.verdict, answer.evidenceSets[0] ?? []);
      if (index < 5) await nextReview(page);
    }
    await page.getByRole('button', { name: '查看日结', exact: true }).click();
    await expect(page.getByText('当日得分：60/60', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '下一天', exact: true }).click();
    await expect(page.getByRole('heading', { name: `第 ${dayIndex + 2} 天简报`, exact: true })).toBeFocused();
    if (dayIndex < 2) await page.getByRole('button', { name: '开始评审', exact: true }).click();
  }
}

test.describe('第四天测试完整性 · 逐日规则', () => {
  for (const [seed, mobile] of [['maintainer-001', false], ['maintainer-002', true]] as const) {
    test(`${seed} ${mobile ? '手机' : '桌面'}：正常维护可批准，键盘选择删除行及删增组合，累计 240 分`, async ({ page }) => {
      if (mobile) await page.setViewportSize({ width: 390, height: 844 });
      await reachFourthDay(page, seed);
      const briefing = page.getByRole('region', { name: '第 4 天简报', exact: true });
      await expect(briefing.getByRole('heading', { name: 'R4 · 保持相关测试的覆盖', exact: true })).toBeVisible();
      for (const text of ['今日新规则', 'R1、R2、R3', '保留相同用例和关键断言', '跳过失败的回归用例']) {
        await expect(briefing).toContainText(text);
      }
      await page.getByRole('button', { name: '开始评审', exact: true }).click();
      await expect(page.locator('time')).toHaveText('09:00');
      await expect(page.getByText('累计得分：180 分', { exact: true })).toBeVisible();

      for (const [index, id] of orders[seed][3].entries()) {
        await expect(page.getByRole('heading', { name: new RegExp(`^PR ${id}`) })).toBeVisible();
        await expect(page.getByText('第 4 天', { exact: true })).toBeVisible();
        await expect(page.getByLabel(`待审进度：第 ${index + 1} 份，共 6 份`)).toHaveText(`${index + 1}/6`);
        await expect(page.getByText(id === 'd4-06' ? 'CI 失败' : 'CI 通过', { exact: true })).toBeVisible();
        await expect(page.getByRole('link')).toHaveCount(0);
        const answer = answerKey[id];

        if (id === 'd4-03' || id === 'd4-05') {
          const deletedId = id === 'd4-03' ? 'fee-free-assertion' : 'rows-exact-assertion';
          const oldLine = id === 'd4-03' ? '6' : '7';
          const deleted = page.locator(`[data-evidence-id="${deletedId}"]`);
          await expect(deleted.locator('.diff-old-line')).toHaveText(oldLine);
          await expect(deleted.locator('.diff-new-line')).toHaveText('—');
          await expect(deleted.locator('.diff-marker')).toHaveText('−');
          await deleted.focus();
          await page.keyboard.press('Space');
          await expect(deleted).toHaveAttribute('aria-pressed', 'true');
          await expect(deleted).toContainText('已选');
          const before = await page.locator('time').textContent();
          await page.getByRole('button', { name: '规则手册', exact: true }).click();
          const manual = page.getByRole('dialog', { name: '规则手册', exact: true });
          await expect(manual.getByText('生效中', { exact: true })).toHaveCount(4);
          for (const text of ['R1 · CI 必须通过', 'R2 · 核对项目 API', 'R3 · 披露 AI 辅助', 'R4 · 保持相关测试的覆盖', 'R5 · 待解锁']) {
            await expect(manual).toContainText(text);
          }
          await expect(manual.getByRole('heading', { name: /待解锁/ })).toHaveCount(1);
          for (const text of ['拒绝隐藏后门', '不得引入隐藏执行、凭据外传或绕过验证的后门。']) {
            await expect(page.getByText(text, { exact: true })).toHaveCount(0);
          }
          await page.keyboard.press('Escape');
          await expect(page.getByRole('button', { name: '规则手册', exact: true })).toBeFocused();
          await expect(deleted).toHaveAttribute('aria-pressed', 'true');
          await expect(page.locator('time')).toHaveText(before ?? '');
          if (id === 'd4-05') {
            const added = page.locator('[data-evidence-id="rows-vacuous-assertion"]');
            await expect(added.locator('.diff-old-line')).toHaveText('—');
            await expect(added.locator('.diff-new-line')).toHaveText('7');
            await added.focus();
            await page.keyboard.press('Enter');
            await expect(added).toHaveAttribute('aria-pressed', 'true');
          }
          await page.getByRole('button', { name: '要求修改', exact: true }).focus();
          await page.keyboard.press('Enter');
          await page.getByRole('button', { name: '提交裁决', exact: true }).focus();
          await page.keyboard.press('Enter');
        } else {
          if (id === 'd4-01') await expect(page.getByRole('region', { name: '统一差异', exact: true })).toContainText('test.each');
          if (id === 'd4-02') await expect(page.locator('[data-evidence-id="isolation-unique-root"]')).toContainText('mkdtempSync');
          await submitDecision(page, answer.verdict, answer.evidenceSets[0] ?? []);
        }

        const feedback = page.getByRole('region', { name: '裁决反馈', exact: true });
        await expect(feedback).toContainText('本题得分：10/10');
        if (['d4-03', 'd4-04', 'd4-05'].includes(id)) {
          await expect(feedback).toContainText('适用规则：R4');
          await expect(feedback).toContainText('CI 通过');
          await expect(feedback).toContainText('覆盖');
        }
        if (id === 'd4-03') await expect(feedback).toContainText('旧行 6 / 新行 —');
        if (id === 'd4-05') {
          await expect(feedback).toContainText('旧行 7 / 新行 —');
          await expect(feedback).toContainText('旧行 — / 新行 7');
          await expect(feedback).toContainText('本组各项需同时选中');
        }
        if (id === 'd4-01' || id === 'd4-02') await expect(feedback).toContainText('标准裁决：批准');
        if (id === 'd4-01') {
          await expect(feedback.getByRole('link', { name: /测试/ })).toHaveAttribute('href', 'https://curl.se/dev/contribute.html');
          await expect(feedback).toContainText('虚构项目规则');
        }
        if (id === 'd4-06') await expect(feedback).toContainText('适用规则：R1');
        await expect(page.getByText(`累计得分：${190 + index * 10} 分`, { exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        if (index < 5) await nextReview(page);
      }

      await page.getByRole('button', { name: '查看日结', exact: true }).click();
      const summary = page.getByRole('region', { name: '第 4 天日结', exact: true });
      await expect(summary.getByRole('heading', { name: '第 4 天日结', exact: true })).toBeFocused();
      await expect(summary.getByRole('article')).toHaveCount(6);
      for (const [index, id] of orders[seed][3].entries()) await expect(summary.getByRole('article').nth(index)).toContainText(id);
      for (const text of ['当日得分：60/60', '裁决正确：6/6', '违规合入：0', '放入 bug／后门：0', '误伤好 PR：0']) {
        await expect(summary.getByText(text, { exact: true })).toBeVisible();
      }
      for (const prefix of ['d1-', 'd2-', 'd3-']) await expect(summary).not.toContainText(prefix);
      await expect(page.locator('time')).toHaveText('18:00');
      await expect(page.getByRole('button', { name: '下一天', exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }

  test('删增组合只选新增行、只看绿色或多选无关项均为 5 分，反馈给出完整证据', async ({ page }) => {
    await reachFourthDay(page);
    await page.getByRole('button', { name: '开始评审', exact: true }).click();
    const partial: Record<string, string[]> = {
      'd4-03': ['ci-fee'],
      'd4-04': ['archive-skipped-test', 'ci-archive'],
      'd4-05': ['rows-vacuous-assertion'],
    };
    for (const [index, id] of orders['maintainer-001'][3].entries()) {
      await expect(page.getByRole('heading', { name: new RegExp(`^PR ${id}`) })).toBeVisible();
      const answer = answerKey[id];
      await submitDecision(page, answer.verdict, partial[id] ?? answer.evidenceSets[0] ?? []);
      const feedback = page.getByRole('region', { name: '裁决反馈', exact: true });
      await expect(feedback).toContainText(`本题得分：${partial[id] ? 5 : 10}/10`);
      if (partial[id]) await expect(feedback).toContainText('裁决正确，但证据不完整或含无关项');
      if (id === 'd4-05') {
        await expect(feedback).toContainText('rows-exact-assertion');
        await expect(feedback).toContainText('rows-vacuous-assertion');
      }
      if (index < 5) await nextReview(page);
    }
    await expect(page.getByText('累计得分：225 分', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '查看日结', exact: true }).click();
    for (const text of ['当日得分：45/60', '裁决正确：6/6', '违规合入：0', '放入 bug／后门：0', '误伤好 PR：0']) {
      await expect(page.getByText(text, { exact: true })).toBeVisible();
    }
  });
});
