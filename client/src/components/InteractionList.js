import React, { useState } from 'react';
import { List, Tag, Button, Popconfirm, Space, Typography, Empty, Drawer, Descriptions } from 'antd';
import { DeleteOutlined, EyeOutlined, RiseOutlined } from '@ant-design/icons';
import AttachmentList from './AttachmentList';
import { RichTextView, richTextToPlain } from './RichText';
import { formatBusinessDateTime } from '../utils/businessTime';
import { TASK_TYPE_META } from '../utils/taskTypes';

const { Text } = Typography;

const typeMap = {
  visit: { label: '拜访', color: 'blue' },
  call: { label: '通话', color: 'green' },
  gift: { label: '送礼', color: 'gold' },
  meal: { label: '餐饮', color: 'orange' },
  wechat: { label: '微信', color: 'cyan' },
  email: { label: '邮件', color: 'purple' },
  meeting: { label: '会议', color: 'magenta' },
  other: { label: '其他', color: 'default' },
};

const importanceMap = {
  high: { label: '重要', color: 'red' },
  medium: { label: '中等', color: 'orange' },
  normal: { label: '一般', color: 'default' },
};

const opportunityStatusMap = {
  new: { label: '新商机', color: 'blue' },
  following: { label: '跟进中', color: 'orange' },
  won: { label: '已成交', color: 'green' },
  lost: { label: '已关闭', color: 'default' },
};

export default function InteractionList({ data, onDelete }) {
  const [detailRecord, setDetailRecord] = useState(null);

  if (!data?.length) return <Empty description="暂无互动记录" />;

  return (
    <>
      <List
        size="small"
        dataSource={data}
        renderItem={(item) => {
          const descriptionText = richTextToPlain(item.description);
          const outcomeText = richTextToPlain(item.outcome);
          const followResultText = richTextToPlain(item.follow_result);
          const nextActionText = richTextToPlain(item.next_action);
          return (
            <List.Item
              actions={[
                <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailRecord(item)}>详情</Button>,
                <Popconfirm title="确认删除？" onConfirm={() => onDelete(item.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              ]}
            >
              <List.Item.Meta
                title={
                  <Space size={4}>
                    <Text type="secondary">{item.date}</Text>
                    <Tag color={typeMap[item.type]?.color}>{typeMap[item.type]?.label || item.type}</Tag>
                  </Space>
                }
                description={
                  <div>
                    {descriptionText && <div>{descriptionText}</div>}
                    {outcomeText && <div style={{ color: '#52c41a' }}>结果: {outcomeText}</div>}
                    {followResultText && <div style={{ color: '#1677ff' }}>跟进结果: {followResultText}</div>}
                    {nextActionText && (
                      <div style={{ color: '#fa8c16' }}>
                        下一步: {nextActionText} {item.next_action_date && `(${item.next_action_date})`}
                      </div>
                    )}
                  </div>
                }
              />
            </List.Item>
          );
        }}
      />

      <Drawer
        title="互动记录详情"
        width={560}
        open={!!detailRecord}
        onClose={() => setDetailRecord(null)}
        destroyOnClose
      >
        {detailRecord && (() => {
          const r = detailRecord;
          const t = typeMap[r.type] || { label: r.type, color: 'default' };
          const imp = importanceMap[r.importance] || importanceMap.normal;
          const oppStatus = r.opportunity_title
            ? (opportunityStatusMap[r.opportunity_status] || { label: r.opportunity_status, color: 'default' })
            : null;
          return (
            <>
              <Descriptions size="small" column={1} bordered labelStyle={{ width: 100 }}>
                <Descriptions.Item label="日期">{r.date || '-'}</Descriptions.Item>
                <Descriptions.Item label="类型"><Tag color={t.color}>{t.label}</Tag></Descriptions.Item>
                <Descriptions.Item label="重要程度"><Tag color={imp.color}>{imp.label}</Tag></Descriptions.Item>
                {r.gift_name && <Descriptions.Item label="礼物">{r.gift_name}</Descriptions.Item>}
                <Descriptions.Item label="描述">
                  <RichTextView value={r.description} />
                </Descriptions.Item>
                <Descriptions.Item label="结果">
                  <RichTextView value={r.outcome} />
                </Descriptions.Item>
                <Descriptions.Item label="跟进结果">
                  <RichTextView value={r.follow_result} />
                </Descriptions.Item>
                <Descriptions.Item label="下一步行动">
                  <RichTextView value={r.next_action} />
                </Descriptions.Item>
                <Descriptions.Item label="下一步日期">{r.next_action_date || '-'}</Descriptions.Item>
                <Descriptions.Item label="商机">
                  {r.opportunity_title ? (
                    <Space size={4} wrap>
                      <Tag color="blue" icon={<RiseOutlined />}>{r.opportunity_title}</Tag>
                      {oppStatus && <Tag color={oppStatus.color}>{oppStatus.label}</Tag>}
                    </Space>
                  ) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="商机类型">
                  {r.opportunity_type
                    ? <Tag color={TASK_TYPE_META[r.opportunity_type]?.color || 'default'}>{TASK_TYPE_META[r.opportunity_type]?.label || r.opportunity_type}</Tag>
                    : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="商机说明">
                  <RichTextView value={r.opportunity_note} />
                </Descriptions.Item>
                <Descriptions.Item label="创建时间">{formatBusinessDateTime(r.created_at, 'YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
              </Descriptions>

              <div style={{ marginTop: 20 }}>
                <AttachmentList sourceType="interaction" sourceId={r.id} />
              </div>
            </>
          );
        })()}
      </Drawer>
    </>
  );
}
