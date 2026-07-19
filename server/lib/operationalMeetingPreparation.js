const OPERATIONAL_PREPARATION_MIN_SUBMIT_CHARACTERS = 5;

function decodeInlineHtml(value = '') {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;|&#x0*a0;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function parseContent(value) {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getBlockPlainText(block = {}) {
  if (block.type === 'divider') return '';
  if (block.type === 'table-simple') {
    return (block.meta?.rows || [])
      .flatMap(row => (Array.isArray(row) ? row : []))
      .map(decodeInlineHtml)
      .join('\n');
  }
  return [block.content, block.meta?.body].map(decodeInlineHtml).filter(Boolean).join('\n');
}

function getOperationalPreparationAnswerText(value, fallbackQuestions = []) {
  const content = parseContent(value);
  const blocks = Array.isArray(content?.blocks) ? content.blocks : [];
  const questionTitles = new Set((Array.isArray(fallbackQuestions) ? fallbackQuestions : [])
    .map(question => String(question?.title || '').trim())
    .filter(Boolean));
  return blocks.filter((block) => {
    if (block?.meta?.template_question_key) return false;
    const text = decodeInlineHtml(block?.content).trim();
    return !(
      Number(block?.meta?.indent || 0) === 0
      && ['numbered', 'fold-list'].includes(block?.type)
      && questionTitles.has(text)
    );
  }).map(getBlockPlainText).filter(Boolean).join('\n');
}

function getOperationalPreparationAnswerCharacterCount(value, fallbackQuestions = []) {
  const text = getOperationalPreparationAnswerText(value, fallbackQuestions)
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  return Array.from(text).length;
}

function operationalPreparationCanSubmit(
  value,
  fallbackQuestions = [],
  minimumCharacters = OPERATIONAL_PREPARATION_MIN_SUBMIT_CHARACTERS,
) {
  return getOperationalPreparationAnswerCharacterCount(value, fallbackQuestions) > minimumCharacters;
}

module.exports = {
  OPERATIONAL_PREPARATION_MIN_SUBMIT_CHARACTERS,
  getOperationalPreparationAnswerCharacterCount,
  getOperationalPreparationAnswerText,
  operationalPreparationCanSubmit,
};
