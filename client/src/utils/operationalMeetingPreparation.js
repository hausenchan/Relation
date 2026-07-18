import {
  createDocumentBodyBlock,
  documentBodyHasContent,
  documentBodyToPlain,
  normalizeDocumentBodyValue,
} from './documentBodyBlocks';

export const DEFAULT_OPERATIONAL_MEETING_QUESTIONS = [
  { key: 'weekly_result', title: '本周核心结果' },
  { key: 'key_judgment', title: '一个最重要的判断' },
  { key: 'decision_needed', title: '需要会上决策的问题' },
  { key: 'next_action', title: '下周建议动作' },
];

function createQuestionTitleBlock(question, index) {
  return createDocumentBodyBlock('numbered', question.title || `问题 ${index + 1}`, {
    meta: {
      indent: 0,
      template_question_key: question.key || `q_${index + 1}`,
    },
  });
}

export function createDefaultOperationalPreparationContent(questions = DEFAULT_OPERATIONAL_MEETING_QUESTIONS) {
  const source = Array.isArray(questions) && questions.length ? questions : DEFAULT_OPERATIONAL_MEETING_QUESTIONS;
  return normalizeDocumentBodyValue({
    blocks: source.map(createQuestionTitleBlock),
  });
}

export function normalizeOperationalPreparationContent(value, fallbackQuestions = DEFAULT_OPERATIONAL_MEETING_QUESTIONS) {
  if (value && typeof value === 'object' && Array.isArray(value.blocks)) {
    return normalizeDocumentBodyValue(value);
  }

  const questionSource = value?.questions || (Array.isArray(value) ? value : null);
  const questions = Array.isArray(questionSource) && questionSource.length
    ? questionSource
    : (Array.isArray(fallbackQuestions) && fallbackQuestions.length ? fallbackQuestions : DEFAULT_OPERATIONAL_MEETING_QUESTIONS);
  const blocks = [];
  questions.forEach((question, index) => {
    blocks.push(createQuestionTitleBlock(question, index));
    if (!documentBodyHasContent(question?.content)) return;
    const answer = normalizeDocumentBodyValue(question.content);
    answer.blocks.forEach((block) => {
      const indent = Math.max(1, Number(block.meta?.indent || 0) + 1);
      blocks.push({
        ...block,
        id: createDocumentBodyBlock().id,
        meta: {
          ...(block.meta || {}),
          indent,
          hierarchy: 'list',
          template_question_parent: question.key || `q_${index + 1}`,
        },
      });
    });
  });
  return normalizeDocumentBodyValue({ blocks });
}

export function operationalPreparationToPlain(value, htmlToPlain) {
  return documentBodyToPlain(normalizeOperationalPreparationContent(value), htmlToPlain);
}
