import React from 'react';
import { Button, Drawer, Empty, List, Popconfirm, Space, Spin, Tag, Typography } from 'antd';
import { HistoryOutlined, RollbackOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

export default function ContentHistoryDrawer({
  open,
  onClose,
  title = '历史版本',
  revisions = [],
  loading = false,
  restoringId = null,
  canRestore = true,
  onRestore,
  width = 460,
}) {
  return (
    <Drawer
      title={(
        <Space size={8}>
          <HistoryOutlined />
          <span>{title}</span>
        </Space>
      )}
      open={open}
      onClose={onClose}
      width={width}
      destroyOnClose
    >
      <Spin spinning={loading}>
        {revisions.length ? (
          <List
            dataSource={revisions}
            rowKey="id"
            renderItem={(revision, index) => (
              <List.Item
                actions={canRestore && index > 0 ? [
                  <Popconfirm
                    key="restore"
                    title="恢复到此版本？"
                    description="当前内容会生成新版本，可继续恢复。"
                    okText="恢复"
                    cancelText="取消"
                    onConfirm={() => onRestore?.(revision)}
                  >
                    <Button
                      type="link"
                      size="small"
                      icon={<RollbackOutlined />}
                      loading={Number(restoringId) === Number(revision.id)}
                    >
                      恢复
                    </Button>
                  </Popconfirm>,
                ] : []}
              >
                <List.Item.Meta
                  title={(
                    <Space size={8} wrap>
                      <Typography.Text strong>{revision.version_label || `V${revisions.length - index}`}</Typography.Text>
                      <Tag>{revision.action_label || '保存'}</Tag>
                      {index === 0 && <Tag color="green">当前</Tag>}
                    </Space>
                  )}
                  description={(
                    <Space direction="vertical" size={2}>
                      <Typography.Text type="secondary">
                        {revision.created_by_name || revision.created_by_username || '系统'}
                      </Typography.Text>
                      <Typography.Text type="secondary">
                        {revision.created_at ? dayjs(revision.created_at).format('YYYY-MM-DD HH:mm:ss') : '-'}
                      </Typography.Text>
                    </Space>
                  )}
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无历史版本" />
        )}
      </Spin>
    </Drawer>
  );
}
