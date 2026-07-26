import React, { useEffect, useRef } from 'react';
import './DauQueryAssistant.css';

export const DAU_QUERY_ASSISTANT_URL = 'https://ngwlcg9gyg3i.space.mcode.cn';
export const DAU_QUERY_ASSISTANT_ORIGIN = new URL(DAU_QUERY_ASSISTANT_URL).origin;
const DAU_INSPECTOR_MESSAGE_SOURCE = 'iframe-highlight-injector';
const DAU_INSPECTOR_ACTIVITY_TYPES = new Set([
  'iframe-highlight-ready',
  'iframe-element-hover',
  'iframe-element-click',
]);

export function disableDauQueryAssistantInspector(frame) {
  const frameWindow = frame?.contentWindow;
  if (!frameWindow) return;

  frameWindow.postMessage({ type: 'disable-iframe-highlight' }, DAU_QUERY_ASSISTANT_ORIGIN);
  frameWindow.postMessage({ type: 'clear-selected-element' }, DAU_QUERY_ASSISTANT_ORIGIN);
}

export function isDauQueryAssistantInspectorActivity(event, frame) {
  return Boolean(
    frame?.contentWindow
    && event.origin === DAU_QUERY_ASSISTANT_ORIGIN
    && event.source === frame.contentWindow
    && event.data?.source === DAU_INSPECTOR_MESSAGE_SOURCE
    && DAU_INSPECTOR_ACTIVITY_TYPES.has(event.data?.type),
  );
}

export default function DauQueryAssistant() {
  const frameRef = useRef(null);

  useEffect(() => {
    const handleInspectorActivity = (event) => {
      const frame = frameRef.current;
      if (!isDauQueryAssistantInspectorActivity(event, frame)) return;
      disableDauQueryAssistantInspector(frame);
    };

    window.addEventListener('message', handleInspectorActivity);
    return () => window.removeEventListener('message', handleInspectorActivity);
  }, []);

  return (
    <div className="dau-query-assistant">
      <iframe
        ref={frameRef}
        className="dau-query-assistant-frame"
        data-testid="dau-query-assistant-frame"
        title="DAU查询助手"
        src={DAU_QUERY_ASSISTANT_URL}
        loading="eager"
        referrerPolicy="no-referrer"
        allow="clipboard-read; clipboard-write"
        sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
        onLoad={(event) => disableDauQueryAssistantInspector(event.currentTarget)}
      />
    </div>
  );
}
