import React from 'react';
import {
  Avatar,
  Button,
  Drawer,
  Empty,
  List,
  Popconfirm,
  Space,
  Spin,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { ClockCircleOutlined, HistoryOutlined, RollbackOutlined } from '@ant-design/icons';
import { formatBusinessDateTime } from '../utils/businessTime';

const { Text } = Typography;

function formatRevisionTime(value) {
  return formatBusinessDateTime(value, 'YYYY-MM-DD HH:mm:ss');
}

function getRevisionActor(revision) {
  return revision?.created_by_name || revision?.created_by_username || '系统';
}

function RestoreAction({
  revision,
  index,
  canRestore,
  restoringId,
  onRestore,
  iconOnly = false,
}) {
  const available = Boolean(canRestore && index > 0 && revision?.can_restore !== 0);
  if (!available) return null;
  const button = (
    <Button
      type={iconOnly ? 'text' : 'link'}
      size="small"
      icon={<RollbackOutlined />}
      aria-label="恢复到此版本"
      loading={Number(restoringId) === Number(revision.id)}
    >
      {iconOnly ? null : '恢复'}
    </Button>
  );
  return (
    <Popconfirm
      title="恢复到此版本？"
      description="当前内容会生成新版本，可继续恢复。"
      okText="恢复"
      cancelText="取消"
      onConfirm={() => onRestore?.(revision)}
    >
      {iconOnly ? <Tooltip title="恢复到此版本">{button}</Tooltip> : button}
    </Popconfirm>
  );
}

function VersionRecords({ revisions, canRestore, restoringId, onRestore }) {
  if (!revisions.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无版本记录" />;
  }
  return (
    <List
      dataSource={revisions}
      rowKey="id"
      renderItem={(revision, index) => (
        <List.Item
          actions={index > 0 ? [
            <RestoreAction
              key="restore"
              revision={revision}
              index={index}
              canRestore={canRestore}
              restoringId={restoringId}
              onRestore={onRestore}
            />,
          ] : []}
        >
          <List.Item.Meta
            title={(
              <Space size={8} wrap>
                <Text strong>{revision.version_label || `V${revisions.length - index}`}</Text>
                <Tag>{revision.action_label || '保存'}</Tag>
                {index === 0 && <Tag color="green">当前</Tag>}
              </Space>
            )}
            description={(
              <Space direction="vertical" size={2}>
                <Text type="secondary">{getRevisionActor(revision)}</Text>
                <Text type="secondary">{formatRevisionTime(revision.created_at)}</Text>
              </Space>
            )}
          />
        </List.Item>
      )}
    />
  );
}

function ChangeItem({ item }) {
  return (
    <div>
      <Text type="secondary" style={{ fontSize: 12 }}>{item?.label || '更新内容'}</Text>
      {item?.before && item.before !== item.after && (
        <div style={{ marginTop: 4, color: '#94a3b8', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {item.before}
        </div>
      )}
      <div style={{
        marginTop: 4,
        padding: '4px 6px',
        color: '#166534',
        background: '#f0fdf4',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {item?.after || '已清空'}
      </div>
    </div>
  );
}

function PageEditRecords({ revisions, entityTitle, canRestore, restoringId, onRestore }) {
  if (!revisions.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无页面编辑记录" />;
  }
  return (
    <List
      dataSource={revisions}
      rowKey="id"
      split={false}
      renderItem={(revision, index) => {
        const actor = getRevisionActor(revision);
        const changeItems = Array.isArray(revision.change_items) ? revision.change_items : [];
        return (
          <List.Item style={{ padding: '0 0 14px', borderBlockEnd: 'none' }}>
            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <div style={{ position: 'relative', width: 34, display: 'flex', justifyContent: 'center' }}>
                {index < revisions.length - 1 && (
                  <div style={{ position: 'absolute', top: 34, bottom: -18, width: 1, background: '#e5e7eb' }} />
                )}
                <Avatar size={32} style={{ background: '#dbeafe', color: '#2563eb', zIndex: 1 }}>
                  {actor.slice(0, 1).toUpperCase()}
                </Avatar>
              </div>
              <div style={{ flex: 1, minWidth: 0, border: '1px solid #eef2f7', borderRadius: 8, padding: 12, background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <Space direction="vertical" size={4} style={{ flex: 1, minWidth: 0 }}>
                    <Space size={6} wrap>
                      <Text strong>{actor}</Text>
                      <Text type="secondary">编辑了页面</Text>
                      <Text strong ellipsis={{ tooltip: entityTitle }}>{entityTitle || '当前内容'}</Text>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>{formatRevisionTime(revision.created_at)}</Text>
                  </Space>
                  <Space size={4}>
                    <RestoreAction
                      revision={revision}
                      index={index}
                      canRestore={canRestore}
                      restoringId={restoringId}
                      onRestore={onRestore}
                      iconOnly
                    />
                    <Tooltip title={revision.action_label || '保存'}>
                      <ClockCircleOutlined style={{ color: '#94a3b8', marginTop: 5 }} />
                    </Tooltip>
                  </Space>
                </div>
                <Space direction="vertical" size={10} style={{ width: '100%', marginTop: 10 }}>
                  {changeItems.length
                    ? changeItems.map(item => <ChangeItem key={item.field || item.label} item={item} />)
                    : <Text type="secondary">{revision.change_summary || revision.action_label || '保存了当前内容'}</Text>}
                </Space>
              </div>
            </div>
          </List.Item>
        );
      }}
    />
  );
}

export default function ContentHistoryDrawer({
  open,
  onClose,
  title = '改动历史',
  entityTitle = '',
  entityCode = '',
  revisions = [],
  loading = false,
  restoringId = null,
  canRestore = true,
  onRestore,
  width = 520,
}) {
  const currentRevision = revisions[0] || null;
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
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div style={{ padding: 12, border: '1px solid #eef2f7', borderRadius: 8, background: '#fafafa' }}>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Space size={8} wrap>
                {entityCode && <Tag>{entityCode}</Tag>}
                <Tag color="blue">{currentRevision?.version_label || 'V1'}</Tag>
                <Text type="secondary">最后编辑：{getRevisionActor(currentRevision)}</Text>
              </Space>
              <Text strong>{entityTitle || '当前内容'}</Text>
            </Space>
          </div>

          <Tabs
            defaultActiveKey="edits"
            items={[
              {
                key: 'versions',
                label: (
                  <Space size={6}>
                    <span>版本记录</span>
                    <Tag>{revisions.length} 条</Tag>
                  </Space>
                ),
                children: (
                  <VersionRecords
                    revisions={revisions}
                    canRestore={canRestore}
                    restoringId={restoringId}
                    onRestore={onRestore}
                  />
                ),
              },
              {
                key: 'edits',
                label: (
                  <Space size={6}>
                    <span>页面编辑记录</span>
                    <Tag color="green">{revisions.length} 条</Tag>
                  </Space>
                ),
                children: (
                  <PageEditRecords
                    revisions={revisions}
                    entityTitle={entityTitle}
                    canRestore={canRestore}
                    restoringId={restoringId}
                    onRestore={onRestore}
                  />
                ),
              },
            ]}
          />
        </Space>
      </Spin>
    </Drawer>
  );
}
