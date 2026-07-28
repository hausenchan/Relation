const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getPersonCompanyName,
  matchesInteractionSearch,
  matchesPersonSearch,
  normalizeSearchText,
} = require('./businessContactSearch');

test('company display prefers the standard company field and falls back to current company', () => {
  assert.equal(getPersonCompanyName({ company: '星河科技', current_company: '云启智能' }), '星河科技');
  assert.equal(getPersonCompanyName({ company: '  ', current_company: ' 云启智能 ' }), '云启智能');
  assert.equal(getPersonCompanyName({}), '');
});

test('person search keeps the existing name, company, skill and tag semantics', () => {
  const person = {
    name: '杨柳',
    company: '星河科技',
    current_company: '',
    phone: '13800138000',
    tags: '重点客户',
    skills: '增长策略',
    success_traits: '长期推进',
  };

  assert.equal(matchesPersonSearch(person, '星河'), true);
  assert.equal(matchesPersonSearch(person, '增长'), true);
  assert.equal(matchesPersonSearch(person, '不存在'), false);
});

test('interaction search matches linked name, company and rich-text content', () => {
  const interaction = {
    person_name: '杨柳',
    current_company: '云启智能',
    description: '<p>讨论年度合作方案&nbsp;与预算</p>',
    outcome: '进入测试阶段',
  };

  assert.equal(matchesInteractionSearch(interaction, '杨柳'), true);
  assert.equal(matchesInteractionSearch(interaction, '云启'), true);
  assert.equal(matchesInteractionSearch(interaction, '合作方案 与预算'), true);
  assert.equal(matchesInteractionSearch(interaction, '未命中'), false);
  assert.equal(normalizeSearchText('<strong>ABC</strong>\n项目'), 'abc 项目');
});
