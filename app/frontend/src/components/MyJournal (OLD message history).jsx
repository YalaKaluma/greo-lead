import { useState, useEffect } from 'react';
import axios from 'axios';

export default function MyJournal({ apiUrl, userNumber }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // all, user, assistant

  useEffect(() => {
    fetchMessages();
  }, []);

  const fetchMessages = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch conversation history
      const response = await axios.get(`${apiUrl}/api/messages`, {
        params: { user_number: userNumber }
      });
      
      if (response.data && Array.isArray(response.data)) {
        setMessages(response.data);
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
      setError('Failed to load journal messages');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) {
      return 'Today at ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (diffInDays === 1) {
      return 'Yesterday at ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (diffInDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' });
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    }
  };

  const filteredMessages = messages.filter(msg => {
    if (filter === 'all') return true;
    return msg.sender === filter;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-800">My Journal</h1>
        <p className="text-slate-600 mt-1">Your conversation history with Alfred</p>
      </div>

      {/* Filter Buttons */}
      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-slate-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          All Messages ({messages.length})
        </button>
        <button
          onClick={() => setFilter('user')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'user'
              ? 'bg-green-600 text-white'
              : 'bg-white text-slate-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          My Messages ({messages.filter(m => m.sender === 'user').length})
        </button>
        <button
          onClick={() => setFilter('assistant')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'assistant'
              ? 'bg-purple-600 text-white'
              : 'bg-white text-slate-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          Alfred's Messages ({messages.filter(m => m.sender === 'assistant').length})
        </button>
      </div>

      {/* Messages */}
      {filteredMessages.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-600 text-lg">
            No messages yet. Start chatting with Alfred to build your journal!
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredMessages.map((message, index) => (
            <div
              key={message.id || index}
              className={`rounded-lg p-4 ${
                message.sender === 'user'
                  ? 'bg-green-50 border border-green-200 ml-8'
                  : 'bg-purple-50 border border-purple-200 mr-8'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    message.sender === 'user'
                      ? 'bg-green-600 text-white'
                      : 'bg-purple-600 text-white'
                  }`}>
                    {message.sender === 'user' ? 'Y' : 'A'}
                  </div>
                  <span className="font-semibold text-slate-800">
                    {message.sender === 'user' ? 'You' : 'Alfred'}
                  </span>
                </div>
                <span className="text-xs text-slate-500">
                  {formatDate(message.timestamp)}
                </span>
              </div>

              {/* Message Content */}
              <div className="text-slate-700 whitespace-pre-wrap pl-10">
                {message.content}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats at bottom */}
      {messages.length > 0 && (
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">{messages.length}</div>
              <div className="text-sm text-slate-600">Total Messages</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">
                {messages.filter(m => m.sender === 'user').length}
              </div>
              <div className="text-sm text-slate-600">Your Messages</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">
                {messages.filter(m => m.sender === 'assistant').length}
              </div>
              <div className="text-sm text-slate-600">Alfred's Messages</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
