import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReadAloudButton from './ReadAloudButton';
import VoiceRecorder from './VoiceRecorder';

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

//const SESSION_TYPES = [
//  { id: 'goal_review', label: 'Goal Review Session', icon: '🎯', color: 'blue', enabled: true },
//  { id: 'people_review', label: 'People Review Session', icon: '👥', color: 'purple', enabled: true },
//  { id: 'leadership_coaching', label: 'Leadership Coaching', icon: '🧭', color: 'green', enabled: true }
//];

const MyCoachingSessions = ({ apiUrl, userNumber }) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [currentStage, setCurrentStage] = useState(null);
  const [stageIndex, setStageIndex] = useState(0);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load chat history on mount

  useEffect(() => {
  loadChatHistory();

  const markNudgesRead = async () => {
    try {
      await axios.post(
        `${apiUrl}/api/chat/mark-nudges-read`,
        null,
        {
          params: { user_number: userNumber }
        }
      );
    } catch (error) {
      console.error('Failed to mark nudges read:', error);
    }
  };

  if (userNumber) {
    markNudgesRead();
  }

}, [userNumber]);



  const loadChatHistory = async () => {
    try {
      const response = await axios.get(`${apiUrl}/api/chat/history`, {
        params: { user_number: userNumber, limit: 50 }
      });
      setMessages(response.data.messages || []);
    } catch (error) {
      console.error('Error loading chat history:', error);
    }
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
        message: startMessage
      });

      console.log('Response received:', response.data);

      const newMessage = {
        role: 'assistant',
        content: response.data.reply,
        timestamp: response.data.timestamp
      };

      setMessages(prev => [...prev, 
        { role: 'user', content: startMessage, timestamp: new Date().toISOString() },
        newMessage
      ]);

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
    const newUserMessage = {
      role: 'user',
      content: userMsg,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, newUserMessage]);

    try {
      const response = await axios.post(`${apiUrl}/api/chat`, {
        user_number: userNumber,
        message: userMsg
      });

      const assistantMessage = {
        role: 'assistant',
        content: response.data.reply,
        timestamp: response.data.timestamp
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Update session state if in goal review
      if (response.data.goal_review_status) {
        const status = response.data.goal_review_status;
        setActiveSession('goal_review');
        setCurrentStage(status.stage);
        const idx = GOAL_REVIEW_STAGES.findIndex(s => s.id === status.stage);
        setStageIndex(idx >= 0 ? idx : 0);

        // Check if session ended
        if (status.stage === 'completed') {
          setActiveSession(null);
          setCurrentStage(null);
          setStageIndex(0);
        }
      } else if (response.data.people_review_status) {
        // Handle people review status
        const status = response.data.people_review_status;
        if (status.active) {
          setActiveSession('people_review');
          setCurrentStage(status.phase);
        } else {
          // Session ended
          setActiveSession(null);
          setCurrentStage(null);
          setStageIndex(0);
        }
      } else if (response.data.leadership_coaching_status) {
        // Handle leadership coaching status
        const status = response.data.leadership_coaching_status;
        if (status.active) {
          setActiveSession('leadership_coaching');
          setCurrentStage(status.phase);
        } else {
          // Session ended
          setActiveSession(null);
          setCurrentStage(null);
          setStageIndex(0);
        }
      } else if (response.data.state !== 'GOAL_REVIEW' && response.data.state !== 'PEOPLE_REVIEW' && response.data.state !== 'LEADERSHIP_COACHING') {
        // Session ended or not active
        setActiveSession(null);
        setCurrentStage(null);
        setStageIndex(0);
      }
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
    <div className="h-full flex flex-col bg-white">
      {/* Header with Session Type Buttons */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">

        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            My Journal
          </h1>
        </div>

        {/* Progress Dots - Only show when goal review session is active */}
        {activeSession === 'goal_review' && (
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
        {activeSession === 'people_review' && (
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
        {activeSession === 'leadership_coaching' && (
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
        {activeSession && (
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

      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Ready for your coaching session?</h3>
            <p className="text-gray-600 max-w-md">
              Click "Goal Review Session" above to start a structured review of your progress, 
              identify blockers, and plan concrete next steps.
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`
                  max-w-[70%] rounded-lg px-4 py-3 shadow-sm
                  ${msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-900'
                  }
                `}
              >
                <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className={`
                    text-xs 
                    ${msg.role === 'user' ? 'text-blue-100' : 'text-gray-500'}
                  `}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </div>
                  <ReadAloudButton
                    text={msg.content}
                    className={msg.role === 'user'
                      ? 'text-blue-100 hover:bg-blue-500'
                      : 'text-gray-600 hover:bg-gray-200'
                    }
                  />
                </div>
              </div>
            </div>
          ))
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

      {/* Input Area */}
      <div className="border-t border-gray-200 bg-white px-6 py-4">
        <form onSubmit={sendMessage} className="flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={activeSession ? "Share your thoughts..." : "Type a message to Alfred..."}
            disabled={isLoading}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          />

          <VoiceRecorder
            apiUrl={apiUrl}
            disabled={isLoading}
            onTranscript={(text) => setInputMessage(text)}
          />

          <button
            type="submit"
            disabled={!inputMessage.trim() || isLoading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
};

export default MyCoachingSessions;
