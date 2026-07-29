import React from 'react';
import { Button, Tooltip } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';

export default function SidebarToggleButton({
  collapsed,
  onToggle,
  expandLabel = '展开侧栏',
  collapseLabel = '收起侧栏',
  tooltipPlacement = 'top',
  className,
  style,
}) {
  const label = collapsed ? expandLabel : collapseLabel;
  return (
    <Tooltip title={label} placement={tooltipPlacement}>
      <Button
        type="text"
        size="small"
        className={className}
        aria-label={label}
        aria-expanded={!collapsed}
        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        onClick={onToggle}
        style={{
          width: 32,
          minWidth: 32,
          height: 32,
          padding: 0,
          color: '#6b7280',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '0 0 32px',
          ...style,
        }}
      />
    </Tooltip>
  );
}
