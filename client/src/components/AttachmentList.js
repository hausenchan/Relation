import React, { useState, useEffect, useCallback } from 'react';
import { Button, Space, Typography, message } from 'antd';
import { PaperClipOutlined, DownloadOutlined, DeleteOutlined } from '@ant-design/icons';
import { attachmentsApi } from '../api';

const { Text } = Typography;

export default function AttachmentList({ sourceType, sourceId, title = '附件' }) {
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);

  const currentUserId = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').id; } catch { return null; }
  })();

  const load = useCallback(async () => {
    if (!sourceType || !sourceId) return;
    setLoading(true);
    try {
      const atts = await attachmentsApi.list({ source_type: sourceType, source_id: sourceId });
      setAttachments(atts);
    } catch {
      setAttachments([]);
    } finally {
      setLoading(false);
    }
  }, [sourceType, sourceId]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    try {
      await attachmentsApi.delete(id);
      message.success('删除成功');
      load();
    } catch {
      message.error('删除失败');
    }
  };

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937', marginBottom: 12 }}>
        <PaperClipOutlined style={{ marginRight: 6 }} />{title}
      </div>
      {loading ? (
        <Text style={{ color: '#9ca3af' }}>加载中...</Text>
      ) : attachments.length === 0 ? (
        <Text style={{ color: '#9ca3af' }}>暂无附件</Text>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          {attachments.map(att => (
            <div
              key={att.id}
              style={{
                padding: '8px 12px',
                background: '#f9fafb',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div
                  style={{
                    fontSize: 13,
                    color: '#374151',
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {att.filename}
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                  {(att.size / 1024).toFixed(1)} KB · {att.creator_name || '未知'}
                </div>
              </div>
              <Space size={4}>
                <Button
                  type="text"
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={() => attachmentsApi.download(att.id, att.filename).catch(() => message.error('下载失败'))}
                />
                {att.created_by === currentUserId && (
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleDelete(att.id)}
                  />
                )}
              </Space>
            </div>
          ))}
        </Space>
      )}
    </div>
  );
}
