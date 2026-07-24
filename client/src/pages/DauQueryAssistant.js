import React from 'react';
import './DauQueryAssistant.css';

export const DAU_QUERY_ASSISTANT_URL = 'https://ngwlcg9gyg3i.space.mcode.cn';

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
      />
    </div>
  );
}
