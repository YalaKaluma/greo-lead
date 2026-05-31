import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import GoalReviewBanner from './GoalReviewBanner';
import { useLanguage } from '../i18n/LanguageContext';

export default function AlfredChat({ apiUrl, userNumber, preferredLanguage, onTourStep }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [goalReviewStatus, setGoalReviewStatus] = useState(null); // Track goal review status
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const { t, language } = useLanguage();
  const requestLanguage = preferredLanguage || language;

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Load recent conversation history on mount
  useEffect(() => {
    loadRecentMessages();
  }, []);

  const loadRecentMessages = async () => {
    try {
      const response = await axios.get(`${apiUrl}/api/chat/history`, {
        params: { user_number: userNumber, limit: 10 }
      });
      if (response.data.messages) {
        setMessages(response.data.messages);
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
    }
  };

  const sendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage = {
      role: 'user',
      content: inputValue,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    try {
      const response = await axios.post(`${apiUrl}/api/chat`, {
        user_number: userNumber,
        message: inputValue,
        preferred_language: requestLanguage
      });

      const assistantMessage = {
        role: 'assistant',
        content: response.data.reply,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Update goal review status from response
      setGoalReviewStatus(response.data.goal_review_status);

      // Check if this is a tour-related message
      if (onTourStep && response.data.tour_action) {
        onTourStep(response.data.tour_action);
      }

    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage = {
        role: 'assistant',
        content: t('chat.error'),
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleChat = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setUnreadCount(0);
    }
  };

  // Handle session end from banner
  const handleSessionEnd = () => {
    setGoalReviewStatus(null);
    // Add a system message
    const systemMessage = {
      role: 'assistant',
      content: t('chat.goalReviewEnded'),
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, systemMessage]);
  };

  // Simulate Alfred sending a message (for onboarding triggers)
  const sendAlfredMessage = (content) => {
    const message = {
      role: 'assistant',
      content,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, message]);
    if (!isOpen) {
      setUnreadCount(prev => prev + 1);
    }
  };

  // Expose method for parent components to trigger Alfred messages
  useEffect(() => {
    window.alfredChat = {
      sendMessage: sendAlfredMessage,
      open: () => setIsOpen(true)
    };
  }, [isOpen]);

  return (
    <>
      {/* Chat Window */}
      <div
        className={`fixed bottom-24 right-6 w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col transition-all duration-300 ease-out z-50 ${
          isOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'
        }`}
        style={{ 
          transformOrigin: 'bottom right',
          height: goalReviewStatus ? '640px' : '600px'
        }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white p-4 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center">
              <img 
                src="/alfred-logo.png" 
                alt="Alfred" 
                className="w-8 h-8 object-contain"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'block';
                }}
              />
              <span className="text-2xl" style={{ display: 'none' }}>🎩</span>
            </div>
            <div>
              <h3 className="font-semibold text-lg">Alfred</h3>
              <p className="text-xs text-gray-300">{t('chat.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={toggleChat}
            className="text-gray-300 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Goal Review Banner */}
        <GoalReviewBanner 
          status={goalReviewStatus}
          userNumber={userNumber}
          onSessionEnd={handleSessionEnd}
        />

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-8">
              <div className="text-4xl mb-2">👋</div>
              <p className="text-sm">{t('chat.emptyHello')}</p>
              <p className="text-xs mt-1">{t('chat.emptyPrompt')}</p>
            </div>
          )}
          
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-800 shadow-sm border border-gray-200'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white text-gray-800 shadow-sm border border-gray-200 rounded-2xl px-4 py-3">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-gray-200 bg-white rounded-b-2xl">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={t('chat.placeholder')}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={sendMessage}
              disabled={!inputValue.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {t('chat.send')}
            </button>
          </div>
        </div>
      </div>

      {/* Floating Button */}
      {false && (
      <button
        onClick={toggleChat}
        className="hidden"
      >
        {/* Alfred Logo */}
        <img 
          src="/alfred-logo.png" 
          alt="Chat with Alfred" 
          className="w-10 h-10 object-contain transition-transform duration-300 group-hover:rotate-12"
          onError={(e) => {
            e.target.style.display = 'none';
            e.target.nextSibling.style.display = 'block';
          }}
        />
        <span className="text-3xl" style={{ display: 'none' }}>🎩</span>
        
        {/* Unread Badge */}
        {unreadCount > 0 && !isOpen && (
          <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center animate-bounce">
            {unreadCount}
          </div>
        )}

        {/* Goal Review Indicator on Floating Button */}
        {goalReviewStatus && !isOpen && (
          <div className="absolute -top-2 -left-2 bg-blue-500 text-white text-xs font-bold rounded-full w-8 h-8 flex items-center justify-center shadow-lg">
            🎯
          </div>
        )}
      </button>
      )}
    </>
  );
}
