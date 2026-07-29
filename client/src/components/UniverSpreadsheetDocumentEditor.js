import React, { useEffect, useMemo, useRef, useState } from 'react';
import './UniverSpreadsheetDocumentEditor.css';
import {
  relationWorkbookToUniverSnapshot,
  univerSnapshotToRelationWorkbook,
} from '../utils/spreadsheetUniverAdapter';

const SAVE_DEBOUNCE_MS = 420;

async function loadUniverRuntime() {
  const [
    presets,
    sheetsCore,
    sheetsSort,
    sheetsFilter,
    zhCNCore,
    zhCNSort,
    zhCNFilter,
  ] = await Promise.all([
    import('@univerjs/presets'),
    import('@univerjs/preset-sheets-core'),
    import('@univerjs/preset-sheets-sort'),
    import('@univerjs/preset-sheets-filter'),
    import('@univerjs/preset-sheets-core/locales/zh-CN'),
    import('@univerjs/preset-sheets-sort/locales/zh-CN'),
    import('@univerjs/preset-sheets-filter/locales/zh-CN'),
    import('@univerjs/preset-sheets-core/lib/index.css'),
    import('@univerjs/preset-sheets-sort/lib/index.css'),
    import('@univerjs/preset-sheets-filter/lib/index.css'),
  ]);

  return {
    createUniver: presets.createUniver,
    LocaleType: presets.LocaleType,
    LogLevel: presets.LogLevel,
    mergeLocales: presets.mergeLocales,
    UniverSheetsCorePreset: sheetsCore.UniverSheetsCorePreset,
    UniverSheetsSortPreset: sheetsSort.UniverSheetsSortPreset,
    UniverSheetsFilterPreset: sheetsFilter.UniverSheetsFilterPreset,
    zhCNCore: zhCNCore.default,
    zhCNSort: zhCNSort.default,
    zhCNFilter: zhCNFilter.default,
  };
}

export default function UniverSpreadsheetDocumentEditor({
  workbook,
  canEdit = false,
  onWorkbookChange,
  collaborationNotice = '',
  fillAvailableHeight = false,
}) {
  const containerId = useMemo(() => `relation-univer-${Math.random().toString(36).slice(2)}`, []);
  const hostRef = useRef(null);
  const univerRef = useRef(null);
  const workbookRef = useRef(null);
  const saveTimerRef = useRef(null);
  const disposedRef = useRef(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    disposedRef.current = false;
    let cancelled = false;
    const snapshot = relationWorkbookToUniverSnapshot(workbook, {
      workbookId: `relation_${containerId}`,
      name: '在线表格',
    });

    loadUniverRuntime().then(runtime => {
      if (cancelled || disposedRef.current) return;
      const {
        createUniver,
        LocaleType,
        LogLevel,
        mergeLocales,
        UniverSheetsCorePreset,
        UniverSheetsSortPreset,
        UniverSheetsFilterPreset,
        zhCNCore,
        zhCNSort,
        zhCNFilter,
      } = runtime;
      const { univer, univerAPI } = createUniver({
        locale: LocaleType.ZH_CN,
        locales: {
          [LocaleType.ZH_CN]: mergeLocales(zhCNCore, zhCNSort, zhCNFilter),
        },
        logLevel: LogLevel.ERROR,
        presets: [
          [UniverSheetsCorePreset({
            container: containerId,
            header: true,
            toolbar: true,
            formulaBar: true,
            footer: true,
            contextMenu: true,
            menu: true,
            ribbonType: 'toolbar',
            sheets: {
              freezeSync: true,
            },
          }), { lazy: true }],
          [UniverSheetsSortPreset(), { lazy: true }],
          [UniverSheetsFilterPreset({ enableSyncSwitch: false }), { lazy: true }],
        ],
      });
      const fWorkbook = univerAPI.createWorkbook(snapshot);
      univerRef.current = { univer, univerAPI, commandDisposable: null };
      workbookRef.current = fWorkbook;

      const scheduleSave = () => {
        if (!canEdit || disposedRef.current || !workbookRef.current) return;
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(() => {
          if (disposedRef.current || !workbookRef.current) return;
          const nextSnapshot = workbookRef.current.save();
          const nextWorkbook = univerSnapshotToRelationWorkbook(nextSnapshot);
          onWorkbookChange?.(nextWorkbook);
        }, SAVE_DEBOUNCE_MS);
      };

      univerRef.current.commandDisposable = univerAPI.onCommandExecuted(command => {
        const id = String(command?.id || '');
        if (
          id.includes('set') ||
          id.includes('insert') ||
          id.includes('remove') ||
          id.includes('delete') ||
          id.includes('sort') ||
          id.includes('filter') ||
          id.includes('freeze') ||
          id.includes('move') ||
          id.includes('paste') ||
          id.includes('clear') ||
          id.includes('format')
        ) {
          scheduleSave();
        }
      });
    }).catch(error => {
      setLoadError(error?.message || 'Univer 在线表格加载失败');
    });

    return () => {
      cancelled = true;
      disposedRef.current = true;
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      try {
        const activeWorkbook = workbookRef.current;
        if (canEdit && activeWorkbook) {
          onWorkbookChange?.(univerSnapshotToRelationWorkbook(activeWorkbook.save()));
        }
      } catch {
        // Ignore snapshot errors during teardown; the active autosave loop remains the primary path.
      }
      try {
        univerRef.current?.commandDisposable?.dispose?.();
        workbookRef.current?.dispose?.();
        univerRef.current?.univer?.dispose?.();
      } catch {
        // Univer owns many DOM services; disposal should never block tab switching.
      }
      univerRef.current = null;
      workbookRef.current = null;
    };
  }, [containerId]);

  return (
    <div
      ref={hostRef}
      className={`relation-univer-sheet relation-univer-shimo-skin${fillAvailableHeight ? ' relation-univer-sheet--fill' : ''}`}
      data-spreadsheet-univer-editor="true"
      data-can-edit={canEdit ? 'true' : 'false'}
    >
      {collaborationNotice ? (
        <div className="relation-univer-notice" data-spreadsheet-collaboration-notice="true">
          {collaborationNotice}
        </div>
      ) : null}
      {loadError ? (
        <div className="relation-univer-error" role="alert">
          {loadError}
        </div>
      ) : null}
      <div id={containerId} className="relation-univer-host" />
      {!canEdit ? (
        <div className="relation-univer-readonly-mask" aria-label="只读在线表格">
          <span>只读</span>
        </div>
      ) : null}
    </div>
  );
}
