const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getOperationalPreparationAnswerCharacterCount,
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
