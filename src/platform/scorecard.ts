import type { Statistics } from '../game/score';

// 导出边界只接收最终统计，不接收题目、贡献者或玩家记录。
export interface ScorecardData {
  readonly seed: string;
  readonly contentVersion: string;
  readonly statistics: Readonly<Statistics>;
}

export function renderScorecard(data: ScorecardData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法生成成绩卡，请使用支持 Canvas 的浏览器重试。');

  const ink = '#302d29';
  const muted = '#655f55';
  const green = '#295844';
  const border = '#c9c2b6';
  const text = (value: string, x: number, y: number, size: number, color = ink, weight = 400, monospace = false) => {
    context.font = `${weight} ${size}px ${monospace ? 'ui-monospace, monospace' : 'system-ui, sans-serif'}`;
    context.fillStyle = color;
    context.fillText(value, x, y);
  };

  context.fillStyle = '#e9e5de';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#fffdf7';
  context.fillRect(32, 24, 1136, 582);
  context.strokeStyle = border;
  context.strokeRect(32, 24, 1136, 582);
  context.fillStyle = green;
  context.fillRect(32, 24, 1136, 8);
  text('开源维护者的五日值班 · 成绩单', 64, 76, 20, muted);
  text('PRs, Please', 64, 140, 54, ink, 700);

  context.save();
  context.translate(1008, 108);
  context.rotate(-0.08);
  context.strokeStyle = green;
  context.lineWidth = 3;
  context.strokeRect(-104, -36, 208, 72);
  text('值班完成', -72, 13, 34, green, 700);
  context.restore();

  context.fillStyle = border;
  context.fillRect(64, 168, 1072, 1);
  const totals = data.statistics;
  text('总得分', 64, 216, 23, muted);
  text(`${totals.points}/${totals.maxPoints}`, 64, 308, 82, green, 700, true);
  text('裁决正确', 800, 216, 23, muted);
  text(`${totals.correctVerdicts}/${totals.reviewed}`, 800, 302, 64, ink, 700, true);

  const metrics = [
    ['放入 bug／后门', totals.bugsMerged],
    ['违规合入', totals.violationsMerged],
    ['误伤好 PR', totals.goodPrsHarmed],
  ] as const;
  for (const [index, [label, value]] of metrics.entries()) {
    const x = 64 + index * 368;
    context.fillStyle = '#f0ede5';
    context.fillRect(x, 344, 336, 112);
    text(label, x + 20, 382, 23, muted);
    text(String(value), x + 20, 434, 42, ink, 700, true);
  }
  text(`挑战种子：${data.seed}`, 64, 518, 23, ink, 400, true);
  text(`内容版本：${data.contentVersion}`, 64, 560, 20, muted);
  return canvas;
}

export async function downloadScorecard(data: ScorecardData): Promise<void> {
  const canvas = renderScorecard(data);
  const blob = await new Promise<Blob>((resolve, reject) => {
    const failed = () => reject(new Error('成绩卡生成失败，请重试。'));
    try {
      canvas.toBlob((result) => result ? resolve(result) : failed(), 'image/png');
    } catch {
      failed();
    }
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = `prs-please-${data.seed}.png`;
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    // 让浏览器先接管下载，再释放本次导出的临时 URL。
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
