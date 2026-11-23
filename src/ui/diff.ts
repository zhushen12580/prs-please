import type { DiffFile } from '../game/types';
import { createEvidenceButton, type EvidenceSelection } from './materials';

function column(className: string, text: string, label?: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  if (label) span.setAttribute('aria-label', label);
  return span;
}

export function createDiff(files: readonly DiffFile[], selection: EvidenceSelection): HTMLElement {
  const diff = document.createElement('section');
  diff.className = 'diff';
  diff.setAttribute('aria-label', '统一差异');
  const heading = document.createElement('h3');
  heading.textContent = '统一差异';
  const legend = document.createElement('p');
  legend.className = 'field-hint';
  legend.id = 'diff-hint';
  legend.textContent = '+ 新增 · − 删除 · · 上下文；所有行均可选为证据。长代码可左右滚动，聚焦代码区后也可使用左右方向键。';
  diff.append(heading, legend);

  for (const file of files) {
    const card = document.createElement('article');
    card.className = 'diff-file';
    const filename = document.createElement('h4');
    filename.className = 'diff-filename';
    filename.textContent = file.path;
    const scroll = document.createElement('div');
    scroll.className = 'diff-scroll';
    scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', `${file.path} 差异`);
    scroll.setAttribute('aria-describedby', legend.id);

    const lines = document.createElement('div');
    lines.className = 'diff-lines';
    const labels = document.createElement('div');
    labels.className = 'diff-columns';
    labels.append(column('diff-old-line', '旧行'), column('diff-new-line', '新行'),
      column('diff-marker', '±'), column('diff-code-label', '代码'), column('evidence-state', '证据'));
    lines.append(labels);

    for (const line of file.lines) {
      const button = createEvidenceButton(line, selection);
      button.classList.add('diff-line', `diff-${line.kind}`);
      const marker = line.kind === 'add' ? '+' : line.kind === 'delete' ? '−' : '·';
      const kindLabel = line.kind === 'add' ? '新增' : line.kind === 'delete' ? '删除' : '上下文';
      const oldLine = line.oldLine === null ? '—' : String(line.oldLine);
      const newLine = line.newLine === null ? '—' : String(line.newLine);
      button.prepend(column('diff-old-line', oldLine, `旧行 ${oldLine}`),
        column('diff-new-line', newLine, `新行 ${newLine}`), column('diff-marker', marker, kindLabel));
      lines.append(button);
    }
    scroll.append(lines);
    card.append(filename, scroll);
    diff.append(card);
  }
  return diff;
}
