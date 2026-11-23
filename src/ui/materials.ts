import type { EvidenceEntry, ReviewCase } from '../game/types';

export interface EvidenceSelection {
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
}

// 资料和 diff 共用同一种选择控件，证据身份来自内容 ID。
export function createEvidenceButton(entry: EvidenceEntry, selection: EvidenceSelection, emptyText = ''): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'evidence-button';
  button.dataset.evidenceId = entry.id;

  const text = document.createElement('span');
  text.className = 'evidence-text';
  text.textContent = entry.text || emptyText;
  const state = document.createElement('span');
  state.className = 'evidence-state';

  const update = () => {
    const selected = selection.selected.has(entry.id);
    button.setAttribute('aria-pressed', String(selected));
    state.textContent = selected ? '已选' : '未选';
  };
  button.addEventListener('click', () => {
    selection.onToggle(entry.id);
    update();
  });
  update();
  button.append(text, state);
  return button;
}

function materialSection(title: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'material-card';
  section.setAttribute('aria-label', title);
  const heading = document.createElement('h3');
  heading.textContent = title;
  section.append(heading);
  return section;
}

export function createMaterials(reviewCase: ReviewCase, selection: EvidenceSelection): HTMLElement {
  const materials = document.createElement('aside');
  materials.className = 'materials';
  materials.setAttribute('aria-label', 'PR 材料');

  const description = materialSection('PR 描述');
  const summary = document.createElement('p');
  summary.textContent = reviewCase.description.summary;
  const disclosureLabel = document.createElement('h4');
  disclosureLabel.className = 'disclosure-label';
  disclosureLabel.textContent = 'AI 辅助披露';
  description.append(summary, disclosureLabel, createEvidenceButton(reviewCase.description.disclosure, selection, '（未填写）'));

  const contributor = materialSection('贡献者（虚构）');
  const name = document.createElement('p');
  name.textContent = reviewCase.contributor.name;
  const handle = document.createElement('p');
  handle.className = 'contributor-handle';
  handle.textContent = reviewCase.contributor.handle;
  contributor.append(name, handle);

  const tools = materialSection('投稿工具记录');
  for (const record of reviewCase.contributor.toolRecords) tools.append(createEvidenceButton(record, selection));

  const ci = materialSection('CI 日志');
  const status = document.createElement('p');
  status.className = `ci-status ci-${reviewCase.ci.status}`;
  status.textContent = reviewCase.ci.status === 'passed' ? 'CI 通过' : 'CI 失败';
  ci.append(status);
  for (const log of reviewCase.ci.logs) ci.append(createEvidenceButton(log, selection));

  materials.append(description, contributor, tools, ci);
  if (reviewCase.apiReference?.length) {
    const api = materialSection('API 参考');
    for (const reference of reviewCase.apiReference) {
      const heading = document.createElement('h4');
      heading.textContent = reference.name;
      const signature = document.createElement('code');
      signature.className = 'api-signature';
      signature.textContent = reference.signature;
      const notes = document.createElement('p');
      notes.textContent = reference.notes;
      api.append(heading, signature, notes);
    }
    materials.append(api);
  }
  return materials;
}
