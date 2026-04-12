import React from 'react';
import { List, Tag, Button, Popconfirm, Space, Typography, Empty } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';

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

export default function InteractionList({ data, onDelete }) {
  if (!data?.length) return <Empty description="暂无互动记录" />;

  return (
    <List
      size="small"
      dataSource={data}
      renderItem={item => (
        <List.Item
          actions={[
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
                {item.amount > 0 && <Tag color="red">¥{item.amount}</Tag>}
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
  );
}
