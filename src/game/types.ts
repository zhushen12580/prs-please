export type Verdict = 'approve' | 'request_changes' | 'reject';

export interface Rule {
  id: string;
  unlockDay: number;
  title: string;
  body: string;
  examples: {
    approve: string;
    violation: string;
  };
  violationVerdict: Exclude<Verdict, 'approve'>;
}

// 简报只消费可展示的文案；完整内容校验由后续内容加载器负责。
export type BriefingRule = Pick<Rule, 'id' | 'title' | 'body' | 'examples'>;
