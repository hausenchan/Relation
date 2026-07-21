import React, { useMemo } from 'react';
import { Select, Space, Spin, Typography } from 'antd';
import {
  createEmptyShareDraft,
  updateDefaultShareUsers,
  updateExplicitShareUsers,
} from '../utils/contentShares';

const { Text } = Typography;

function selectOptions(rows, getLabel) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => ({ value: Number(row?.id), label: getLabel(row) }))
    .filter(option => option.value && option.label);
}

export default function ContentShareEditor({
  draft = createEmptyShareDraft(),
  onChange,
  loading = false,
  users = [],
  defaultUsers = [],
  projectGroups = [],
  departments = [],
  teams = [],
}) {
  const defaultUserIds = useMemo(
    () => defaultUsers.map(user => Number(user?.id)).filter(Boolean),
    [defaultUsers],
  );
  const defaultUserIdSet = useMemo(() => new Set(defaultUserIds), [defaultUserIds]);
  const selectedDefaultUserIds = (draft.user_ids || [])
    .map(Number)
    .filter(id => defaultUserIdSet.has(id));
  const selectedExplicitUserIds = (draft.user_ids || [])
    .map(Number)
    .filter(id => !defaultUserIdSet.has(id));
  const setDraft = (updater) => {
    const next = typeof updater === 'function' ? updater(draft) : updater;
    onChange?.(next);
  };

  return (
    <Spin spinning={loading}>
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        {defaultUsers.length > 0 && (
          <div>
            <Text strong>默认共享人</Text>
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="选择默认共享人"
              value={selectedDefaultUserIds}
              onChange={value => setDraft(current => updateDefaultShareUsers(
                current,
                defaultUserIds,
                value,
              ))}
              options={selectOptions(defaultUsers, user => user.display_name || user.username)}
              style={{ width: '100%', marginTop: 8 }}
            />
          </div>
        )}

        <div>
          <Text strong>项目组</Text>
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="选择项目组"
            value={draft.project_group_ids || []}
            onChange={value => setDraft(current => ({ ...current, project_group_ids: value }))}
            options={selectOptions(projectGroups, group => `${group.name}${group.code ? ` (${group.code})` : ''}`)}
            style={{ width: '100%', marginTop: 8 }}
          />
        </div>

        <div>
          <Text strong>部门</Text>
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="选择部门"
            value={draft.departments || []}
            onChange={value => setDraft(current => ({ ...current, departments: value }))}
            options={departments}
            style={{ width: '100%', marginTop: 8 }}
          />
        </div>

        <div>
          <Text strong>小组</Text>
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="选择小组"
            value={draft.team_ids || []}
            onChange={value => setDraft(current => ({ ...current, team_ids: value }))}
            options={selectOptions(teams, team => `${team.name}${team.department ? ` / ${team.department}` : ''}`)}
            style={{ width: '100%', marginTop: 8 }}
          />
        </div>

        <div>
          <Text strong>个人</Text>
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="选择个人"
            value={selectedExplicitUserIds}
            onChange={value => setDraft(current => updateExplicitShareUsers(
              current,
              defaultUserIds,
              value,
            ))}
            options={selectOptions(
              users.filter(user => !defaultUserIdSet.has(Number(user?.id))),
              user => user.display_name || user.username,
            )}
            style={{ width: '100%', marginTop: 8 }}
          />
        </div>
      </Space>
    </Spin>
  );
}
