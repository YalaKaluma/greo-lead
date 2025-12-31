import Sidebar from './components/Sidebar';
import TodoList from './components/TodoList';
import MyGoals from './components/MyGoals';
import MyLeadershipJourney from './components/MyLeadershipJourney';
import MyTeam from './components/MyTeam';
import MyJournal from './components/MyJournal';
import MyHabits from './components/MyHabits';
import TourOverlay from './components/TourOverlay';
import AlfredChat from './components/AlfredChat';
import { useEffect, useState } from "react";
import Login from "./Login";
import Welcome from "./Welcome";
import Waitlist from "./Waitlist";

// API URL handling
const API_URL = import.meta.env.PROD
  ? ''
  : (import.meta.env.VITE_API_URL || 'http://localhost:8000');

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userNumber, setUserNumber] = useState(null);
  const [needsTour, setNeedsTour] = useState(false);
  const [tourComplete, setTourComplete] = useState(false);

  const [currentPage, setCurrentPage] = useState('my-goals'); // Start on goals page for tour
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // 🔐 Check login on app load
  useEffect(() => {
    const storedUser = localStorage.getItem("user_number");
    const storedTour = localStorage.getItem("needs_tour");
    
    if (storedUser) {
      setUserNumber(storedUser);
      setIsLoggedIn(true);
      setNeedsTour(storedTour === "true");
    }
  }, []);

  // Handle URL parameters on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    const user = params.get('user');
    
    // If there's a user param in URL, show Welcome page
    if (user && !isLoggedIn) {
      // Welcome page will handle this
      return;
    }
    
    if (page) {
      setCurrentPage(page);
    }
  }, []);

  // Handle responsive layout
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) {
        setIsSidebarOpen(true);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleNavigate = (page) => {
    setCurrentPage(page);
    if (isMobile) {
      setIsSidebarOpen(false);
    }
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleLogin = (userNumber, requiresTour = false) => {
    localStorage.setItem("user_number", userNumber);
    setUserNumber(userNumber);
    setIsLoggedIn(true);
    setNeedsTour(requiresTour);
    
    // If tour is needed, start on goals page
    if (requiresTour) {
      setCurrentPage('my-goals');
    }
  };

  const handleTourComplete = () => {
    setTourComplete(true);
    setNeedsTour(false);
  };

  // Waitlist page
  if (window.location.pathname === "/waitlist") {
    return <Waitlist />;
  }

  // Welcome page (first-time login)
  const params = new URLSearchParams(window.location.search);
  if (params.get('user') && !isLoggedIn) {
    return <Welcome onLogin={handleLogin} />;
  }

  // 🔒 AUTH GATE (existing users)
  if (!isLoggedIn) {
    return (
      <Login
        onLogin={(userNumber) => {
          handleLogin(userNumber, false);
        }}
      />
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Tour Overlay - Shows when needed */}
      {needsTour && !tourComplete && (
        <TourOverlay 
          userNumber={userNumber}
          currentPage={currentPage}
          onTourComplete={handleTourComplete}
        />
      )}

      {/* Mobile Header */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-200 flex items-center px-4 z-30">
          <button
            onClick={toggleSidebar}
            className="p-2 hover:bg-gray-100 rounded"
          >
            ☰
          </button>
          <h1 className="ml-4 text-lg font-semibold">
            {currentPage === 'todo-list' && 'Your To-Do List'}
            {currentPage === 'my-goals' && 'My Goals'}
            {currentPage === 'my-team' && 'My Team'}
            {currentPage === 'my-journey' && 'My Leadership Journey'}
            {currentPage === 'my-habits' && 'My Habits'}
            {currentPage === 'my-journal' && 'My Journal'}
          </h1>
        </div>
      )}

      <Sidebar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        isOpen={isSidebarOpen}
        isMobile={isMobile}
        onClose={() => setIsSidebarOpen(false)}
      />

      <main className={`flex-1 overflow-auto ${isMobile ? 'mt-14' : ''}`}>
        {currentPage === 'todo-list' && (
          <TodoList apiUrl={API_URL} userNumber={userNumber} />
        )}
        {currentPage === 'my-goals' && (
          <MyGoals apiUrl={API_URL} userNumber={userNumber} />
        )}
        {currentPage === 'my-team' && (
          <MyTeam apiUrl={API_URL} userNumber={userNumber} />
        )}
        {currentPage === 'my-journey' && (
          <MyLeadershipJourney apiUrl={API_URL} userNumber={userNumber} />
        )}
        {currentPage === 'my-habits' && (
          <MyHabits apiUrl={API_URL} userNumber={userNumber} />
        )}
        {currentPage === 'my-journal' && (
          <MyJournal apiUrl={API_URL} userNumber={userNumber} />
        )}
      </main>

      {/* Alfred Chat - Always available */}
      <AlfredChat 
        apiUrl={API_URL} 
        userNumber={userNumber}
        onTourStep={(action) => {
          // Handle tour navigation from chat
          if (action === 'navigate_goals') setCurrentPage('my-goals');
          if (action === 'navigate_tasks') setCurrentPage('todo-list');
          if (action === 'navigate_team') setCurrentPage('my-team');
          if (action === 'navigate_journey') setCurrentPage('my-journey');
          if (action === 'navigate_habits') setCurrentPage('my-habits');
        }}
      />

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
