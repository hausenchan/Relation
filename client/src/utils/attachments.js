import { Upload, message } from 'antd';
import { attachmentsApi } from '../api';

export const ALLOWED_ATTACHMENT_EXT = [
  'jpg', 'jpeg', 'png', 'gif', 'webp',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt',
  'mp4', 'mov', 'avi', 'mp3', 'wav', 'm4a', 'aac', 'ogg',
];

export const ATTACHMENT_ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.mp4,.mov,.avi,.mp3,.wav,.m4a,.aac,.ogg';

export const MAX_ATTACHMENT_SIZE = 100 * 1024 * 1024;

export function validateAttachment(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_ATTACHMENT_EXT.includes(ext)) {
    message.error('不支持该文件格式');
    return Upload.LIST_IGNORE;
  }
  if (file.size > MAX_ATTACHMENT_SIZE) {
    message.error('单个文件不能超过 100MB');
    return Upload.LIST_IGNORE;
  }
  return false;
}

export async function uploadAttachments(sourceType, sourceId, files) {
  if (!files?.length) return [];
  const formData = new FormData();
  formData.append('source_type', sourceType);
  formData.append('source_id', sourceId);
  files.forEach(file => formData.append('files', file.originFileObj || file));
  return attachmentsApi.upload(formData);
}
