import { readFile } from 'node:fs/promises';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { answerKey } from '../fixtures/answer-key';
import { campaignOrders } from './helpers/campaign';
import { nextReview, readReviewId, showDaySummary, submitDecision } from './helpers/play';

const site = new URL(process.env.PRS_PLEASE_BASE ?? '/prs-please/', 'http://127.0.0.1:4173');

async function auditNetwork(context: BrowserContext, page: Page) {
  const externalRequests: string[] = [];
  const requests: string[] = [];
  const failedRequests: string[] = [];
  const errors: string[] = [];
  const responses: { url: string; status: number; type: string; contentType: string }[] = [];

  // 从首次导航前阻断外站；不能只忽略失败，让隐含外部依赖漏过验收。
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== site.origin) {
      externalRequests.push(url.href);
      await route.abort('blockedbyclient');
    } else {
      await route.continue();
    }
  });
  context.on('request', (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url());
  });
  context.on('requestfailed', (request) => {
    failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`);
  });
  context.on('response', (response) => {
    responses.push({ url: response.url(), status: response.status(),
      type: response.request().resourceType(), contentType: response.headers()['content-type'] ?? '' });
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  return {
    requests,
    assertHealthy() {
      expect(externalRequests, '不应尝试请求外站，包括可选字体、遥测或来源预览').toEqual([]);
      expect(failedRequests, '资源请求均应成功').toEqual([]);
      expect(errors, '控制台与页面脚本无错误').toEqual([]);
      expect(requests.length).toBeGreaterThan(0);
      for (const url of requests) {
        expect(new URL(url).origin).toBe(site.origin);
        expect(new URL(url).pathname.startsWith(site.pathname), url).toBe(true);
      }
      for (const response of responses) {
        expect(response.status, response.url).toBeGreaterThanOrEqual(200);
        expect(response.status, response.url).toBeLessThan(400);
      }
      // MIME 也要正确，避免把 SPA fallback 返回的 HTML 误当成成功的 JS/CSS。
      for (const [type, mime] of [['document', /text\/html/], ['script', /javascript/], ['stylesheet', /text\/css/]] as const) {
        const resources = responses.filter((response) => response.type === type);
        expect(resources.length, `必须实际加载 ${type}`).toBeGreaterThan(0);
        for (const resource of resources) expect(resource.contentType, resource.url).toMatch(mime);
      }
      expect(context.pages()).toHaveLength(1);
    },
  };
}

test('构建子路径：静态 HTML、JS、CSS 从指定路径加载，评审与刷新继续保持根 HTML 地址', async ({ context, page }) => {
  const network = await auditNetwork(context, page);
  const response = await page.goto('./');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'PRs, Please', exact: true })).toBeVisible();
  await expect(page).toHaveURL(site.href);
  await page.getByRole('button', { name: '开始值班', exact: true }).click();
  await expect(page.getByRole('heading', { name: '第 1 天简报', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '开始评审', exact: true }).click();
  expect(await readReviewId(page)).toBe('d1-02');
  await submitDecision(page, 'approve');
  await expect(page.getByText('累计得分：10 分', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(site.href);

  const reloaded = await page.reload();
  expect(reloaded?.status()).toBe(200);
  expect(reloaded?.request().url()).toBe(site.href);
  await page.getByRole('button', { name: '继续值班', exact: true }).click();
  expect(await readReviewId(page)).toBe('d1-02');
  await expect(page.getByRole('button', { name: '提交裁决', exact: true })).toBeDisabled();
  await expect(page.getByText('累计得分：10 分', { exact: true })).toBeVisible();
  await nextReview(page);
  expect(await readReviewId(page)).toBe('d1-05');
  await submitDecision(page, 'request_changes', ['ci-type-failure']);
  await expect(page.getByText('累计得分：20 分', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(site.href);
  expect(network.requests.filter((url) => new URL(url).pathname === site.pathname)).toHaveLength(2);
  network.assertHealthy();
});

test('无外部服务：拒绝所有外站请求仍可完整五天、阅读 30 条复盘和下载本地 PNG', async ({ context, page }, testInfo) => {
  test.setTimeout(90_000);
  const network = await auditNetwork(context, page);
  await page.goto('./');
  await expect(page.getByRole('heading', { name: '轮到你值班了。', exact: true })).toBeVisible();
  const startupRequests = [...network.requests];
  await page.getByRole('button', { name: '开始值班', exact: true }).click();
  for (const [dayIndex, ids] of campaignOrders['maintainer-001'].entries()) {
    await page.getByRole('button', { name: '开始评审', exact: true }).click();
    for (const [index, id] of ids.entries()) {
      expect(await readReviewId(page)).toBe(id);
      const answer = answerKey[id];
      await submitDecision(page, answer.verdict, answer.evidenceSets[0] ?? []);
      if (index < 5) await nextReview(page);
    }
    await showDaySummary(page, dayIndex + 1);
    await page.getByRole('button', { name: dayIndex === 4 ? '查看最终成绩' : '下一天', exact: true }).click();
    await expect(page).toHaveURL(site.href);
  }

  const final = page.getByRole('region', { name: '最终成绩', exact: true });
  for (const text of ['总得分：300/300', '裁决正确：30/30', '放入 bug／后门：0', '违规合入：0', '误伤好 PR：0']) {
    await expect(final.getByText(text, { exact: true })).toBeVisible();
  }
  const records = final.getByRole('article');
  await expect(records).toHaveCount(30);
  for (const [index, id] of campaignOrders['maintainer-001'].flat().entries()) {
    const record = records.nth(index);
    await expect(record.getByRole('heading', { level: 3 })).toContainText(`PR ${id} ·`);
    await expect(record.getByRole('heading', { name: '判题解释', exact: true }).locator('+ p')).toHaveText(/\S/);
  }
  await records.last().scrollIntoViewIfNeeded();
  await expect(records.last().getByRole('heading', { name: '判题解释', exact: true })).toBeVisible();
  // 来源是用户主动打开的普通外链，不应自动抓取、预览或另开窗口。
  const sources = final.getByRole('link');
  expect(await sources.count()).toBeGreaterThanOrEqual(30);
  for (const source of await sources.all()) {
    await expect(source).toHaveAttribute('href', /^https:\/\//);
    await expect(source).toHaveAttribute('rel', 'noopener noreferrer');
  }

  const pending = page.waitForEvent('download');
  await final.getByRole('button', { name: '下载成绩卡', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('prs-please-maintainer-001.png');
  expect(await download.failure()).toBeNull();
  const outputPath = testInfo.outputPath('self-contained-scorecard.png');
  await download.saveAs(outputPath);
  const png = await readFile(outputPath);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const decoded = await page.evaluate(async (bytes) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const drawing = canvas.getContext('2d')!;
    drawing.drawImage(bitmap, 0, 0);
    const { data } = drawing.getImageData(0, 0, canvas.width, canvas.height);
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 170 && data[i + 1] < 170 && data[i + 2] < 170 && data[i + 3] === 255) ink++;
    }
    bitmap.close();
    return { width: canvas.width, height: canvas.height, ink };
  }, [...png]);
  expect(decoded.width).toBe(1200);
  expect(decoded.height).toBe(630);
  expect(decoded.ink).toBeGreaterThan(5_000);
  await expect(records).toHaveCount(30);
  expect(network.requests, '首次静态资源加载后，游戏、复盘和导出不再发起 HTTP 请求').toEqual(startupRequests);
  network.assertHealthy();
});
