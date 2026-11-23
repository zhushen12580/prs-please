import type { ReviewCase, Rule } from '../game/types';
import { createDiff } from './diff';
import { createManual } from './manual';
import { createMaterials, type EvidenceSelection } from './materials';

interface ReviewOptions {
  reviewCase: ReviewCase;
  day: number;
  position: number;
  total: number;
  time: string;
  rules: readonly Rule[];
  initialEvidenceIds?: readonly string[];
  locked?: boolean;
  decision?: HTMLElement;
  feedback?: HTMLElement;
  onEvidenceChange?: (ids: readonly string[]) => void;
}

export function createReview(options: ReviewOptions): HTMLElement {
  const { reviewCase, day, position, total, time, rules } = options;
  const review = document.createElement('section');
  review.className = 'review';
  review.setAttribute('aria-labelledby', 'review-title');
  const toolbar = document.createElement('div');
  toolbar.className = 'review-toolbar';
  const dayLabel = document.createElement('p');
  dayLabel.textContent = `第 ${day} 天`;
  const progress = document.createElement('p');
  progress.textContent = `${position}/${total}`;
  progress.setAttribute('aria-label', `待审进度：第 ${position} 份，共 ${total} 份`);
  const clock = document.createElement('time');
  clock.dateTime = time;
  clock.textContent = time;
  clock.setAttribute('aria-label', `工作时钟 ${time}`);
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'secondary-button';
  trigger.textContent = '规则手册';
  trigger.setAttribute('aria-haspopup', 'dialog');
  const manual = createManual(rules, day);
  trigger.addEventListener('click', () => {
    manual.showModal();
    manual.focus();
  });
  manual.addEventListener('close', () => trigger.focus());
  toolbar.append(dayLabel, progress, clock, trigger);

  const title = document.createElement('h2');
  title.id = 'review-title';
  title.tabIndex = -1;
  title.textContent = `PR ${reviewCase.id} · ${reviewCase.title}`;
  const hint = document.createElement('p');
  hint.className = 'field-hint';
  hint.textContent = '点击材料或代码行标出证据，再次点击取消；键盘可用 Enter 或空格切换。阅读和选择不会推进工作时钟。';
  const status = document.createElement('p');
  status.className = 'evidence-summary';
  status.setAttribute('role', 'status');
  const selected = new Set(options.initialEvidenceIds);
  status.textContent = `已选证据：${selected.size} 项`;

  const selection: EvidenceSelection = {
    selected,
    locked: options.locked,
    onToggle: (id) => {
      if (options.locked) return;
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      status.textContent = `已选证据：${selected.size} 项`;
      options.onEvidenceChange?.([...selected]);
    },
  };
  const layout = document.createElement('div');
  layout.className = 'review-layout';
  layout.append(createMaterials(reviewCase, selection), createDiff(reviewCase.files, selection));
  review.append(toolbar, title, hint, status);
  if (options.feedback) review.append(options.feedback);
  review.append(layout);
  if (options.decision) review.append(options.decision);
  review.append(manual);
  return review;
}
