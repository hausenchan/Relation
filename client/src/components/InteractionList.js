import React, { useState } from 'react';
import { List, Tag, Button, Popconfirm, Space, Typography, Empty, Drawer, Descriptions } from 'antd';
import { DeleteOutlined, EyeOutlined, RiseOutlined } from '@ant-design/icons';
import AttachmentList from './AttachmentList';

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
        renderItem={item => (
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
                  {item.description && <div>{item.description}</div>}
                  {item.outcome && <div style={{ color: '#52c41a' }}>结果: {item.outcome}</div>}
                  {item.next_action && (
                    <div style={{ color: '#fa8c16' }}>
                      下次: {item.next_action} {item.next_action_date && `(${item.next_action_date})`}
                    </div>
                  )}
                </div>
              }
            />
          </List.Item>
        )}
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
                  <div style={{ whiteSpace: 'pre-wrap' }}>{r.description || '-'}</div>
                </Descriptions.Item>
                <Descriptions.Item label="结果">
                  <div style={{ whiteSpace: 'pre-wrap' }}>{r.outcome || '-'}</div>
                </Descriptions.Item>
                <Descriptions.Item label="下次跟进">
                  {r.next_action ? `${r.next_action}${r.next_action_date ? ` (${r.next_action_date})` : ''}` : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="商机">
                  {r.opportunity_title ? (
                    <Space size={4} wrap>
                      <Tag color="blue" icon={<RiseOutlined />}>{r.opportunity_title}</Tag>
                      {oppStatus && <Tag color={oppStatus.color}>{oppStatus.label}</Tag>}
                    </Space>
                  ) : '-'}
                </Descriptions.Item>
                {r.opportunity_note && (
                  <Descriptions.Item label="商机说明">
                    <div style={{ whiteSpace: 'pre-wrap' }}>{r.opportunity_note}</div>
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="创建时间">{r.created_at || '-'}</Descriptions.Item>
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
