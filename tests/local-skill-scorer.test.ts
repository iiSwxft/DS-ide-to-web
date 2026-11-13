// T4 local Skill activation scoring unit tests.
// Covers: five selectImplicitSkill cases (applicable-scenario hit / inapplicable-scenario hit / no relevance / two weak candidates blocked by the dual gate / high name+description score),
// plus the exact components of scoreLocalSkill / scenarioAdjustment.
//
// NOTE: the Chinese strings used as queries and Skill descriptions throughout this file (e.g. "weekly report", "applicable scenario" headings) are
// intentional test INPUT: the scorer's Chinese tokenization, 2-gram matching, common-word gate and scenario-block extraction are Chinese-specific logic.
//
// Key semantics (from local-skill-scoring-spec.md §3 / §3.4 / §3.5):
//   - normalizeSearchText = NFKC + lowercase + trim; tokenize splits on \p{L}\p{N}_- (a whole Chinese sentence becomes a single token).
//   - Whole-string hit: name +800 / desc +400 / cat +200; per-token hit: name +100 / desc +40 / cat +60.
//   - scenarioAdjustment: applicable-scenario hit (coverage >= 0.6) -> dynamic bonus (round(cov*100), capped at +100); inapplicable-scenario hit -1000.
//   - P1-B common-word gate: a query made up only of <= 2 common two-character words -> not activated.
//   - P1-B fix 3: the description whole-string +400 is only granted when the normalized whole query length is >= 3 (2-character queries no longer get +400).
//   - Dual threshold gate: top score >= 100 and top score >= runner-up + 50, otherwise return null.

import { describe, expect, it } from 'vitest';
import {
  type LocalSkillIndex,
  extractScenarioBlock,
  scenarioAdjustment,
  scoreLocalSkill,
  selectImplicitSkill,
} from '../core/skill/local-skill-scorer';

function index(name: string, description: string, skillDir = '/skills/x'): LocalSkillIndex {
  return { name, description, skillDir };
}

describe('scenarioAdjustment', () => {
  it('applicable-scenario hit (coverage >= 0.6) -> dynamic bonus (F0-A, capped at +100)', () => {
    // Query 2-gram ("weekly report") hits the applicable-scenario text 100% -> coverage=1.0 -> round(100)=100 (not a fixed +300).
    expect(scenarioAdjustment('适用场景：生成周报、日报、总结', '周报', ['周报'])).toBe(100);
  });

  it('partial applicable-scenario hit (coverage < 0.6) -> no bonus', () => {
    // Only 1/3 of the query 2-grams hit the applicable-scenario text -> coverage≈0.33 < 0.6 -> returns 0 (avoids false bonus at weak granularity).
    expect(scenarioAdjustment('适用场景：生成周报、月报、季报', '周报 年报', ['周报', '年报'])).toBe(0);
  });

  it('inapplicable / disabled-scenario hit -> -1000', () => {
    expect(scenarioAdjustment('通用写作助手。禁用场景：写周报', '周报', ['周报'])).toBe(-1000);
    expect(scenarioAdjustment('不适用场景：写周报', '周报', ['周报'])).toBe(-1000);
  });

  it('no scenario annotation -> 0', () => {
    expect(scenarioAdjustment('普通描述，与周报无关', '周报', ['周报'])).toBe(0);
  });
});

describe('scoreLocalSkill', () => {
  it('per-token name hits + whole-string description hit accumulate', () => {
    // Name weekly-report contains tokens weekly/report at +100 each; the description whole-string hit "weekly report" is +400 and each token +40.
    const score = scoreLocalSkill(
      index('weekly-report', 'Generate weekly report and summary'),
      'weekly report',
      ['weekly', 'report'],
    );
    expect(score).toBe(100 + 100 + 400 + 40 + 40);
  });

  it('inapplicable scenario pulls a positive score negative (below threshold)', () => {
    const score = scoreLocalSkill(
      index('writer', '通用写作助手。禁用场景：写周报'),
      '周报',
      ['周报'],
    );
    // P1-B fix 3: whole query length = 2 < 3 -> no description whole-string +400, only per-token +40; inapplicable scenario -1000 -> -960.
    expect(score).toBe(40 - 1000);
  });
});

describe('selectImplicitSkill', () => {
  it('empty candidates -> null', () => {
    expect(selectImplicitSkill('周报', [])).toBeNull();
  });

  it('case 1: applicable-scenario hit -> activated', () => {
    const skills = [index('report', '适用场景：生成周报、日报、总结')];
    expect(selectImplicitSkill('周报', skills)?.name).toBe('report');
  });

  it('case 2: inapplicable-scenario hit -> not activated', () => {
    const skills = [index('writer', '通用写作助手。禁用场景：写周报')];
    expect(selectImplicitSkill('周报', skills)).toBeNull();
  });

  it('case 3: no relevant Skill -> null', () => {
    const skills = [
      index('weather', '查询天气与气象预警'),
      index('news', '新闻摘要与聚合'),
    ];
    expect(selectImplicitSkill('周报', skills)).toBeNull();
  });

  it('case 4: two weak candidates below the threshold (ACTIVATION_THRESHOLD) -> null', () => {
    // Both Skills only contain the whole string "weekly report" in their description; but queryNorm length = 2 < 3 gets no +400, only per-token +40 -> 40 each,
    // below ACTIVATION_THRESHOLD(100); the dual gate (threshold + lead margin) blocks them, avoiding "two weak candidates competing for activation".
    const skills = [
      index('a', '处理周报'),
      index('b', '整理周报'),
    ];
    const picked = selectImplicitSkill('周报', skills);
    expect(picked).toBeNull();
  });

  it('case 5: per-token name hits + whole-string description high score -> activated', () => {
    const skills = [index('weekly-report', 'Generate weekly report and summary')];
    expect(selectImplicitSkill('weekly report', skills)?.name).toBe('weekly-report');
  });

  it('with multiple candidates, only the one clearly ahead and above the threshold is returned', () => {
    const skills = [
      index('report', '适用场景：生成周报、日报、总结'), // 140 (whole string gets no +400 + applicable-scenario coverage bonus +100)
      index('digest', '整理会议纪要'), // 0 (unrelated to "weekly report")
    ];
    expect(selectImplicitSkill('周报', skills)?.name).toBe('report');
  });
});

describe('P1-B common-word gate (weak sharing of common two-character words does not activate)', () => {
  it('single common two-character word query -> null (no false activation)', () => {
    const skills = [index('finance-report', '适用场景：生成财务报表')];
    expect(selectImplicitSkill('财务', skills)).toBeNull();
  });

  it('two common two-character word query -> null', () => {
    const skills = [index('finance-news', '适用场景：财务新闻摘要')];
    expect(selectImplicitSkill('财务 新闻', skills)).toBeNull();
  });

  it('a specific scenario word (not a common word) still activates normally', () => {
    const skills = [index('weekly-report', '适用场景：生成周报')];
    expect(selectImplicitSkill('周报', skills)?.name).toBe('weekly-report');
  });

  it('common words + specific scenario word mixed (> 2 words) -> scored normally', () => {
    // More than 2 words -> the common-word gate is not triggered; normal scoring applies and it activates.
    const skills = [index('weekly-report', '适用场景：生成财务报表与周报')];
    expect(selectImplicitSkill('财务 报表 周报', skills)?.name).toBe('weekly-report');
  });
});

describe('P1-B fix 3 (2-character queries do not get the description whole-string +400)', () => {
  it('a 2-character query hitting the description only via a common 2-gram -> per-token +40 only, no whole-string +400', () => {
    const score = scoreLocalSkill(index('writer', '写周报的工具'), '周报', ['周报']);
    expect(score).toBe(40);
  });

  it('a query of 3+ characters hitting the description whole string -> +400 as usual', () => {
    const score = scoreLocalSkill(
      index('writer', '生成季度周报汇总'),
      '季度周报',
      ['季度', '周报'],
    );
    // Description whole string ("quarterly weekly report") hit +400; per-token "quarterly" +40 and "weekly report" +40; no scenario block -> +400+80=480.
    expect(score).toBe(400 + 40 + 40);
  });
});

describe('P1-C scenario block extraction negative defense (prevents the "applicable scenario" heading from matching inside the "inapplicable scenario" substring)', () => {
  it('only an "inapplicable scenario" heading -> applicable scenario returns empty', () => {
    const desc = '## 不适用场景\n- 写周报';
    expect(extractScenarioBlock(desc, '适用场景', '适用场景|适用|使用场景')).toBe('');
  });

  it('negative block first, positive block after -> applicable scenario captures the positive block', () => {
    const desc = '## 不适用场景\n- 写周报\n## 适用场景\n- 生成月报';
    expect(extractScenarioBlock(desc, '适用场景', '适用场景|适用|使用场景').trim()).toBe('生成月报');
  });

  it('positive block first, negative block after -> applicable scenario captures the positive block', () => {
    const desc = '## 适用场景\n- 生成月报\n## 不适用场景\n- 写周报';
    expect(extractScenarioBlock(desc, '适用场景', '适用场景|适用|使用场景').trim()).toBe('生成月报');
  });

  it('inline "inapplicable scenario:" does not pollute applicable-scenario extraction (both at line start)', () => {
    const desc = '通用写作助手\n不适用场景：写周报\n适用场景：生成月报';
    expect(extractScenarioBlock(desc, '适用场景', '适用场景|适用|使用场景')).toBe('生成月报');
  });
});

describe('Module E: A4 exact names are not killed by the common-word gate (E1-E3)', () => {
  it('E1: a Skill name exactly matching a common-word query -> activated (e.g. "analysis" as the name)', () => {
    const skills = [index('分析', '通用分析助手')];
    expect(selectImplicitSkill('分析', skills)?.name).toBe('分析');
  });

  it('E2: name containing a common word ("finance") -> exact name hit +800 activates', () => {
    const skills = [index('财务报表生成', '适用场景：生成财务报表')];
    expect(selectImplicitSkill('财务', skills)?.name).toBe('财务报表生成');
  });

  it('E3: name containing a common word ("report") -> exact name hit +800 activates', () => {
    const skills = [index('数据分析报告', '适用场景：生成分析报告')];
    expect(selectImplicitSkill('报告', skills)?.name).toBe('数据分析报告');
  });
});

describe('Module E: A2 negative -1000 restored and positive not mis-captured (E4-E6)', () => {
  it('E4: heading-style inapplicable scenario extracts the negative block correctly', () => {
    const desc = '## 不适用场景\n- 写周报';
    expect(extractScenarioBlock(desc, '不适用场景', '不适用场景|不适用|禁用场景')).toBe('写周报');
  });

  it('E5: heading inapplicable-scenario hit -> not activated (negative -1000 restored)', () => {
    const skills = [index('writer', '## 不适用场景\n- 写周报')];
    expect(selectImplicitSkill('周报', skills)).toBeNull();
  });

  it('E6: heading applicable-scenario positive block still activates correctly (no mis-capture after removing (?!negation-char))', () => {
    const skills = [index('report', '## 适用场景\n- 生成周报')];
    expect(selectImplicitSkill('周报', skills)?.name).toBe('report');
  });
});

describe('Module E: E7 exact name vs strong negative, pinned', () => {
  it('E7: exact name hit but scenario explicitly inapplicable -> not activated (+800-1000=-200 < threshold)', () => {
    const skills = [index('分析', '## 不适用场景\n- 分析类任务')];
    expect(selectImplicitSkill('分析', skills)).toBeNull();
  });

  it('E7 addendum: exact name hit and scenario applicable -> activated', () => {
    const skills = [index('分析', '## 适用场景\n- 数据分析')];
    expect(selectImplicitSkill('分析', skills)?.name).toBe('分析');
  });
});

describe('Module E: E8 R4 common-word false-activation guard does not regress', () => {
  it('E8: a common-word query (not an exact name) still does not falsely activate finance-report Skills', () => {
    const skills = [index('finance-helper', '适用场景：生成财务报表')];
    expect(selectImplicitSkill('财务', skills)).toBeNull();
  });

  it('E8 addendum: common-word query + exact name hit (e.g. "finance" in the name) -> still activated', () => {
    const skills = [index('财务报表', '适用场景：生成财务报表')];
    expect(selectImplicitSkill('财务', skills)?.name).toBe('财务报表');
  });
});
