import React from 'react';
import './DauQueryAssistant.css';

export const DAU_QUERY_ASSISTANT_URL = 'https://ngwlcg9gyg3i.space.mcode.cn';
export const DAU_QUERY_ASSISTANT_ORIGIN = new URL(DAU_QUERY_ASSISTANT_URL).origin;

export function disableDauQueryAssistantInspector(frame) {
  const frameWindow = frame?.contentWindow;
  if (!frameWindow) return;

  frameWindow.postMessage({ type: 'disable-iframe-highlight' }, DAU_QUERY_ASSISTANT_ORIGIN);
  frameWindow.postMessage({ type: 'clear-selected-element' }, DAU_QUERY_ASSISTANT_ORIGIN);
}

export default function DauQueryAssistant() {
  return (
    <div className="dau-query-assistant">
      <iframe
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
