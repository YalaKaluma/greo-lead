import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import axios from 'axios';
import ReadAloudButton from './ReadAloudButton';
import MessageFeedbackButton from './MessageFeedbackButton';
import VoiceRecorder from './VoiceRecorder';
import JournalDepthModal from './JournalDepthModal';
import JournalTrendsTab from './JournalTrendsTab';
import { useLanguage } from '../i18n/LanguageContext';

// Session stage configurations
const GOAL_REVIEW_STAGES = [
  { id: 'framing', label: 'Framing', description: 'Setting up the review' },
  { id: 'reflection', label: 'Reflection', description: 'Your perspective on progress' },
  { id: 'diagnosis', label: 'Diagnosis', description: 'Identifying blockers and patterns' },
  { id: 'adjustment', label: 'Adjustment', description: 'Choosing concrete actions' },
  { id: 'closure', label: 'Closure', description: 'Summary and next steps' }
];

const PEOPLE_REVIEW_STAGES = [
  { id: 'select_person', label: 'Selection', description: 'Choose who to review' },
  { id: 'reflection', label: 'Reflection', description: 'Current relationship state' },
  { id: 'diagnostics', label: 'Diagnostics', description: 'Patterns and dynamics' },
  { id: 'planning', label: 'Planning', description: 'Actions and next steps' },
  { id: 'closure', label: 'Closure', description: 'Summary and tasks' }
];

const LEADERSHIP_COACHING_STAGES = [
  { id: 'selection', label: 'Quadrant', description: 'Choose focus area' },
  { id: 'situation', label: 'Situation', description: 'Describe challenge' },
  { id: 'reflection', label: 'Reflection', description: 'Explore story' },
  { id: 'diagnostics', label: 'Diagnostics', description: 'Identify pattern' },
  { id: 'planning', label: 'Planning', description: 'Design experiment' },
  { id: 'closure', label: 'Closure', description: 'Synthesize insights' }
];

const DEPTH_BADGES = {
  1: 'Emerging Reflection',
  2: 'Self-Awareness',
  3: 'Self-Awareness',
  4: 'Pattern Recognition',
  5: 'Growth Mindset'
};

const JOURNAL_EMPTY_PROMPT = 'Every day contains lessons about who you are and how you can grow as a leader. This is where you capture them.';

//const SESSION_TYPES = [
//  { id: 'goal_review', label: 'Goal Review Session', icon: '🎯', color: 'blue', enabled: true },
//  { id: 'people_review', label: 'People Review Session', icon: '👥', color: 'purple', enabled: true },
//  { id: 'leadership_coaching', label: 'Leadership Coaching', icon: '🧭', color: 'green', enabled: true }
//];

const MyCoachingSessions = ({ apiUrl, userNumber }) => {
  const { t, language } = useLanguage();
  const showJournalTrends = true;
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [currentStage, setCurrentStage] = useState(null);
  const [stageIndex, setStageIndex] = useState(0);
  const [activeTab, setActiveTab] = useState('journal');
  const [selectedDepth, setSelectedDepth] = useState(null);
  const [trends, setTrends] = useState(null);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [trendsError, setTrendsError] = useState(null);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Grow the journal input with its content, then scroll once it reaches a
  // comfortable maximum height so the composer never takes over the screen.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
    input.style.overflowY = input.scrollHeight > 160 ? 'auto' : 'hidden';
  }, [inputMessage]);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  };

  useLayoutEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load chat history on mount

  useEffect(() => {
    loadChatHistory();
  }, [userNumber]);

  const loadChatHistory = async () => {
    try {
      const response = await axios.get(`${apiUrl}/api/chat/history`, {
        params: {
          user_number: userNumber,
          limit: 50,
          conversation_type: 'journal'
        }
      });
      setMessages(response.data.messages || []);
    } catch (error) {
      console.error('Error loading chat history:', error);
    }
  };

  const fetchReflectionTrends = async () => {
    if (!userNumber) return;
    setTrendsLoading(true);
    setTrendsError(null);
    try {
      const response = await axios.get(`${apiUrl}/api/journal/journal/trends`, {
        params: { user_number: userNumber }
      });
      setTrends(response.data);
    } catch (error) {
      console.error('Error loading reflection trends:', error);
      setTrendsError('Unable to load reflection trends right now.');
    } finally {
      setTrendsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'trends' && !trends && !trendsLoading && !trendsError) {
      fetchReflectionTrends();
    }
  }, [activeTab, trends, trendsLoading, trendsError, userNumber]);

  const getDepthDetails = (message) => {
    const score = message.reflection_depth_score;
    const level = message.reflection_depth_level;
    if (score === null || score === undefined) return null;

    return {
      score,
      level,
      level_label: message.reflection_depth_label || (level ? `Level ${level}` : 'Reflection Depth'),
      explanation: message.reflection_depth_explanation,
      recommendations: message.reflection_depth_recommendations,
      badge: DEPTH_BADGES[level]
    };
  };

  const startSession = async (sessionType) => {
    if (!['goal_review', 'people_review', 'leadership_coaching'].includes(sessionType)) return;

    console.log('Starting session:', sessionType);
    console.log('API URL:', apiUrl);
    console.log('User Number:', userNumber);

    setActiveSession(sessionType);
    
    // Set appropriate initial stage
    if (sessionType === 'goal_review') {
      setCurrentStage('framing');
      setStageIndex(0);
    } else if (sessionType === 'people_review') {
      setCurrentStage('select_person');
      setStageIndex(0);
    } else if (sessionType === 'leadership_coaching') {
      setCurrentStage('selection');
      setStageIndex(0);
    }
    
    setIsLoading(true);

    try {
      // Send message to start session
      const startMessage = sessionType === 'goal_review' 
        ? 'Start goal review session'
        : sessionType === 'people_review'
        ? 'Start people review session'
        : 'Start leadership coaching session';
        
      console.log('Sending POST to:', `${apiUrl}/api/chat`);
      const response = await axios.post(`${apiUrl}/api/chat`, {
        user_number: userNumber,
        message: startMessage,
        preferred_language: language,
        conversation_type: 'journal'
      });

      console.log('Response received:', response.data);

      const newMessage = {
        role: 'assistant',
        message_id: response.data.message_id,
        content: response.data.reply,
        timestamp: response.data.timestamp
      };

      setMessages(prev => [...prev, 
        {
          role: 'user',
          message_id: response.data.user_message_id,
          content: startMessage,
          timestamp: new Date().toISOString(),
          reflection_depth_score: response.data.user_reflection_depth_score,
          reflection_depth_level: response.data.user_reflection_depth_level,
          reflection_depth_label: response.data.user_reflection_depth_label,
          reflection_depth_explanation: response.data.user_reflection_depth_explanation,
          reflection_depth_recommendations: response.data.user_reflection_depth_recommendations
        },
        newMessage
      ]);
      setTrends(null);

      // Update stage from response if available
      if (sessionType === 'goal_review' && response.data.goal_review_status) {
        const status = response.data.goal_review_status;
        console.log('Goal review status:', status);
        setCurrentStage(status.stage);
        const idx = GOAL_REVIEW_STAGES.findIndex(s => s.id === status.stage);
        setStageIndex(idx >= 0 ? idx : 0);
      } else if (sessionType === 'people_review' && response.data.people_review_status) {
        const status = response.data.people_review_status;
        console.log('People review status:', status);
        setCurrentStage(status.phase);
        // People review doesn't have fixed stages like goal review
      }
    } catch (error) {
      console.error('Error starting session:', error);
      console.error('Error details:', error.response?.data);
      alert(`Failed to start session: ${error.message}\n\nCheck console for details.`);
      
      // Reset state on error
      setActiveSession(null);
      setCurrentStage(null);
      setStageIndex(0);
    } finally {
      setIsLoading(false);
    }
  };

  const jumpToStage = async (stageId, index) => {
    if (!activeSession) return;

    console.log('Jumping to stage:', stageId, 'index:', index);

    setIsLoading(true);
    try {
      const response = await axios.post(`${apiUrl}/api/goal-review/jump-to-stage`, {
        user_number: userNumber,
        stage: stageId
      });

      console.log('Jump response:', response.data);

      if (response.data.success) {
        setCurrentStage(stageId);
        setStageIndex(index);

        // Add system message about stage jump
        const systemMessage = {
          role: 'assistant',
          message_id: response.data.message_id,
          content: response.data.message || `Jumped to ${GOAL_REVIEW_STAGES[index].label} stage.`,
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, systemMessage]);
      }
    } catch (error) {
      console.error('Error jumping to stage:', error);
      console.error('Error details:', error.response?.data);
      alert(`Failed to change stage: ${error.message}\n\nCheck console for details.`);
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    const userMsg = inputMessage.trim();
    setInputMessage('');
    setIsLoading(true);

    // Add user message immediately
    const clientMessageId = `pending-${Date.now()}`;
    const newUserMessage = {
      clientMessageId,
      role: 'user',
      content: userMsg,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, newUserMessage]);

    try {
      const response = await axios.post(`${apiUrl}/api/chat`, {
        user_number: userNumber,
        message: userMsg,
        preferred_language: language,
        conversation_type: 'journal'
      });

      const assistantMessage = {
        role: 'assistant',
        message_id: response.data.message_id,
        content: response.data.reply,
        timestamp: response.data.timestamp
      };
      setMessages(prev => [
        ...prev.map((message) => (
          message.clientMessageId === clientMessageId
            ? {
                ...message,
                message_id: response.data.user_message_id,
                reflection_depth_score: response.data.user_reflection_depth_score,
                reflection_depth_level: response.data.user_reflection_depth_level,
                reflection_depth_label: response.data.user_reflection_depth_label,
                reflection_depth_explanation: response.data.user_reflection_depth_explanation,
                reflection_depth_recommendations: response.data.user_reflection_depth_recommendations
              }
            : message
        )),
        assistantMessage
      ]);
      setTrends(null);

      setActiveSession(null);
      setCurrentStage(null);
      setStageIndex(0);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const endSession = async () => {
    if (!activeSession) return;

    setIsLoading(true);
    try {
      const response = await axios.post(`${apiUrl}/api/goal-review/end`, null, {
        params: { user_number: userNumber }
      });

      if (response.data.success) {
        const endMessage = {
          role: 'assistant',
          content: response.data.message,
          timestamp: response.data.timestamp
        };
        setMessages(prev => [...prev, endMessage]);
        setActiveSession(null);
        setCurrentStage(null);
        setStageIndex(0);
      }
    } catch (error) {
      console.error('Error ending session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 text-slate-900">
      <div className="bg-gray-50 px-4 pt-5 md:px-10 md:pt-8">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold text-slate-950 md:text-4xl">
            {t('journal.title')}
          </h1>
          <p className="mt-2 text-sm text-slate-500 md:text-base">
            Transform experiences into insight, and insight into growth.
          </p>
        </div>

        <div className="mb-6 border-b border-slate-200">
          <div className="flex flex-wrap gap-6">
            <button
              type="button"
              onClick={() => setActiveTab('journal')}
              className={`relative px-2 pb-3 font-medium transition-colors ${
                activeTab === 'journal' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Journal
              {activeTab === 'journal' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
              )}
            </button>
            {showJournalTrends && (
              <button
                type="button"
                onClick={() => setActiveTab('trends')}
                className={`relative px-2 pb-3 font-medium transition-colors ${
                  activeTab === 'trends' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Trends
                {activeTab === 'trends' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Progress Dots - Only show when goal review session is active */}
        {activeTab === 'journal' && activeSession === 'goal_review' && (
          <div className="mt-6 flex items-center justify-center gap-2">
            {GOAL_REVIEW_STAGES.map((stage, index) => (
              <React.Fragment key={stage.id}>
                <div className="flex flex-col items-center">
                  <button
                    onClick={() => jumpToStage(stage.id, index)}
                    disabled={isLoading}
                    className={`
                      w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold
                      transition-all cursor-pointer
                      ${index === stageIndex
                        ? 'bg-blue-600 text-white shadow-lg scale-110'
                        : index < stageIndex
                          ? 'bg-green-500 text-white hover:bg-green-600'
                          : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                      }
                      ${isLoading ? 'cursor-not-allowed opacity-50' : 'hover:shadow-md'}
                    `}
                    title={`${stage.label}: ${stage.description}`}
                  >
                    {index < stageIndex ? '✓' : index + 1}
                  </button>
                  <span className={`
                    mt-2 text-xs font-medium
                    ${index === stageIndex ? 'text-blue-600' : 'text-gray-500'}
                  `}>
                    {stage.label}
                  </span>
                </div>
                {index < GOAL_REVIEW_STAGES.length - 1 && (
                  <div className={`
                    w-12 h-0.5 mb-6
                    ${index < stageIndex ? 'bg-green-500' : 'bg-gray-200'}
                  `} />
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Progress Dots - People Review */}
        {activeTab === 'journal' && activeSession === 'people_review' && (
          <div className="mt-6 flex items-center justify-center gap-2">
            {PEOPLE_REVIEW_STAGES.map((stage, index) => (
              <React.Fragment key={stage.id}>
                <div className="flex flex-col items-center">
                  <div
                    className={`
                      w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold
                      transition-all
                      ${currentStage === stage.id
                        ? 'bg-purple-600 text-white shadow-lg scale-110'
                        : PEOPLE_REVIEW_STAGES.findIndex(s => s.id === currentStage) > index
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 text-gray-500'
                      }
                    `}
                    title={`${stage.label}: ${stage.description}`}
                  >
                    {PEOPLE_REVIEW_STAGES.findIndex(s => s.id === currentStage) > index ? '✓' : index + 1}
                  </div>
                  <span className={`
                    mt-2 text-xs font-medium
                    ${currentStage === stage.id ? 'text-purple-600' : 'text-gray-500'}
                  `}>
                    {stage.label}
                  </span>
                </div>
                {index < PEOPLE_REVIEW_STAGES.length - 1 && (
                  <div className={`
                    w-12 h-0.5 mb-6
                    ${PEOPLE_REVIEW_STAGES.findIndex(s => s.id === currentStage) > index ? 'bg-green-500' : 'bg-gray-200'}
                  `} />
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Progress Dots - Leadership Coaching */}
        {activeTab === 'journal' && activeSession === 'leadership_coaching' && (
          <div className="mt-6 flex items-center justify-center gap-2">
            {LEADERSHIP_COACHING_STAGES.map((stage, index) => (
              <React.Fragment key={stage.id}>
                <div className="flex flex-col items-center">
                  <div
                    className={`
                      w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold
                      transition-all
                      ${currentStage === stage.id
                        ? 'bg-green-600 text-white shadow-lg scale-110'
                        : LEADERSHIP_COACHING_STAGES.findIndex(s => s.id === currentStage) > index
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 text-gray-500'
                      }
                    `}
                    title={`${stage.label}: ${stage.description}`}
                  >
                    {LEADERSHIP_COACHING_STAGES.findIndex(s => s.id === currentStage) > index ? '✓' : index + 1}
                  </div>
                  <span className={`
                    mt-2 text-xs font-medium
                    ${currentStage === stage.id ? 'text-green-600' : 'text-gray-500'}
                  `}>
                    {stage.label}
                  </span>
                </div>
                {index < LEADERSHIP_COACHING_STAGES.length - 1 && (
                  <div className={`
                    w-12 h-0.5 mb-6
                    ${LEADERSHIP_COACHING_STAGES.findIndex(s => s.id === currentStage) > index ? 'bg-green-500' : 'bg-gray-200'}
                  `} />
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* End Session Button */}
        {activeTab === 'journal' && activeSession && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={endSession}
              className="px-4 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
            >
              End Session
            </button>
          </div>
        )}
      </div>

      {showJournalTrends && activeTab === 'trends' ? (
        <div className="flex-1 overflow-y-auto bg-slate-50 px-4 pb-6 md:px-10">
          <JournalTrendsTab
            apiUrl={apiUrl}
            userNumber={userNumber}
            trends={trends}
            loading={trendsLoading}
            error={trendsError}
          />
        </div>
      ) : (
      <div className={`flex-1 overflow-y-auto px-4 pb-6 md:px-10 ${isVoiceRecording ? '' : 'space-y-4'}`}>
        {isVoiceRecording ? (
          <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center" role="status" aria-live="polite">
            <div className="relative mb-8 flex h-56 w-56 items-center justify-center md:h-64 md:w-64">
              <div className="absolute inset-0 rounded-full bg-amber-300/20 motion-safe:animate-ping" />
              <div className="absolute inset-5 rounded-full border border-amber-300/60 bg-amber-50 shadow-[0_0_60px_rgba(245,158,11,0.18)]" />
              <img
                src="/alfred-logo.png"
                alt="Alfred"
                className="relative h-44 w-44 rounded-full object-cover shadow-xl md:h-52 md:w-52"
              />
            </div>
            <h2 className="text-2xl font-semibold text-slate-900">Alfred is listening</h2>
            <div className="mt-5 flex h-9 items-center justify-center gap-1.5" aria-hidden="true">
              {[18, 30, 22, 36, 26, 32, 18].map((height, index) => (
                <span
                  key={index}
                  className="w-1.5 rounded-full bg-amber-500 motion-safe:animate-pulse"
                  style={{ height, animationDelay: `${index * 110}ms`, animationDuration: '700ms' }}
                />
              ))}
            </div>
            <p className="mt-4 text-sm text-slate-500">Speak naturally. Press Stop when you’re finished.</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-white border border-slate-200 rounded-full flex items-center justify-center mb-4 shadow-sm">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <p className="text-slate-400 max-w-md leading-6">
              {JOURNAL_EMPTY_PROMPT}
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const depth = getDepthDetails(msg);
            const isStarterExample = Boolean(msg.is_starter_example);

            return (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' && !isStarterExample ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`
                  max-w-[70%] rounded-lg px-4 py-3 shadow-sm
                  ${isStarterExample
                    ? 'border border-dashed border-slate-300 bg-slate-100 text-slate-500 opacity-80'
                    : msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-900'
                  }
                `}
              >
                {isStarterExample && (
                  <div className="mb-2 inline-flex rounded-full bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
                    Illustrative example - not user generated
                  </div>
                )}
                <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className={`
                    text-xs 
                    ${isStarterExample ? 'text-slate-400' : msg.role === 'user' ? 'text-blue-100' : 'text-gray-500'}
                  `}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    {msg.role === 'user' && depth && (
                      <button
                        type="button"
                        onClick={() => setSelectedDepth(depth)}
                        className={`inline-flex h-7 items-center justify-center rounded-full px-2 text-xs transition-colors ${
                          isStarterExample
                            ? 'text-slate-500 hover:bg-slate-200'
                            : msg.role === 'user'
                            ? 'text-blue-100 hover:bg-blue-500'
                            : 'text-gray-600 hover:bg-gray-200'
                        }`}
                        title="Show reflection depth details"
                      >
                        Depth
                      </button>
                    )}
                    <ReadAloudButton
                      text={msg.content}
                      apiUrl={apiUrl}
                      className={isStarterExample
                        ? 'text-slate-500 hover:bg-slate-200'
                        : msg.role === 'user'
                        ? 'text-blue-100 hover:bg-blue-500'
                        : 'text-gray-600 hover:bg-gray-200'
                      }
                    />
                    {msg.role !== 'user' && (
                      <MessageFeedbackButton
                        apiUrl={apiUrl}
                        messageId={msg.message_id}
                        userNumber={userNumber}
                        sourceContext="journal"
                        className="text-gray-600 hover:bg-gray-200"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
            );
          })
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-4 py-3 shadow-sm">
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
      )}

      {/* Input Area */}
      {activeTab === 'journal' && (
      <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-4 md:px-10">
        <form onSubmit={sendMessage} className="flex w-full min-w-0 items-end gap-2 md:gap-3">
          <textarea
            ref={inputRef}
            rows={1}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={activeSession ? t('coaching.sharePlaceholder') : JOURNAL_EMPTY_PROMPT}
            disabled={isLoading}
            className="min-h-12 min-w-0 flex-1 resize-none overflow-x-hidden rounded-lg border border-gray-300 px-4 py-3 leading-6 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100"
            style={{ maxHeight: '160px' }}
          />

          <div className="shrink-0">
            <VoiceRecorder
              apiUrl={apiUrl}
              disabled={isLoading}
              onTranscript={(text) => setInputMessage(text)}
              onRecordingChange={setIsVoiceRecording}
            />
          </div>

          <button
            type="submit"
            disabled={!inputMessage.trim() || isLoading}
            className="shrink-0 rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 md:px-6"
          >
            {t('chat.send')}
          </button>
        </form>
      </div>
      )}
      <JournalDepthModal depth={selectedDepth} onClose={() => setSelectedDepth(null)} />
    </div>
  );
};

export default MyCoachingSessions;
