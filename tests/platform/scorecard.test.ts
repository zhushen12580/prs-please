import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { campaign, cases, rules } from '../../src/content/load';
import type { GameState } from '../../src/game/types';
import { downloadScorecard, renderScorecard, type ScorecardData } from '../../src/platform/scorecard';
import { createFinalSummary } from '../../src/ui/summary';

const data: ScorecardData = {
  seed: 'maintainer-001', contentVersion: '1.0.0',
  statistics: { points: 125, maxPoints: 300, reviewed: 30, correctVerdicts: 17,
    bugsMerged: 7, violationsMerged: 9, goodPrsHarmed: 2 },
};

const context = {
  fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(),
  save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
};
const createObjectURL = vi.fn((_blob: Blob) => 'blob:scorecard');
const revokeObjectURL = vi.fn((_url: string) => {});

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['png'], { type: 'image/png' })));
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('本地成绩卡绘制与下载边界', () => {
  test('1200×630 画布绘制所有明确的字段和值，不改变输入', () => {
    const before = structuredClone(data);
    const canvas = renderScorecard(data);
    expect([canvas.width, canvas.height]).toEqual([1200, 630]);
    const texts = context.fillText.mock.calls.map(([text]) => text);
    for (const text of ['PRs, Please', '总得分', '125/300', '裁决正确', '17/30',
      '放入 bug／后门', '7', '违规合入', '9', '误伤好 PR', '2',
      '挑战种子：maintainer-001', '内容版本：1.0.0']) {
      expect(texts).toContain(text);
    }
    expect(data).toEqual(before);
  });

  test('满分与零分来自传入统计，32 字符种子完整绘制', () => {
    const seed = 'A'.repeat(32);
    renderScorecard({ ...data, seed, statistics: { points: 300, maxPoints: 300, reviewed: 30,
      correctVerdicts: 30, bugsMerged: 0, violationsMerged: 0, goodPrsHarmed: 0 } });
    expect(context.fillText.mock.calls.map(([text]) => text)).toEqual(expect.arrayContaining([
      '300/300', '30/30', '0', `挑战种子：${seed}`,
    ]));
    context.fillText.mockClear();
    renderScorecard({ ...data, statistics: { ...data.statistics, points: 0, correctVerdicts: 0 } });
    expect(context.fillText.mock.calls.map(([text]) => text)).toEqual(expect.arrayContaining(['0/300', '0/30']));
  });

  test('2D 上下文不可用时抛出可读错误且不创建下载', async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    await expect(downloadScorecard(data)).rejects.toThrow(/无法.*成绩卡/);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  test.each(['empty', 'throw'] as const)('toBlob %s 失败可重试，失败时不创建 URL', async (failure) => {
    const toBlob = vi.mocked(HTMLCanvasElement.prototype.toBlob);
    toBlob.mockImplementationOnce((callback) => {
      if (failure === 'throw') throw new DOMException('blocked', 'SecurityError');
      callback(null);
    });
    await expect(downloadScorecard(data)).rejects.toThrow('成绩卡生成失败，请重试。');
    expect(createObjectURL).not.toHaveBeenCalled();
    await downloadScorecard(data);
    expect(toBlob).toHaveBeenLastCalledWith(expect.any(Function), 'image/png');
    expect(createObjectURL).toHaveBeenCalledOnce();
    await vi.runAllTimersAsync();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:scorecard');
  });

  test('重复下载使用种子文件名，每次移除临时链接并延后释放自己的 URL', async () => {
    const before = structuredClone(data);
    const downloads: { name: string; url: string; attached: boolean }[] = [];
    vi.mocked(HTMLAnchorElement.prototype.click).mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ name: this.download, url: this.href, attached: this.isConnected });
    });
    createObjectURL.mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');
    await downloadScorecard(data);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await downloadScorecard({ ...data, seed: 'Another_Seed-2' });
    expect(downloads).toEqual([
      { name: 'prs-please-maintainer-001.png', url: 'blob:first', attached: true },
      { name: 'prs-please-Another_Seed-2.png', url: 'blob:second', attached: true },
    ]);
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    await vi.runAllTimersAsync();
    expect(revokeObjectURL.mock.calls).toEqual([['blob:first'], ['blob:second']]);
    expect(data).toEqual(before);
  });

  test('发起下载异常也会清理链接和对象 URL', async () => {
    vi.mocked(HTMLAnchorElement.prototype.click).mockImplementationOnce(() => { throw new Error('download blocked'); });
    await expect(downloadScorecard(data)).rejects.toThrow();
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
    await vi.runAllTimersAsync();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:scorecard');
  });
});

describe('最终成绩页下载入口', () => {
  test('异步导出时阻止重复点击，失败提示可读并允许重试，不修改成绩记录', async () => {
    const state: GameState = { seed: 'maintainer-001', contentVersion: '1.0.0', phase: 'final', day: 5, position: 5,
      records: [{ caseId: 'd1-02', verdict: 'reject', evidenceIds: ['disclosure'] }], draft: { verdict: null, evidenceIds: [] } };
    const before = structuredClone(state);
    let finish: BlobCallback | undefined;
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce((callback) => { finish = callback; });
    const final = createFinalSummary(state, { campaign, cases, rules });
    document.body.append(final);
    const button = [...final.querySelectorAll('button')].find((node) => node.textContent === '下载成绩卡');
    expect(button).toBeDefined();
    button!.click();
    expect(button!.disabled).toBe(true);
    button!.click();
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledOnce();
    finish!(null);
    await vi.runAllTimersAsync();
    const status = final.querySelector('[role="status"]');
    expect(status?.textContent).toBe('成绩卡生成失败，请重试。');
    expect(button!.disabled).toBe(false);
    button!.click();
    await vi.runAllTimersAsync();
    expect(button!.disabled).toBe(false);
    expect(context.fillText.mock.calls.map(([text]) => text)).toEqual(expect.arrayContaining(['0/10', '0/1', '误伤好 PR', '1']));
    expect(final.querySelectorAll('article')).toHaveLength(1);
    expect(final.textContent).toContain('总得分：0/10');
    expect(state).toEqual(before);
  });
});
