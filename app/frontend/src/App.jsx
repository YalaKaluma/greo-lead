import Sidebar from './components/Sidebar';
import TodoList from './components/TodoList';
//import MyGoals from './components/MyGoals';
import MyGoals from './components/goals/MyGoals'
import MyLeadershipJourney from './components/MyLeadershipJourney';
import MyTeam from './components/MyTeam';
import MyCoachingSessions from './components/MyCoachingSessions'; // NEW: Replace MyJournal
import MyHabits from './components/MyHabits';
import MyJournal from './components/MyJournal';
import TourOverlay from './components/TourOverlay';
import AlfredChat from './components/AlfredChat';
import Settings from './components/Settings';
import { useEffect, useState } from "react";
import Login from "./Login";
import Welcome from "./Welcome";
import Waitlist from "./Waitlist";
import AutoTour from './components/AutoTour';
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';

// API URL handling
const API_URL = import.meta.env.PROD
  ? ''
  : (import.meta.env.VITE_API_URL || 'http://localhost:8000');

const DEFAULT_PAGE = 'my-goals';
const VALID_PAGE_IDS = new Set([
  'todo-list',
  DEFAULT_PAGE,
  'my-team',
  'my-journey',
  'my-habits',
  'coaching-sessions',
  'my-journal',
  'settings'
]);

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userNumber, setUserNumber] = useState(null);
  const [needsTour, setNeedsTour] = useState(false);
  const [tourComplete, setTourComplete] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(true); // Default true, check DB

  const [currentPage, setCurrentPage] = useState(DEFAULT_PAGE); // Start on Vision and goals
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // 🔍 Check login on app load
  useEffect(() => {
    const storedUser = localStorage.getItem("user_number");
    const storedTour = localStorage.getItem("needs_tour");
    
    if (storedUser) {
      setUserNumber(storedUser);
      setIsLoggedIn(true);
      setNeedsTour(storedTour === "true");
      
      // Check onboarding status from database
      checkOnboardingStatus(storedUser);
    }
  }, []);

  // Check onboarding status from database
  const checkOnboardingStatus = async (userNumber) => {
    try {
      const response = await fetch(`${API_URL}/api/onboarding/user/status?user_number=${encodeURIComponent(userNumber)}`);
      if (response.ok) {
        const data = await response.json();
        console.log('Onboarding status from DB:', data);
        
        // Only show onboarding/tour if NOT completed in database
        if (data.onboarding_completed === false) {
          setOnboardingCompleted(false);
          setNeedsTour(true);
        } else {
          setOnboardingCompleted(true);
          setNeedsTour(false);
        }
      }
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      // If error, assume completed to avoid blocking user
      setOnboardingCompleted(true);
    }
  };

  // Handle URL parameters on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    const user = params.get('user');
    
    // If there's a numeric user param and NOT logged in, it's a new user onboarding link
    const isNumericUser = user && !isNaN(parseInt(user));
    if (isNumericUser && !isLoggedIn) {
      // Let Welcome component handle this below
      return;
    }
    
    // Deep links can open a specific page once, but refreshes should return to the default page.
    if (page && isLoggedIn && VALID_PAGE_IDS.has(page)) {
      setCurrentPage(page);
      const nextParams = new URLSearchParams(window.location.search);
      nextParams.delete('page');
      nextParams.delete('session');
      nextParams.delete('person');
      const nextUrl = `${window.location.pathname}${nextParams.toString() ? `?${nextParams}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', nextUrl);
    }
  }, [isLoggedIn]);

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
    
    // Check onboarding status from database
    checkOnboardingStatus(userNumber);
    
    // If tour is needed, start on goals page
    if (requiresTour) {
      setCurrentPage(DEFAULT_PAGE);
    }
  };

  const handleTourComplete = () => {
    setTourComplete(true);
    setNeedsTour(false);
    setOnboardingCompleted(true);
    localStorage.removeItem("needs_tour");
  };

  // Waitlist page
  if (window.location.pathname === "/waitlist") {
    return <Waitlist />;
  }

  // Welcome page (first-time onboarding)
  // Only show if:
  // 1. Has numeric 'user' param (from onboarding link)
  // 2. NOT already logged in
  const params = new URLSearchParams(window.location.search);
  const userParam = params.get('user');
  const isNumericUser = userParam && !isNaN(parseInt(userParam));
  
  if (isNumericUser && !isLoggedIn) {
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

  // Main App - Only show tour if onboarding NOT completed in database
  return (
    <LanguageProvider apiUrl={API_URL} userNumber={userNumber}>
      <MainAppShell
        userNumber={userNumber}
        needsTour={needsTour}
        tourComplete={tourComplete}
        onboardingCompleted={onboardingCompleted}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        isMobile={isMobile}
        handleNavigate={handleNavigate}
        toggleSidebar={toggleSidebar}
        handleTourComplete={handleTourComplete}
      />
    </LanguageProvider>
  );
}

function MainAppShell({
  userNumber,
  needsTour,
  tourComplete,
  onboardingCompleted,
  currentPage,
  setCurrentPage,
  isSidebarOpen,
  setIsSidebarOpen,
  isMobile,
  handleNavigate,
  toggleSidebar,
  handleTourComplete
}) {
  const { t, language } = useLanguage();
  const pageTitles = {
    'todo-list': t('page.tasks'),
    'my-goals': t('page.goals'),
    'my-team': t('page.team'),
    'my-journey': t('page.journey'),
    'my-habits': t('page.habits'),
    'coaching-sessions': t('page.coaching'),
    'my-journal': t('page.journal'),
    settings: t('settings.title')
  };

  useEffect(() => {
    if (!userNumber || !currentPage) return;

    fetch(`${API_URL}/api/usage-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_number: userNumber,
        event_type: 'page_view',
        page: currentPage,
        feature: 'navigation'
      })
    }).catch(() => {
      // Usage tracking should never block the user experience.
    });
  }, [userNumber, currentPage]);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Tour Overlay - Only shows if onboarding NOT completed */}
      {!onboardingCompleted && needsTour && !tourComplete && (
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
            {pageTitles[currentPage] || t('app.title')}
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
        {currentPage === 'settings' && (
          <Settings
            apiUrl={API_URL}
            userNumber={userNumber}
            onBack={() => handleNavigate('my-goals')}
          />
        )}
        {currentPage === 'todo-list' && (
          <TodoList apiUrl={API_URL} userNumber={userNumber} />
        )}
        {currentPage === 'my-goals' && (
          <MyGoals apiUrl={API_URL} userNumber={userNumber} onNavigate={handleNavigate} />
        )}
        {currentPage === 'my-team' && (
          <MyTeam apiUrl={API_URL} userNumber={userNumber} />
        )}
        {currentPage === 'my-journey' && (
          <MyLeadershipJourney apiUrl={API_URL} userNumber={userNumber} onNavigate={handleNavigate} />
        )}
        {currentPage === 'my-habits' && (
          <MyHabits apiUrl={API_URL} userNumber={userNumber} />
        )}
        {/* CHANGED: Replace my-journal with coaching-sessions */}
        {currentPage === 'coaching-sessions' && (
          <MyCoachingSessions apiUrl={API_URL} userNumber={userNumber} />
        )}

        {currentPage === 'my-journal' && (
          <MyJournal apiUrl={API_URL} userNumber={userNumber} />
        )}
      </main>

      {/* Alfred Chat - Always available */}
      <AlfredChat 
        apiUrl={API_URL} 
        userNumber={userNumber}
        currentPage={currentPage}
        showLauncher={!isMobile || isSidebarOpen}
        preferredLanguage={language}
        onTourStep={(action) => {
          // Handle tour navigation from chat
          if (action === 'navigate_goals') setCurrentPage('my-goals');
          if (action === 'navigate_tasks') setCurrentPage('todo-list');
          if (action === 'navigate_team') setCurrentPage('my-team');
          if (action === 'navigate_journey') setCurrentPage('my-journey');
          if (action === 'navigate_habits') setCurrentPage('my-habits');
          // NEW: Add coaching sessions navigation
          if (action === 'navigate_coaching') setCurrentPage('coaching-sessions');
        }}
      />

      {/* Alfred Auto-Tour - Only shows if onboarding NOT completed */}
      {!onboardingCompleted && needsTour && !tourComplete && (
        <AutoTour
          apiUrl={API_URL}
          userNumber={userNumber}
          onNavigate={handleNavigate}
          onComplete={handleTourComplete}
        />
      )}

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
