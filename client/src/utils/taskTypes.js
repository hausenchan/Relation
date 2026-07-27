export const TASK_TYPE_META = Object.freeze({
  '认知': { label: '认知', color: 'geekblue' },
  '增长-客户': { label: '增长-客户', color: 'green' },
  '增长-产品': { label: '增长-产品', color: 'cyan' },
  '组织': { label: '组织', color: 'gold' },
});

export const TASK_TYPE_VALUES = Object.freeze(Object.keys(TASK_TYPE_META));

export const TASK_TYPE_OPTIONS = Object.freeze(TASK_TYPE_VALUES.map(value => ({
  value,
  label: TASK_TYPE_META[value].label,
})));
