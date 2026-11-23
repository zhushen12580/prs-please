import { readFile } from 'node:fs/promises';
import { expect, test, type Download, type Page } from '@playwright/test';
import { answerKey } from '../fixtures/answer-key';
import { campaignOrders } from './helpers/campaign';
import { nextReview, readReviewId, showDaySummary, startReview, submitDecision } from './helpers/play';

async function finishCampaign(page: Page, seed: string, perfect: boolean): Promise<void> {
  await startReview(page, seed);
  for (let day = 1; day <= 5; day++) {
    for (let position = 0; position < 6; position++) {
      const id = await readReviewId(page);
      expect(id).toBe(campaignOrders[seed][day - 1][position]);
      const answer = answerKey[id];
      await submitDecision(page, perfect ? answer.verdict : 'approve', perfect ? answer.evidenceSets[0] ?? [] : []);
      if (position < 5) await nextReview(page);
    }
    await showDaySummary(page, day);
    await page.getByRole('button', { name: day === 5 ? '查看最终成绩' : '下一天', exact: true }).click();
    if (day < 5) await page.getByRole('button', { name: '开始评审', exact: true }).click();
  }
}

async function decodeDownload(page: Page, download: Download, seed: string): Promise<Buffer> {
  expect(download.suggestedFilename()).toBe(`prs-please-${seed}.png`);
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const decoded = await page.evaluate(async (png) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(png)], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let opaque = 0;
    let different = 0;
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 255) opaque++;
      if (data[i] !== data[0] || data[i + 1] !== data[1] || data[i + 2] !== data[2]) different++;
      if (data[i] < 170 && data[i + 1] < 170 && data[i + 2] < 170) ink++;
    }
    bitmap.close();
    return { width: canvas.width, height: canvas.height, opaque, different, ink };
  }, [...bytes]);
  expect(decoded.width).toBe(1200);
  expect(decoded.height).toBe(630);
  expect(decoded.opaque).toBe(1200 * 630);
  expect(decoded.different).toBeGreaterThan(20_000);
  expect(decoded.ink).toBeGreaterThan(5_000);
  return bytes;
}

test.describe('成绩卡下载', () => {
  test.setTimeout(90_000);

  for (const seed of ['maintainer-001', 'maintainer-002']) {
    test(`${seed}：UI 通关后真实 PNG 解码，重复与取消下载保持全部成绩和记录`, async ({ page }, testInfo) => {
      const perfect = seed === 'maintainer-001';
      if (!perfect) await page.setViewportSize({ width: 390, height: 844 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await finishCampaign(page, seed, perfect);
      const final = page.getByRole('region', { name: '最终成绩', exact: true });
      const statistics = final.locator('.summary-statistics');
      const records = final.getByRole('article');
      for (const text of perfect
        ? ['总得分：300/300', '裁决正确：30/30', '放入 bug／后门：0', '违规合入：0', '误伤好 PR：0']
        : ['总得分：110/300', '裁决正确：11/30', '放入 bug／后门：15', '违规合入：19', '误伤好 PR：0']) {
        await expect(statistics.getByText(text, { exact: true })).toBeVisible();
      }
      await expect(records).toHaveCount(30);
      const previous = { statistics: await statistics.innerText(), records: await records.allTextContents(),
        save: await page.evaluate(() => localStorage.getItem('prs-please.save.v1')) };
      const button = final.getByRole('button', { name: '下载成绩卡', exact: true });
      await expect(button).toBeVisible();
      const download = async () => {
        const pending = page.waitForEvent('download');
        await button.click();
        return pending;
      };
      const firstDownload = await download();
      await firstDownload.saveAs(testInfo.outputPath('scorecard.png'));
      const first = await decodeDownload(page, firstDownload, seed);
      const second = await decodeDownload(page, await download(), seed);
      expect(second.equals(first)).toBe(true);
      const cancelled = await download();
      await cancelled.cancel();
      await expect(button).toBeEnabled();
      expect(await statistics.innerText()).toBe(previous.statistics);
      expect(await records.allTextContents()).toEqual(previous.records);
      expect(await page.evaluate(() => localStorage.getItem('prs-please.save.v1'))).toBe(previous.save);
      await expect(records).toHaveCount(30);
      // 失败只发生在真实浏览器的导出边界；游戏进度依然只由 UI 产生。
      await page.evaluate(() => {
        const original = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function (callback) {
          HTMLCanvasElement.prototype.toBlob = original;
          callback(null);
        };
      });
      await button.click();
      await expect(final.getByRole('status', { name: '成绩卡下载状态' })).toHaveText('成绩卡生成失败，请重试。');
      await expect(button).toBeEnabled();
      await decodeDownload(page, await download(), seed);
      expect(await statistics.innerText()).toBe(previous.statistics);
      expect(await records.allTextContents()).toEqual(previous.records);
      expect(await page.evaluate(() => localStorage.getItem('prs-please.save.v1'))).toBe(previous.save);
      expect(errors).toEqual([]);
    });
  }

  test.describe('浏览器拒绝保存', () => {
    // 小 PNG 可能在 cancel() 到达前已下载完成；此场景确定地拒绝保存。
    test.use({ acceptDownloads: false });

    test('拒绝下载后仍保留成绩与 30 条复盘，不改变存档', async ({ page }) => {
      await finishCampaign(page, 'maintainer-001', true);
      const final = page.getByRole('region', { name: '最终成绩', exact: true });
      const statistics = final.locator('.summary-statistics');
      const records = final.getByRole('article');
      const previous = { statistics: await statistics.innerText(), records: await records.allTextContents(),
        save: await page.evaluate(() => localStorage.getItem('prs-please.save.v1')) };
      const pending = page.waitForEvent('download');
      const button = final.getByRole('button', { name: '下载成绩卡', exact: true });
      await button.click();
      const rejected = await pending;
      expect(rejected.suggestedFilename()).toBe('prs-please-maintainer-001.png');
      expect(await rejected.failure()).not.toBeNull();
      await expect(button).toBeEnabled();
      await expect(statistics.getByText('总得分：300/300', { exact: true })).toBeVisible();
      await expect(statistics.getByText('裁决正确：30/30', { exact: true })).toBeVisible();
      await expect(records).toHaveCount(30);
      expect(await statistics.innerText()).toBe(previous.statistics);
      expect(await records.allTextContents()).toEqual(previous.records);
      expect(await page.evaluate(() => localStorage.getItem('prs-please.save.v1'))).toBe(previous.save);
    });
  });
});
