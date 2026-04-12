import React from 'react';
import { List, Tag, Button, Popconfirm, Space, Typography, Badge, Empty } from 'antd';
import { CheckOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text } = Typography;

const typeMap = {
  follow_up: { label: '跟进', color: 'blue' },
  birthday: { label: '生日', color: 'pink' },
  gift: { label: '送礼', color: 'gold' },
  meeting: { label: '会议', color: 'purple' },
  other: { label: '其他', color: 'default' },
};

export default function ReminderList({ data, onDone, onDelete }) {
  if (!data?.length) return <Empty description="暂无提醒" />;

  return (
    <List
      size="small"
      dataSource={data}
      renderItem={item => {
        const diff = dayjs(item.remind_date).diff(dayjs(), 'day');
        const isOverdue = diff < 0 && !item.done;
        const isToday = diff === 0 && !item.done;
        return (
          <List.Item
            style={{ opacity: item.done ? 0.5 : 1 }}
            actions={[
              !item.done && (
                <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => onDone(item.id)}>
                  完成
                </Button>
              ),
              <Popconfirm title="确认删除？" onConfirm={() => onDelete(item.id)}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ].filter(Boolean)}
          >
            <List.Item.Meta
              title={
                <Space size={4}>
                  {item.done
                    ? <Badge status="default" text="已完成" />
                    : isOverdue
                      ? <Badge status="error" text={`逾期${Math.abs(diff)}天`} />
                      : isToday
                        ? <Badge status="warning" text="今天" />
                        : <Badge status="processing" text={`${diff}天后`} />
                  }
                  <Tag color={typeMap[item.type]?.color}>{typeMap[item.type]?.label || item.type}</Tag>
                  <Text strong>{item.title}</Text>
                </Space>
              }
              description={
                <Space size={4}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{item.remind_date}</Text>
                  {item.note && <Text type="secondary" style={{ fontSize: 12 }}>| {item.note}</Text>}
                </Space>
              }
            />
          </List.Item>
        );
      }}
    />
  );
}
