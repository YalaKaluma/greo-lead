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
        className={`fixed inset-0 z-50 flex flex-col bg-slate-50 transition-opacity duration-200 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-2xl">Messages</h3>
            <p className="text-sm text-slate-300">Nudges, reminders, and Alfred updates</p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="h-10 w-10 rounded-md text-slate-300 hover:bg-slate-800 hover:text-white"
            aria-label="Close messages"
          >
            X
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto w-full max-w-4xl space-y-4">
          {isLoading && (
            <div className="text-sm text-slate-500">Loading messages...</div>
          )}

          {!isLoading && messages.length === 0 && (
            <div className="flex min-h-[50vh] items-center justify-center text-center text-sm text-slate-500 px-8">
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
      </div>

      <button
        onClick={() => setIsOpen((open) => !open)}
        className="fixed bottom-24 left-6 z-50 flex h-16 w-16 items-center justify-center rounded-full border-2 border-amber-300 bg-slate-950 p-1 shadow-xl transition-transform hover:scale-105"
        aria-label="Open Alfred messages"
      >
        <img
          src="/alfred-logo.png"
          alt=""
          className="h-full w-full rounded-full object-cover"
          aria-hidden="true"
        />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-400 px-1.5 text-xs font-bold text-slate-950 ring-2 ring-white">
            {unreadCount}
          </span>
        )}
      </button>
    </>
  );
}
