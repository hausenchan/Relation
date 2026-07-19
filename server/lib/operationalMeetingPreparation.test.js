const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getOperationalPreparationAnswerCharacterCount,
  getOperationalPreparationSubmissionSignature,
  operationalPreparationCanSubmit,
} = require('./operationalMeetingPreparation');

const questions = [{ key: 'weekly_result', title: '本周核心结果' }];

function content(answer) {
  return {
    blocks: [
      {
        id: 'question',
        type: 'fold-list',
        content: '本周核心结果',
        meta: { indent: 0, template_question_key: 'weekly_result' },
      },
      { id: 'answer', type: 'numbered', content: answer, meta: { indent: 1 } },
    ],
  };
}

test('preparation submission requires more than five effective characters', () => {
  assert.equal(getOperationalPreparationAnswerCharacterCount(content('收入 增长好'), questions), 5);
  assert.equal(operationalPreparationCanSubmit(content('收入 增长好'), questions), false);
  assert.equal(getOperationalPreparationAnswerCharacterCount(content('<strong>收入增长很好</strong>'), questions), 6);
  assert.equal(operationalPreparationCanSubmit(content('<strong>收入增长很好</strong>'), questions), true);
});

test('template question titles do not count as answers', () => {
  assert.equal(getOperationalPreparationAnswerCharacterCount(content('&nbsp;'), questions), 0);
  assert.equal(operationalPreparationCanSubmit(content('&nbsp;'), questions), false);
});

test('submission signature ignores presentation-only changes', () => {
  const plain = content('本周准备内容');
  const formatted = content('<strong>本周准备内容</strong>');
  const collapsed = {
    ...plain,
    blocks: plain.blocks.map((block, index) => (
      index === 0 ? { ...block, meta: { ...block.meta, collapsed: true } } : block
    )),
  };

  assert.equal(
    getOperationalPreparationSubmissionSignature(formatted, questions),
    getOperationalPreparationSubmissionSignature(plain, questions),
  );
  assert.equal(
    getOperationalPreparationSubmissionSignature(collapsed, questions),
    getOperationalPreparationSubmissionSignature(plain, questions),
  );
  assert.notEqual(
    getOperationalPreparationSubmissionSignature(content('本周准备内容已修改'), questions),
    getOperationalPreparationSubmissionSignature(plain, questions),
  );
});
