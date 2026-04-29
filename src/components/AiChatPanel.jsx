import { useEffect, useRef, useState } from 'react';
import MarkdownContent from './MarkdownContent.jsx';

function ChatBubble({ message }) {
  const isUser = message.role === 'user';
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 14,
    }}>
      <div style={{
        maxWidth: 'min(760px, 78%)',
        padding: '12px 14px',
        border: '0.5px solid var(--hairline)',
        borderRadius: 8,
        background: isUser ? 'var(--selected)' : 'var(--input-bg)',
        color: 'var(--fg)',
        fontFamily: isUser ? 'var(--ui-font)' : 'var(--reader-font)',
        fontSize: isUser ? 13 : 16,
        lineHeight: isUser ? 1.45 : 1.62,
      }}>
        {isUser ? message.content : <MarkdownContent content={message.content} />}
      </div>
    </div>
  );
}

export default function AiChatPanel({
  messages,
  status,
  onSend,
  onClear,
  hasApiKey,
}) {
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);
  const isSending = status === 'sending';

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, status]);

  const submit = () => {
    const text = draft.trim();
    if (!text || isSending) return;
    setDraft('');
    onSend(text);
  };

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--ui-font)',
      color: 'var(--fg)',
    }}>
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '28px 32px 22px',
        }}
      >
        {messages.length === 0 ? (
          <div style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--fg-faint)',
            fontSize: 13,
            textAlign: 'center',
          }}>
            Ask a question about your library or start a general reading conversation.
          </div>
        ) : (
          messages.map((message) => <ChatBubble key={message.id} message={message} />)
        )}
        {isSending ? (
          <div style={{ color: 'var(--fg-faint)', fontSize: 12, padding: '2px 0 12px' }}>
            Thinking…
          </div>
        ) : null}
      </div>

      <div style={{
        borderTop: '0.5px solid var(--hairline)',
        padding: '14px 22px 18px',
        background: 'var(--app-bg)',
      }}>
        {!hasApiKey ? (
          <div style={{
            marginBottom: 10,
            color: '#B45309',
            background: 'rgba(180, 83, 9, 0.08)',
            border: '0.5px solid rgba(180, 83, 9, 0.25)',
            borderRadius: 7,
            padding: '8px 10px',
            fontSize: 12,
          }}>
            Add an API key in Settings {'>'} AI API before sending a message.
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask AI about your books…"
            disabled={isSending}
            style={{
              flex: 1,
              minHeight: 46,
              maxHeight: 120,
              resize: 'vertical',
              padding: '10px 11px',
              border: '0.5px solid var(--hairline-strong)',
              borderRadius: 7,
              background: 'var(--input-bg)',
              color: 'var(--fg)',
              fontFamily: 'var(--ui-font)',
              fontSize: 13,
              lineHeight: 1.4,
            }}
          />
          <button
            onClick={submit}
            disabled={!draft.trim() || isSending}
            style={{
              height: 36,
              padding: '0 14px',
              border: '0.5px solid var(--hairline-strong)',
              borderRadius: 7,
              background: draft.trim() && !isSending ? 'var(--fg)' : 'var(--input-bg)',
              color: draft.trim() && !isSending ? 'var(--app-bg)' : 'var(--fg-faint)',
              fontFamily: 'var(--ui-font)',
              fontSize: 12,
              cursor: draft.trim() && !isSending ? 'pointer' : 'default',
            }}
          >
            Send
          </button>
          {messages.length > 0 ? (
            <button
              onClick={onClear}
              disabled={isSending}
              style={{
                height: 36,
                padding: '0 12px',
                border: '0.5px solid var(--hairline-strong)',
                borderRadius: 7,
                background: 'var(--input-bg)',
                color: 'var(--fg-muted)',
                fontFamily: 'var(--ui-font)',
                fontSize: 12,
                cursor: isSending ? 'default' : 'pointer',
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
