import Sidebar from './components/Sidebar';
import TodoList from './components/TodoList';
import MyGoals from './components/MyGoals';
import MyLeadershipJourney from './components/MyLeadershipJourney';
import MyTeam from './components/MyTeam';
import MyJournal from './components/MyJournal';
import MyHabits from './components/MyHabits';
import { useEffect, useState } from "react";
import Login from "./Login";
import Waitlist from "./Waitlist";

// API URL handling
const API_URL = import.meta.env.PROD
  ? ''
  : (import.meta.env.VITE_API_URL || 'http://localhost:8000');

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userNumber, setUserNumber] = useState(null);

  const [currentPage, setCurrentPage] = useState('todo-list');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // 🔐 Check login on app load
  useEffect(() => {
    const storedUser = localStorage.getItem("user_number");
    if (storedUser) {
      setUserNumber(storedUser);
      setIsLoggedIn(true);
    }
  }, []);

  // Handle URL parameters on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
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

  if (window.location.pathname === "/waitlist") {
  return <Waitlist />;
  }

  // 🔒 AUTH GATE
  if (!isLoggedIn) {
    return (
      <Login
        onLogin={(userNumber) => {
       
          localStorage.setItem("user_number", userNumber);  // ✅ Save
          setUserNumber(userNumber);                        // ✅ Use directly
          setIsLoggedIn(true);

        }}
      />
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
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
