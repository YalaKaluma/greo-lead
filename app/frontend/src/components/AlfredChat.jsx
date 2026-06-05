import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

export default function AlfredChat({ apiUrl, userNumber }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const loadMessages = async () => {
    if (!userNumber) return;

    setIsLoading(true);
    try {
      const response = await axios.get(`${apiUrl}/api/chat/history`, {
        params: {
          user_number: userNumber,
          limit: 50,
          conversation_type: 'messages'
        }
      });
      setMessages(response.data.messages || []);
    } catch (error) {
      console.error('Failed to load Alfred messages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadUnreadCount = async () => {
    if (!userNumber) return;

    try {
      const response = await axios.get(`${apiUrl}/api/chat/unread-nudges`, {
        params: { user_number: userNumber }
      });
      setUnreadCount(response.data.count || 0);
    } catch (error) {
      console.error('Failed to load unread Alfred messages:', error);
    }
  };

  const markMessagesRead = async () => {
    if (!userNumber) return;

    try {
      await axios.post(`${apiUrl}/api/chat/mark-nudges-read`, null, {
        params: { user_number: userNumber }
      });
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark Alfred messages read:', error);
    }
  };

  useEffect(() => {
    loadMessages();
    loadUnreadCount();
  }, [userNumber]);

  useEffect(() => {
    if (isOpen) {
      loadMessages();
      markMessagesRead();
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  useEffect(() => {
    window.alfredChat = {
      open: () => setIsOpen(true),
      sendMessage: (content) => {
        setMessages((current) => [
          ...current,
          {
            role: 'assistant',
            content,
            timestamp: new Date().toISOString(),
            message_type: 'notification',
            conversation_type: 'messages'
          }
        ]);
        setIsOpen(true);
      },
      refreshMessages: () => {
        loadMessages();
        loadUnreadCount();
      }
    };
  }, [userNumber]);

  const formatType = (messageType) => {
    if (messageType === 'nudge') return 'Nudge';
    if (messageType === 'notification') return 'Notification';
    return 'Message';
  };

  return (
    <>
      <div
        className={`fixed bottom-24 right-6 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-lg shadow-2xl border border-gray-200 flex flex-col transition-all duration-200 ease-out z-50 ${
          isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0 pointer-events-none'
        }`}
        style={{ transformOrigin: 'bottom right', height: '560px' }}
      >
        <div className="bg-slate-900 text-white px-5 py-4 rounded-t-lg flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg">Messages</h3>
            <p className="text-xs text-slate-300">Nudges, reminders, and Alfred updates</p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="h-9 w-9 rounded-md text-slate-300 hover:bg-slate-800 hover:text-white"
            aria-label="Close messages"
          >
            X
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50 px-4 py-4 space-y-3">
          {isLoading && (
            <div className="text-sm text-slate-500">Loading messages...</div>
          )}

          {!isLoading && messages.length === 0 && (
            <div className="h-full flex items-center justify-center text-center text-sm text-slate-500 px-8">
              Alfred messages, nudges, and system updates will appear here.
            </div>
          )}

          {messages.map((msg) => (
            <article
              key={msg.message_id || `${msg.timestamp}-${msg.content}`}
              className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {formatType(msg.message_type)}
                </span>
                <time className="text-xs text-slate-400">
                  {new Date(msg.timestamp).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </time>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{msg.content}</p>
            </article>
          ))}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <button
        onClick={() => setIsOpen((open) => !open)}
        className="fixed bottom-6 right-6 z-50 flex min-w-[116px] items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-xl transition-colors hover:bg-slate-800"
        aria-label="Open Alfred messages"
      >
        {unreadCount > 0 && (
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" aria-hidden="true" />
        )}
        <span>Alfred</span>
        {unreadCount > 0 && (
          <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-slate-950">
            {unreadCount}
          </span>
        )}
      </button>
    </>
  );
}
