import React, { useState, useEffect } from 'react';
import { Badge, Dropdown, List, Button, Empty, Spin, message, Tag } from 'antd';
import { BellOutlined, CheckOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchUnreadCount();
    // 每30秒刷新一次未读数
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (dropdownOpen) {
      fetchNotifications();
    }
  }, [dropdownOpen]);

  const parseJsonSafely = async (res, fallbackMessage) => {
    if (!res.ok) {
      let messageText = fallbackMessage;
      try {
        const data = await res.json();
        messageText = data?.error || fallbackMessage;
      } catch {
        messageText = fallbackMessage;
      }
      throw new Error(messageText);
    }
    return res.json();
  };

  const fetchUnreadCount = async () => {
    try {
      const res = await fetch('/api/notifications/unread-count', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await parseJsonSafely(res, '通知未读数加载失败');
      setUnreadCount(data.count);
    } catch (err) {
      setUnreadCount(0);
      console.error(err);
    }
  };

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notifications?limit=20', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await parseJsonSafely(res, '加载通知失败');
      setNotifications(data);
    } catch (err) {
      setNotifications([]);
      message.error(err.message || '加载通知失败');
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id) => {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      await parseJsonSafely(res, '操作失败');
      fetchNotifications();
      fetchUnreadCount();
    } catch (err) {
      message.error(err.message || '操作失败');
    }
  };

  const markAllAsRead = async () => {
    try {
      const res = await fetch('/api/notifications/read-all', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      await parseJsonSafely(res, '操作失败');
      fetchNotifications();
      fetchUnreadCount();
      message.success('已全部标记为已读');
    } catch (err) {
      message.error(err.message || '操作失败');
    }
  };

  const deleteNotification = async (id) => {
    try {
      const res = await fetch(`/api/notifications/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      await parseJsonSafely(res, '删除失败');
      fetchNotifications();
      fetchUnreadCount();
      message.success('已删除');
    } catch (err) {
      message.error(err.message || '删除失败');
    }
  };

  const handleNotificationClick = (notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
      setDropdownOpen(false);
    }
  };

  const getTypeTag = (type) => {
    const map = {
      lead_assigned: { label: '线索', color: 'blue' },
      dev_task_assigned: { label: '任务', color: 'orange' },
      dev_task_completed: { label: '完成', color: 'green' },
      reminder: { label: '提醒', color: 'purple' },
    };
    const cfg = map[type] || { label: '通知', color: 'default' };
    return <Tag color={cfg.color} style={{ marginRight: 8 }}>{cfg.label}</Tag>;
  };

  const menu = (
    <div style={{ width: 360, maxHeight: 500, overflow: 'auto', backgroundColor: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>通知中心</span>
        {unreadCount > 0 && (
          <Button type="link" size="small" onClick={markAllAsRead}>全部已读</Button>
        )}
      </div>
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Spin />
        </div>
      ) : notifications.length === 0 ? (
        <Empty description="暂无通知" style={{ padding: 40 }} />
      ) : (
        <List
          dataSource={notifications}
          renderItem={(item) => (
            <List.Item
              style={{
                padding: '12px 16px',
                cursor: 'pointer',
                backgroundColor: item.is_read ? '#fff' : '#f0f7ff',
                borderBottom: '1px solid #f0f0f0',
              }}
              onClick={() => handleNotificationClick(item)}
              actions={[
                !item.is_read && (
                  <Button
                    type="text"
                    size="small"
                    icon={<CheckOutlined />}
                    onClick={(e) => { e.stopPropagation(); markAsRead(item.id); }}
                  />
                ),
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(e) => { e.stopPropagation(); deleteNotification(item.id); }}
                />,
              ].filter(Boolean)}
            >
              <List.Item.Meta
                title={
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {getTypeTag(item.type)}
                    <span style={{ fontWeight: item.is_read ? 'normal' : 600 }}>{item.title}</span>
                  </div>
                }
                description={
                  <div>
                    <div style={{ marginBottom: 4 }}>{item.content}</div>
                    <div style={{ fontSize: 12, color: '#999' }}>
                      {new Date(item.created_at).toLocaleString('zh-CN')}
                    </div>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );

  return (
    <Dropdown
      overlay={menu}
      trigger={['click']}
      open={dropdownOpen}
      onOpenChange={setDropdownOpen}
      placement="bottomRight"
    >
      <Badge count={unreadCount} offset={[-5, 5]}>
        <Button
          type="text"
          icon={<BellOutlined style={{ fontSize: 18 }} />}
          style={{ color: '#fff' }}
        />
      </Badge>
    </Dropdown>
  );
}
