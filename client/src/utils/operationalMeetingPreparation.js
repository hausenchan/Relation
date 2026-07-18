import {
  createDocumentBodyBlock,
  documentBodyHasContent,
  documentBodyInlineHtmlToPlain,
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
  return createDocumentBodyBlock('fold-list', question.title || `问题 ${index + 1}`, {
    meta: {
      indent: 0,
      collapsed: false,
      template_question_key: question.key || `q_${index + 1}`,
    },
  });
}

function createQuestionAnswerBlock(question, index) {
  const questionKey = question.key || `q_${index + 1}`;
  return createDocumentBodyBlock('numbered', '', {
    meta: {
      indent: 1,
      hierarchy: 'list',
      template_question_parent: questionKey,
    },
  });
}

function getTemplateQuestion(block, questions) {
  const questionKey = block?.meta?.template_question_key;
  if (questionKey) {
    return questions.find(question => question.key === questionKey)
      || { key: questionKey, title: documentBodyInlineHtmlToPlain(block.content).trim() };
  }
  if (!['numbered', 'fold-list'].includes(block?.type) || Number(block?.meta?.indent || 0) !== 0) return null;
  const title = documentBodyInlineHtmlToPlain(block.content).trim();
  return questions.find(question => question.title === title) || null;
}

function ensureTemplateFoldChildren(blocks, questions) {
  const nextBlocks = [];
  blocks.forEach((block, index) => {
    const question = block.type === 'fold-list' ? getTemplateQuestion(block, questions) : null;
    if (!question) {
      nextBlocks.push(block);
      return;
    }

    const questionKey = question.key || `q_${index + 1}`;
    const body = documentBodyInlineHtmlToPlain(block.meta?.body || '').trim();
    nextBlocks.push({
      ...block,
      type: 'fold-list',
      meta: {
        ...(block.meta || {}),
        body: '',
        indent: 0,
        collapsed: Boolean(block.meta?.collapsed),
        template_question_key: questionKey,
      },
    });

    const nextBlock = blocks[index + 1];
    const hasChild = nextBlock
      && Number(nextBlock.meta?.indent || 0) > 0
      && nextBlock.meta?.template_question_key !== questionKey;
    if (body || !hasChild) {
      nextBlocks.push(createDocumentBodyBlock('numbered', body ? block.meta.body : '', {
        meta: {
          indent: 1,
          hierarchy: 'list',
          template_question_parent: questionKey,
        },
      }));
    }
  });
  return nextBlocks;
}

function migrateTemplateQuestionBlocks(value, questions) {
  const normalized = normalizeDocumentBodyValue(value);
  const hasTemplateQuestion = normalized.blocks.some(block => getTemplateQuestion(block, questions));
  if (!hasTemplateQuestion) return normalized;

  let activeQuestionKey = '';
  const migrated = normalized.blocks.map((block, index) => {
    const question = getTemplateQuestion(block, questions);
    if (question) {
      activeQuestionKey = question.key || block.meta?.template_question_key || `q_${index + 1}`;
      return {
        ...block,
        type: 'fold-list',
        meta: {
          ...(block.meta || {}),
          indent: 0,
          collapsed: Boolean(block.meta?.collapsed),
          template_question_key: activeQuestionKey,
        },
      };
    }
    if (!activeQuestionKey) return block;
    return {
      ...block,
      meta: {
        ...(block.meta || {}),
        indent: Math.max(1, Number(block.meta?.indent || 0)),
        hierarchy: 'list',
        template_question_parent: block.meta?.template_question_parent || activeQuestionKey,
      },
    };
  });

  return normalizeDocumentBodyValue({
    ...normalized,
    blocks: ensureTemplateFoldChildren(migrated, questions),
  });
}

export function createDefaultOperationalPreparationContent(questions = DEFAULT_OPERATIONAL_MEETING_QUESTIONS) {
  const source = Array.isArray(questions) && questions.length ? questions : DEFAULT_OPERATIONAL_MEETING_QUESTIONS;
  return normalizeDocumentBodyValue({
    blocks: source.flatMap((question, index) => [
      createQuestionTitleBlock(question, index),
      createQuestionAnswerBlock(question, index),
    ]),
  });
}

export function normalizeOperationalPreparationContent(value, fallbackQuestions = DEFAULT_OPERATIONAL_MEETING_QUESTIONS) {
  const sourceQuestions = Array.isArray(fallbackQuestions) && fallbackQuestions.length
    ? fallbackQuestions
    : DEFAULT_OPERATIONAL_MEETING_QUESTIONS;
  if (value && typeof value === 'object' && Array.isArray(value.blocks)) {
    return migrateTemplateQuestionBlocks(value, sourceQuestions);
  }

  const questionSource = value?.questions || (Array.isArray(value) ? value : null);
  const questions = Array.isArray(questionSource) && questionSource.length
    ? questionSource
    : sourceQuestions;
  const blocks = [];
  questions.forEach((question, index) => {
    blocks.push(createQuestionTitleBlock(question, index));
    if (documentBodyHasContent(question?.content)) {
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
    } else {
      blocks.push(createQuestionAnswerBlock(question, index));
    }
  });
  return normalizeDocumentBodyValue({ blocks });
}

export function operationalPreparationToPlain(value, htmlToPlain) {
  return documentBodyToPlain(normalizeOperationalPreparationContent(value), htmlToPlain);
}

export function getOperationalPreparationSignature(value, fallbackQuestions = DEFAULT_OPERATIONAL_MEETING_QUESTIONS) {
  return JSON.stringify(normalizeOperationalPreparationContent(value, fallbackQuestions));
}

export function getOperationalPreparationSubmissionSignature(value, fallbackQuestions = DEFAULT_OPERATIONAL_MEETING_QUESTIONS) {
  const normalized = normalizeOperationalPreparationContent(value, fallbackQuestions);
  return JSON.stringify({
    ...normalized,
    blocks: normalized.blocks.map((block) => {
      const { collapsed, ...meta } = block.meta || {};
      return { ...block, meta };
    }),
  });
}

export function operationalPreparationHasAnswers(value, fallbackQuestions = DEFAULT_OPERATIONAL_MEETING_QUESTIONS) {
  const questions = Array.isArray(fallbackQuestions) && fallbackQuestions.length
    ? fallbackQuestions
    : DEFAULT_OPERATIONAL_MEETING_QUESTIONS;
  const questionTitles = new Set(questions.map(question => String(question.title || '').trim()).filter(Boolean));
  const normalized = normalizeOperationalPreparationContent(value, questions);
  return normalized.blocks.some((block) => {
    if (block?.meta?.template_question_key) return false;
    const text = documentBodyInlineHtmlToPlain(block?.content || '').trim();
    if (
      Number(block?.meta?.indent || 0) === 0
      && ['numbered', 'fold-list'].includes(block?.type)
      && questionTitles.has(text)
    ) return false;
    return documentBodyHasContent({ blocks: [block] });
  });
}
