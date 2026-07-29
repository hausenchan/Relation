import React, { useEffect, useState } from 'react';
import { Button, Checkbox, Input, InputNumber, Modal, Select, Space } from 'antd';

const COLOR_OPTIONS = [
  { value: '#111827', label: '黑色' },
  { value: '#dc2626', label: '红色' },
  { value: '#d97706', label: '橙色' },
  { value: '#15803d', label: '绿色' },
  { value: '#1677ff', label: '蓝色' },
  { value: '#7e22ce', label: '紫色' },
];

const FILL_OPTIONS = [
  { value: '#fee2e2', label: '浅红' },
  { value: '#fef3c7', label: '浅黄' },
  { value: '#dcfce7', label: '浅绿' },
  { value: '#dbeafe', label: '浅蓝' },
  { value: '#f3e8ff', label: '浅紫' },
];

function DialogBody({ children }) {
  return <div className="relation-spreadsheet-rule-dialog">{children}</div>;
}

export function SpreadsheetProtectionDialog({
  open,
  rangeLabel,
  initialRule,
  users = [],
  onCancel,
  onSave,
  onDelete,
}) {
  const [description, setDescription] = useState('');
  const [allowedUserIds, setAllowedUserIds] = useState([]);

  useEffect(() => {
    if (!open) return;
    setDescription(initialRule?.description || '');
    setAllowedUserIds((initialRule?.allowedUserIds || initialRule?.allowed_user_ids || []).map(Number));
  }, [open, initialRule]);

  return (
    <Modal
      open={open}
      title={initialRule ? '管理锁定单元格' : '锁定单元格'}
      width={480}
      onCancel={onCancel}
      footer={(
        <Space style={{ width: '100%', justifyContent: initialRule ? 'space-between' : 'flex-end' }}>
          {initialRule ? <Button aria-label="解除锁定单元格" danger onClick={onDelete}>解除锁定</Button> : <span />}
          <Space>
            <Button onClick={onCancel}>取消</Button>
            <Button
              aria-label={initialRule ? '保存锁定规则' : '创建锁定规则'}
              type="primary"
              onClick={() => onSave({ description, allowedUserIds })}
            >
              {initialRule ? '保存' : '锁定'}
            </Button>
          </Space>
        </Space>
      )}
    >
      <DialogBody>
        <div className="relation-spreadsheet-rule-range">范围：{rangeLabel}</div>
        <label>
          <span>允许继续编辑的成员</span>
          <Select
            mode="multiple"
            allowClear
            value={allowedUserIds}
            options={users.map(user => ({ value: Number(user.id), label: user.name || user.display_name || user.username }))}
            placeholder="默认仅文档管理者和锁定创建人可编辑"
            onChange={setAllowedUserIds}
          />
        </label>
        <label>
          <span>说明</span>
          <Input
            value={description}
            maxLength={120}
            placeholder="例如：财务数据，避免误改"
            onChange={event => setDescription(event.target.value)}
          />
        </label>
      </DialogBody>
    </Modal>
  );
}

export function SpreadsheetConditionalFormatDialog({ open, rangeLabel, initialRule, onCancel, onSave, onDelete }) {
  const [type, setType] = useState('greater_than');
  const [firstValue, setFirstValue] = useState('');
  const [secondValue, setSecondValue] = useState('');
  const [color, setColor] = useState('#dc2626');
  const [backgroundColor, setBackgroundColor] = useState('#fee2e2');
  const [stopIfTrue, setStopIfTrue] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setType(initialRule?.type || 'greater_than');
    setFirstValue(String(initialRule?.values?.[0] ?? ''));
    setSecondValue(String(initialRule?.values?.[1] ?? ''));
    setColor(initialRule?.style?.color || '#dc2626');
    setBackgroundColor(initialRule?.style?.backgroundColor || '#fee2e2');
    setStopIfTrue(Boolean(initialRule?.stopIfTrue));
    setError('');
  }, [open, initialRule]);

  const valueRequired = !['blank', 'not_blank', 'duplicate', 'unique'].includes(type);
  const saveRule = () => {
    if (valueRequired && !String(firstValue).trim()) {
      setError('请输入比较值');
      return;
    }
    if (type === 'between' && !String(secondValue).trim()) {
      setError('请输入第二个比较值');
      return;
    }
    setError('');
    onSave({
      type,
      values: valueRequired ? [firstValue, ...(type === 'between' ? [secondValue] : [])] : [],
      style: { color, backgroundColor },
      stopIfTrue,
    });
  };
  return (
    <Modal
      open={open}
      title="条件格式"
      width={520}
      okText="保存规则"
      cancelText="取消"
      onCancel={onCancel}
      onOk={saveRule}
      footer={(_, { OkBtn, CancelBtn }) => (
        <Space style={{ width: '100%', justifyContent: initialRule ? 'space-between' : 'flex-end' }}>
          {initialRule ? <Button danger onClick={onDelete}>删除规则</Button> : <span />}
          <Space><CancelBtn /><OkBtn /></Space>
        </Space>
      )}
    >
      <DialogBody>
        <div className="relation-spreadsheet-rule-range">应用范围：{rangeLabel}</div>
        <label>
          <span>规则</span>
          <Select
            value={type}
            onChange={setType}
            options={[
              { value: 'greater_than', label: '大于' },
              { value: 'less_than', label: '小于' },
              { value: 'between', label: '介于' },
              { value: 'equal', label: '等于' },
              { value: 'not_equal', label: '不等于' },
              { value: 'text_contains', label: '文本包含' },
              { value: 'date_before', label: '日期早于' },
              { value: 'date_after', label: '日期晚于' },
              { value: 'blank', label: '空白' },
              { value: 'not_blank', label: '非空' },
              { value: 'duplicate', label: '重复值' },
              { value: 'unique', label: '唯一值' },
            ]}
          />
        </label>
        {valueRequired ? (
          <div className="relation-spreadsheet-rule-row">
            <Input value={firstValue} placeholder="比较值" onChange={event => setFirstValue(event.target.value)} />
            {type === 'between' ? (
              <Input value={secondValue} placeholder="第二个值" onChange={event => setSecondValue(event.target.value)} />
            ) : null}
          </div>
        ) : null}
        <div className="relation-spreadsheet-rule-row">
          <label><span>文字颜色</span><Select value={color} options={COLOR_OPTIONS} onChange={setColor} /></label>
          <label><span>填充色</span><Select value={backgroundColor} options={FILL_OPTIONS} onChange={setBackgroundColor} /></label>
        </div>
        <Checkbox checked={stopIfTrue} onChange={event => setStopIfTrue(event.target.checked)}>
          满足后停止继续应用后续规则
        </Checkbox>
        {error ? <div className="relation-spreadsheet-rule-error">{error}</div> : null}
      </DialogBody>
    </Modal>
  );
}

export function SpreadsheetDataValidationDialog({ open, rangeLabel, initialRule, onCancel, onSave, onDelete }) {
  const [type, setType] = useState('list');
  const [valuesText, setValuesText] = useState('');
  const [min, setMin] = useState(null);
  const [max, setMax] = useState(null);
  const [allowBlank, setAllowBlank] = useState(true);
  const [invalidAction, setInvalidAction] = useState('reject');
  const [message, setMessage] = useState('');
  const [formula, setFormula] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setType(initialRule?.type || 'list');
    setValuesText((initialRule?.values || []).join('\n'));
    setMin(initialRule?.min ?? null);
    setMax(initialRule?.max ?? null);
    setAllowBlank(initialRule?.allowBlank !== false);
    setInvalidAction(initialRule?.invalidAction || 'reject');
    setMessage(initialRule?.message || '');
    setFormula(initialRule?.formula || '');
    setError('');
  }, [open, initialRule]);

  const needsBounds = ['number', 'text_length'].includes(type);
  const parsedValues = valuesText.split(/[\n,，]/).map(value => value.trim()).filter(Boolean);
  const saveRule = () => {
    if (type === 'list' && !parsedValues.length) {
      setError('请至少填写一个列表选项');
      return;
    }
    if (needsBounds && min !== null && max !== null && Number(min) > Number(max)) {
      setError('最小值不能大于最大值');
      return;
    }
    if (type === 'custom_formula' && !String(formula).trim().startsWith('=')) {
      setError('自定义公式必须以 = 开头');
      return;
    }
    setError('');
    onSave({
      type,
      values: parsedValues,
      ...(needsBounds ? { min, max } : {}),
      ...(type === 'custom_formula' ? { formula: String(formula).trim() } : {}),
      allowBlank,
      invalidAction,
      message,
    });
  };
  return (
    <Modal
      open={open}
      title="数据验证"
      width={540}
      okText="保存规则"
      cancelText="取消"
      onCancel={onCancel}
      onOk={saveRule}
      footer={(_, { OkBtn, CancelBtn }) => (
        <Space style={{ width: '100%', justifyContent: initialRule ? 'space-between' : 'flex-end' }}>
          {initialRule ? <Button danger onClick={onDelete}>删除规则</Button> : <span />}
          <Space><CancelBtn /><OkBtn /></Space>
        </Space>
      )}
    >
      <DialogBody>
        <div className="relation-spreadsheet-rule-range">应用范围：{rangeLabel}</div>
        <label>
          <span>验证类型</span>
          <Select
            value={type}
            onChange={setType}
            options={[
              { value: 'list', label: '列表' },
              { value: 'number', label: '数字' },
              { value: 'date_time', label: '日期时间' },
              { value: 'text_length', label: '文本内容/长度' },
              { value: 'checkbox', label: '复选框' },
              { value: 'rating', label: '评分' },
              { value: 'progress', label: '进度' },
              { value: 'id_card', label: '身份证' },
              { value: 'mobile', label: '手机号' },
              { value: 'landline', label: '固定电话' },
              { value: 'email', label: '电子邮箱' },
              { value: 'temperature', label: '温度' },
              { value: 'custom_formula', label: '自定义公式' },
            ]}
          />
        </label>
        {type === 'list' ? (
          <label>
            <span>列表选项（每行或逗号分隔）</span>
            <Input.TextArea value={valuesText} autoSize={{ minRows: 3, maxRows: 6 }} onChange={event => setValuesText(event.target.value)} />
          </label>
        ) : null}
        {needsBounds ? (
          <div className="relation-spreadsheet-rule-row">
            <label><span>最小值</span><InputNumber value={min} onChange={setMin} /></label>
            <label><span>最大值</span><InputNumber value={max} onChange={setMax} /></label>
          </div>
        ) : null}
        {type === 'custom_formula' ? (
          <label><span>公式</span><Input value={formula} placeholder="=A1>0" onChange={event => setFormula(event.target.value)} /></label>
        ) : null}
        <div className="relation-spreadsheet-rule-row">
          <Checkbox checked={allowBlank} onChange={event => setAllowBlank(event.target.checked)}>允许空值</Checkbox>
          <Select
            value={invalidAction}
            options={[
              { value: 'reject', label: '拒绝输入' },
              { value: 'warning', label: '允许但警告' },
            ]}
            onChange={setInvalidAction}
          />
        </div>
        <label>
          <span>无效数据提示</span>
          <Input value={message} maxLength={120} placeholder="输入内容不符合规则" onChange={event => setMessage(event.target.value)} />
        </label>
        {error ? <div className="relation-spreadsheet-rule-error">{error}</div> : null}
      </DialogBody>
    </Modal>
  );
}
