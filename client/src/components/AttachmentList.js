import React, { useState, useEffect, useCallback } from 'react';
import { Button, Space, Typography, message, Image, Spin, Tooltip, Alert } from 'antd';
import { PaperClipOutlined, DownloadOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { attachmentsApi } from '../api';

const { Text } = Typography;

const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const videoExts = ['mp4', 'webm', 'ogg', 'mov'];
const officeExts = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

function getAttachmentExt(filename = '') {
  return (filename.split('.').pop() || '').toLowerCase();
}

function getAttachmentKind(att) {
  const mime = att?.mimetype || '';
  const ext = getAttachmentExt(att?.filename);
  if (mime.startsWith('image/') || imageExts.includes(ext)) return 'image';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.startsWith('video/') || videoExts.includes(ext)) return 'video';
  if (mime.startsWith('text/') || ext === 'txt') return 'text';
  if (officeExts.includes(ext)) return 'office';
  return 'unknown';
}

function canInlinePreview(att) {
  return ['image', 'pdf', 'video', 'text'].includes(getAttachmentKind(att));
}

export default function AttachmentList({ sourceType, sourceId, title = '附件', showPreview = false }) {
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [preview, setPreview] = useState({ loading: false, url: '', text: '', error: '' });

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

  useEffect(() => {
    if (!showPreview) return;
    setPreviewAttachment(prev => {
      if (prev && attachments.some(att => att.id === prev.id)) return prev;
      return attachments.find(canInlinePreview) || attachments[0] || null;
    });
  }, [attachments, showPreview]);

  useEffect(() => {
    if (!showPreview || !previewAttachment) {
      setPreview({ loading: false, url: '', text: '', error: '' });
      return undefined;
    }

    const kind = getAttachmentKind(previewAttachment);
    if (!canInlinePreview(previewAttachment)) {
      setPreview({ loading: false, url: '', text: '', error: '' });
      return undefined;
    }

    let cancelled = false;
    let objectUrl = '';
    setPreview({ loading: true, url: '', text: '', error: '' });

    attachmentsApi.getBlob(previewAttachment.id)
      .then(async blob => {
        if (kind === 'text') {
          const text = await blob.text();
          if (!cancelled) setPreview({ loading: false, url: '', text, error: '' });
          return;
        }

        const nextUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        objectUrl = nextUrl;
        setPreview({ loading: false, url: nextUrl, text: '', error: '' });
      })
      .catch(() => {
        if (!cancelled) setPreview({ loading: false, url: '', text: '', error: '附件预览加载失败' });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [previewAttachment, showPreview]);

  const handleDelete = async (id) => {
    try {
      await attachmentsApi.delete(id);
      message.success('删除成功');
      load();
    } catch {
      message.error('删除失败');
    }
  };

  const renderPreview = () => {
    if (!showPreview || !previewAttachment) return null;

    const kind = getAttachmentKind(previewAttachment);
    const previewBoxStyle = {
      marginTop: 12,
      padding: 12,
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      background: '#fff',
    };

    return (
      <div style={previewBoxStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10 }}>
          <Text strong style={{ fontSize: 13 }}>预览：{previewAttachment.filename}</Text>
          <Button
            type="link"
            size="small"
            onClick={() => attachmentsApi.download(previewAttachment.id, previewAttachment.filename).catch(() => message.error('下载失败'))}
          >
            下载
          </Button>
        </div>

        {preview.loading ? (
          <div style={{ minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="small" />
          </div>
        ) : preview.error ? (
          <Alert type="warning" showIcon message={preview.error} />
        ) : kind === 'image' && preview.url ? (
          <Image
            src={preview.url}
            alt={previewAttachment.filename}
            style={{ maxHeight: 360, width: '100%', objectFit: 'contain', background: '#f9fafb' }}
          />
        ) : kind === 'video' && preview.url ? (
          <video
            controls
            src={preview.url}
            style={{ width: '100%', maxHeight: 380, borderRadius: 6, background: '#000' }}
          >
            当前浏览器不支持播放该视频。
          </video>
        ) : kind === 'pdf' && preview.url ? (
          <iframe
            title={previewAttachment.filename}
            src={preview.url}
            style={{ width: '100%', height: 420, border: '1px solid #e5e7eb', borderRadius: 6 }}
          />
        ) : kind === 'text' ? (
          <pre style={{ maxHeight: 320, overflow: 'auto', margin: 0, padding: 12, background: '#f9fafb', borderRadius: 6, whiteSpace: 'pre-wrap' }}>
            {preview.text}
          </pre>
        ) : (
          <Alert
            type="info"
            showIcon
            message={kind === 'office' ? '该文档类型暂不支持直接预览' : '该附件类型暂不支持直接预览'}
            description="可先下载后用本地软件查看。"
          />
        )}
      </div>
    );
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
              onClick={() => showPreview && setPreviewAttachment(att)}
              style={{
                padding: '8px 12px',
                background: previewAttachment?.id === att.id ? '#eef4ff' : '#f9fafb',
                border: previewAttachment?.id === att.id ? '1px solid #91caff' : '1px solid transparent',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: showPreview ? 'pointer' : 'default',
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
                {showPreview && (
                  <Tooltip title={canInlinePreview(att) ? '预览' : '查看说明'}>
                    <Button
                      type="text"
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewAttachment(att);
                      }}
                    />
                  </Tooltip>
                )}
                <Button
                  type="text"
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    attachmentsApi.download(att.id, att.filename).catch(() => message.error('下载失败'));
                  }}
                />
                {att.created_by === currentUserId && (
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(att.id);
                    }}
                  />
                )}
              </Space>
            </div>
          ))}
        </Space>
      )}
      {renderPreview()}
    </div>
  );
}
