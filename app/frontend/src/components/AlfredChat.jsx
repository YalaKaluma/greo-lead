import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import ReadAloudButton from './ReadAloudButton';
import MessageFeedbackButton from './MessageFeedbackButton';

export default function AlfredChat({ apiUrl, userNumber, currentPage, showLauncher = true }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
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
    if (isOpen) {
      setIsOpen(false);
    }
  }, [currentPage]);

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

  const sendReply = async (event) => {
    event.preventDefault();
    const content = replyText.trim();
    if (!content || isSending) return;

    const clientMessageId = `pending-${Date.now()}`;
    setReplyText('');
    setIsSending(true);
    setMessages((current) => [
      ...current,
      {
        clientMessageId,
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
        message_type: 'notification',
        conversation_type: 'messages'
      }
    ]);

    try {
      const response = await axios.post(`${apiUrl}/api/chat`, {
        user_number: userNumber,
        message: content,
        conversation_type: 'messages'
      });

      setMessages((current) => [
        ...current.map((message) => (
          message.clientMessageId === clientMessageId
            ? { ...message, message_id: response.data.user_message_id }
            : message
        )),
        {
          role: 'assistant',
          message_id: response.data.message_id,
          content: response.data.reply,
          timestamp: response.data.timestamp,
          message_type: response.data.conversation_type === 'messages' ? 'notification' : 'message',
          conversation_type: response.data.conversation_type || 'messages'
        }
      ]);
    } catch (error) {
      console.error('Failed to send Alfred message reply:', error);
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: 'Sorry, I could not send that reply. Please try again.',
          timestamp: new Date().toISOString(),
          message_type: 'notification',
          conversation_type: 'messages'
        }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <div
        className={`fixed inset-y-0 left-0 right-0 z-40 flex flex-col bg-gray-50 text-slate-900 transition-opacity duration-200 lg:left-80 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="bg-gray-50 px-4 pt-5 md:px-10 md:pt-8">
          <div className="mb-6 flex items-start justify-between gap-4">
          <div>
              <h3 className="text-3xl font-semibold text-slate-950 md:text-4xl">Messages</h3>
              <p className="mt-2 text-sm text-slate-500 md:text-base">Nudges, reminders, and Alfred updates.</p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
              className="h-10 w-10 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close messages"
          >
            X
          </button>
          </div>
          <div className="border-b border-slate-200" />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 pb-36 md:px-10">
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
              <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-100 pt-2">
                <ReadAloudButton
                  text={msg.content}
                  apiUrl={apiUrl}
                  className="text-slate-600 hover:bg-slate-100"
                />
                <MessageFeedbackButton
                  apiUrl={apiUrl}
                  messageId={msg.message_id}
                  sourceContext="messages"
                  className="text-slate-600 hover:bg-slate-100"
                />
              </div>
            </article>
          ))}

          <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="border-t border-slate-200 bg-white px-4 py-4 md:px-10">
          <form onSubmit={sendReply} className="mx-auto flex w-full max-w-4xl gap-3">
            <textarea
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  sendReply(event);
                }
              }}
              rows={3}
              placeholder="Write a reply to Alfred..."
              disabled={isSending}
              className="min-h-[88px] flex-1 resize-none rounded-lg border border-slate-300 px-4 py-3 text-sm leading-6 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
            />
            <button
              type="submit"
              disabled={!replyText.trim() || isSending}
              className="self-end rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSending ? 'Sending' : 'Send'}
            </button>
          </form>
        </div>
      </div>

      {showLauncher && (
        <button
          onClick={() => setIsOpen((open) => !open)}
          className="fixed bottom-8 left-6 z-50 flex h-16 w-16 items-center justify-center rounded-full border-2 border-amber-300 bg-slate-950 p-1 shadow-xl transition-transform hover:scale-105 lg:left-[232px]"
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
      )}
    </>
  );
}
