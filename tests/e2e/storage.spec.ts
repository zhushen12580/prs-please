import { expect, test, type Page } from '@playwright/test';
import { answerKey } from '../fixtures/answer-key';
import { campaignOrders } from './helpers/campaign';
import { nextReview, readReviewId, showDaySummary, startReview, submitDecision } from './helpers/play';

const key = 'prs-please.save.v1';

async function readSave(page: Page) {
  return page.evaluate((saveKey) => {
    const raw = localStorage.getItem(saveKey);
    return raw === null ? null : JSON.parse(raw);
  }, key);
}

async function reloadAndContinue(page: Page): Promise<void> {
  await page.reload();
  await expect(page.getByRole('heading', { name: '轮到你值班了。', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '裁决反馈', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '继续值班', exact: true }).click();
}

test.describe('存档与降级 · 正常存档', () => {
  test('初次加载没有继续入口；开始后刷新只显示首页，继续回到原种子简报', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('button', { name: '继续值班', exact: true })).toHaveCount(0);
    expect(await readSave(page)).toBeNull();
    await page.getByLabel('挑战种子').fill('  maintainer-002  ');
    await page.getByRole('button', { name: '开始值班', exact: true }).click();
    expect(await readSave(page)).toEqual({ saveVersion: 1, contentVersion: '1.0.0', seed: 'maintainer-002',
      phase: 'briefing', day: 1, position: 0, records: [], draft: { verdict: null, evidenceIds: [] } });
    await reloadAndContinue(page);
    await expect(page.getByRole('heading', { name: '第 1 天简报', exact: true })).toBeFocused();
    await expect(page.getByText('maintainer-002', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '开始评审', exact: true }).click();
    expect(await readReviewId(page)).toBe('d1-03');
    expect((await readSave(page)).phase).toBe('review');
  });

  test('手机完成两次裁决后恢复第三题资料、证据和裁决草稿，假总分无效且覆盖仍需确认', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startReview(page);
    expect(await readSave(page)).not.toBeNull();
    await submitDecision(page, 'approve');
    await nextReview(page);
    await submitDecision(page, 'request_changes', ['ci-type-failure']);
    await nextReview(page);
    expect(await readReviewId(page)).toBe('d1-04');
    await page.locator('[data-evidence-id="ci-timezone-failure"]').click();
    expect((await readSave(page)).draft).toEqual({ verdict: null, evidenceIds: ['ci-timezone-failure'] });
    await page.getByRole('button', { name: '要求修改', exact: true }).click();
    const saved = await readSave(page);
    expect(saved.records).toHaveLength(2);
    expect(saved.draft).toEqual({ verdict: 'request_changes', evidenceIds: ['ci-timezone-failure'] });
    const materials = await page.getByRole('heading', { name: /^PR d1-04 ·/ }).locator('..').innerText();
    for (const field of ['points', 'statistics', 'time', 'queue']) expect(saved).not.toHaveProperty(field);
    // 只向由 UI 产生的合法存档附加假派生字段，不注入评审或通关状态。
    await page.evaluate((saveKey) => {
      const save = JSON.parse(localStorage.getItem(saveKey)!);
      localStorage.setItem(saveKey, JSON.stringify({ ...save, points: 9999, time: '18:00', queue: ['d5-04'] }));
    }, key);
    await reloadAndContinue(page);
    expect(await readReviewId(page)).toBe('d1-04');
    await expect(page.getByRole('heading', { name: /^PR d1-04 ·/ }).locator('..')).toHaveText(materials, { useInnerText: true });
    await expect(page.getByLabel('待审进度：第 3 份，共 6 份')).toHaveText('3/6');
    await expect(page.locator('time')).toHaveText('12:00');
    await expect(page.getByText('累计得分：20 分', { exact: true })).toBeVisible();
    await expect(page.locator('[data-evidence-id="ci-timezone-failure"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: '要求修改', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: '提交裁决', exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: '返回首页', exact: true }).click();
    await page.getByLabel('挑战种子').fill('maintainer-002');
    await page.getByRole('button', { name: '重新开始', exact: true }).click();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    expect((await readSave(page)).seed).toBe('maintainer-001');
    await reloadAndContinue(page);
    await expect(page.getByText('累计得分：20 分', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '提交裁决', exact: true }).click();
    await expect(page.getByText('累计得分：30 分', { exact: true })).toBeVisible();
    expect((await readSave(page)).records).toHaveLength(3);
    await page.getByRole('button', { name: '返回首页', exact: true }).click();
    await page.getByLabel('挑战种子').fill('maintainer-002');
    await page.getByRole('button', { name: '重新开始', exact: true }).click();
    await page.getByRole('button', { name: '确认覆盖', exact: true }).click();
    expect((await readSave(page)).records).toEqual([]);
    await reloadAndContinue(page);
    await expect(page.getByText('maintainer-002', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '开始评审', exact: true }).click();
    await expect(page.getByText('累计得分：0 分', { exact: true })).toBeVisible();
    expect(await readReviewId(page)).toBe('d1-03');
  });

  test('反馈重复刷新后仍锁定，重放提交不会改变记录数、得分或时钟', async ({ page }) => {
    await startReview(page);
    await submitDecision(page, 'approve');
    const saved = await readSave(page);
    expect(saved?.phase).toBe('feedback');
    expect(saved.records).toEqual([{ caseId: 'd1-02', verdict: 'approve', evidenceIds: [] }]);
    for (let attempt = 0; attempt < 2; attempt++) {
      await reloadAndContinue(page);
      expect(await readReviewId(page)).toBe('d1-02');
      await expect(page.getByRole('region', { name: '裁决反馈', exact: true })).toContainText('本题得分：10/10');
      await expect(page.getByRole('button', { name: '提交裁决', exact: true })).toBeDisabled();
      await expect(page.getByRole('button', { name: '批准', exact: true })).toBeDisabled();
      await expect(page.locator('[data-evidence-id="disclosure"]')).toBeDisabled();
      await page.getByRole('button', { name: '提交裁决', exact: true }).evaluate((button) => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await expect(page.getByText('累计得分：10 分', { exact: true })).toBeVisible();
      await expect(page.locator('time')).toHaveText('10:30');
      expect(await readSave(page)).toEqual(saved);
    }
    await nextReview(page);
    expect(await readReviewId(page)).toBe('d1-05');
    expect((await readSave(page)).draft).toEqual({ verdict: null, evidenceIds: [] });
  });

  test('日结、跨日简报和最终阶段均可刷新继续，30 条记录与满分复盘保持一致', async ({ page }) => {
    test.setTimeout(90_000);
    await startReview(page);
    for (const [dayIndex, ids] of campaignOrders['maintainer-001'].entries()) {
      const day = dayIndex + 1;
      for (const [index, id] of ids.entries()) {
        expect(await readReviewId(page)).toBe(id);
        const answer = answerKey[id];
        await submitDecision(page, answer.verdict, answer.evidenceSets[0] ?? []);
        if (index < 5) await nextReview(page);
      }
      const summary = await showDaySummary(page, day);
      const details = await summary.innerText();
      expect((await readSave(page))?.phase).toBe('daySummary');
      await reloadAndContinue(page);
      await expect(page.getByRole('region', { name: `第 ${day} 天日结`, exact: true })).toHaveText(details, { useInnerText: true });
      await expect(page.locator('time')).toHaveText('18:00');
      expect((await readSave(page)).records).toHaveLength(day * 6);
      if (day < 5) {
        await page.getByRole('button', { name: '下一天', exact: true }).click();
        expect((await readSave(page)).phase).toBe('briefing');
        await reloadAndContinue(page);
        await expect(page.getByRole('heading', { name: `第 ${day + 1} 天简报`, exact: true })).toBeFocused();
        await page.getByRole('button', { name: '开始评审', exact: true }).click();
        await expect(page.locator('time')).toHaveText('09:00');
        await expect(page.getByText(`累计得分：${day * 60} 分`, { exact: true })).toBeVisible();
      }
    }
    await page.getByRole('button', { name: '查看最终成绩', exact: true }).click();
    const final = page.getByRole('region', { name: '最终成绩', exact: true });
    const details = await final.innerText();
    expect((await readSave(page)).phase).toBe('final');
    await reloadAndContinue(page);
    await expect(final).toHaveText(details, { useInnerText: true });
    await expect(final.getByText('总得分：300/300', { exact: true })).toBeVisible();
    await expect(final.getByText('裁决正确：30/30', { exact: true })).toBeVisible();
    await expect(final.getByRole('article')).toHaveCount(30);
    const records = (await readSave(page)).records;
    expect(records.map((record: { caseId: string }) => record.caseId)).toEqual(campaignOrders['maintainer-001'].flat());
    expect(new Set(records.map((record: { caseId: string }) => record.caseId)).size).toBe(30);
  });
});
