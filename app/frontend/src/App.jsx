import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import TodoList from './components/TodoList';
import MyGoals from './components/MyGoals';
import MyLeadershipJourney from './components/MyLeadershipJourney';
import MyTeam from './components/MyTeam';
import MyJournal from './components/MyJournal';

// FIXED: Use empty string in production for relative URLs
// In production, the frontend is served from the same domain as the API
// So we can use relative URLs like /api/tasks instead of http://localhost:8000/api/tasks
const API_URL = import.meta.env.PROD 
  ? '' // Production: use relative URLs
  : (import.meta.env.VITE_API_URL || 'http://localhost:8000'); // Development: use env var or localhost

const USER_NUMBER = import.meta.env.VITE_USER_NUMBER || 'whatsapp:+17707789240';

// Log the config for debugging
console.log('App Config:', {
  mode: import.meta.env.MODE,
  prod: import.meta.env.PROD,
  apiUrl: API_URL,
  userNumber: USER_NUMBER
});

function App() {
  const [currentPage, setCurrentPage] = useState('todo-list');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Handle URL parameters on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    if (page) {
      setCurrentPage(page);
    }
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) {
        setIsSidebarOpen(true); // Always open on desktop
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleNavigate = (page) => {
    setCurrentPage(page);
    if (isMobile) {
      setIsSidebarOpen(false); // Auto-close on mobile
    }
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile Header */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-200 flex items-center px-4 z-30">
          <button
            onClick={toggleSidebar}
            className="p-2 hover:bg-gray-100 rounded"
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="ml-4 text-lg font-semibold">
            {currentPage === 'todo-list' && 'Your To-Do List'}
            {currentPage === 'my-goals' && 'My Goals'}
            {currentPage === 'my-team' && 'My Team'}
            {currentPage === 'my-journey' && 'My Leadership Journey'}
            {currentPage === 'my-journal' && 'My Journal'}
          </h1>
        </div>
      )}

      {/* Sidebar */}
      <Sidebar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        isOpen={isSidebarOpen}
        isMobile={isMobile}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Content */}
      <main className={`flex-1 overflow-auto ${isMobile ? 'mt-14' : ''}`}>
        {currentPage === 'todo-list' && (
          <TodoList apiUrl={API_URL} userNumber={USER_NUMBER} />
        )}
        {currentPage === 'my-goals' && (
          <MyGoals apiUrl={API_URL} userNumber={USER_NUMBER} />
        )}
        {currentPage === 'my-team' && (
          <MyTeam apiUrl={API_URL} userNumber={USER_NUMBER} />
        )}
        {currentPage === 'my-journey' && (
          <MyLeadershipJourney apiUrl={API_URL} userNumber={USER_NUMBER} />
        )}
        {currentPage === 'my-habits' && (
          <MyHabits apiUrl={API_URL} userNumber={USER_NUMBER} />
        )}
        {currentPage === 'my-journal' && (
          <MyJournal apiUrl={API_URL} userNumber={USER_NUMBER} />
        )}
      </main>

      {/* Mobile Overlay */}
      {isMobile && isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
