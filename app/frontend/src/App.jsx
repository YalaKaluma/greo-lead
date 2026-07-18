import Sidebar from './components/Sidebar';
import Home from './components/Home';
import TodoList from './components/TodoList';
//import MyGoals from './components/MyGoals';
import MyGoals from './components/goals/MyGoals'
import MyLeadershipJourney from './components/MyLeadershipJourney';
import MyTeam from './components/MyTeam';
import Meetings from './components/Meetings';
import Projects from './components/Projects';
import MyCoachingSessions from './components/MyCoachingSessions'; // NEW: Replace MyJournal
import MyHabits from './components/MyHabits';
import MyJournal from './components/MyJournal';
import PageIntroBanner from './components/PageIntroBanner';
import AlfredChat from './components/AlfredChat';
import InAppOnboarding from './components/InAppOnboarding';
import OnboardingReveal from './components/OnboardingReveal';
import Settings from './components/Settings';
import AlfredStory from './components/AlfredStory';
import TrustSecurity from './components/TrustSecurity';
import { useEffect, useRef, useState } from "react";
import Login from "./Login";
import Welcome from "./Welcome";
import Waitlist from "./Waitlist";
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import { API_URL } from './config';
import { initializeNotificationRouting, refreshNativeNotificationRegistration } from './services/notifications';

const HOME_PAGE = 'home';
const TRUST_SECURITY_PAGE = 'trust-security';
const NEW_USER_DEFAULT_PAGE = 'my-goals';
const DEFAULT_PAGE = HOME_PAGE;
const VALID_PAGE_IDS = new Set([
  HOME_PAGE,
  'todo-list',
  NEW_USER_DEFAULT_PAGE,
  'my-team',
  'meetings',
  'my-journey',
  'my-habits',
  'coaching-sessions',
  'my-journal',
  'alfred-story',
  TRUST_SECURITY_PAGE,
  'settings'
]);

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userNumber, setUserNumber] = useState(null);
  const [currentPage, setCurrentPage] = useState(DEFAULT_PAGE);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const hasDeepLinkedRef = useRef(false);

  // 🔍 Check login on app load
  useEffect(() => {
    const storedUser = localStorage.getItem("user_number");
    
    if (storedUser) {
      setUserNumber(storedUser);
      setIsLoggedIn(true);
    }
  }, []);

  useEffect(() => {
    initializeNotificationRouting().catch((error) => {
      console.warn('Could not initialize native notification routing:', error);
    });
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !userNumber) return;
    refreshNativeNotificationRegistration(API_URL, userNumber).catch((error) => {
      console.warn('Could not refresh native notification registration:', error);
    });
  }, [isLoggedIn, userNumber]);

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
      hasDeepLinkedRef.current = true;
      setCurrentPage(page);
      const nextParams = new URLSearchParams(window.location.search);
      nextParams.delete('page');
      nextParams.delete('session');
      nextParams.delete('person');
      const nextUrl = `${window.location.pathname}${nextParams.toString() ? `?${nextParams}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', nextUrl);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !userNumber || hasDeepLinkedRef.current) return;

    let cancelled = false;
    const encodedUser = encodeURIComponent(userNumber);

    fetch(`${API_URL}/api/home/dashboard?user_number=${encodedUser}`)
      .then((response) => response.ok ? response.json() : null)
      .then((snapshot) => {
        if (cancelled || hasDeepLinkedRef.current) return;
        setCurrentPage(snapshot?.payload?.activation_ready ? HOME_PAGE : NEW_USER_DEFAULT_PAGE);
      })
      .catch(() => {
        if (!cancelled) setCurrentPage(NEW_USER_DEFAULT_PAGE);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, userNumber]);

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
    localStorage.removeItem("needs_tour");
    setUserNumber(userNumber);
    setIsLoggedIn(true);
    
    // First-time users start on the default page without an automatic tour.
    if (requiresTour) {
      setCurrentPage(NEW_USER_DEFAULT_PAGE);
    }
  };

  // Waitlist page
  if (window.location.pathname === "/waitlist") {
    return <Waitlist />;
  }

  if (window.location.pathname === "/trust-security") {
    return (
      <LanguageProvider apiUrl={API_URL} userNumber={localStorage.getItem("user_number")}>
        <TrustSecurity publicView />
      </LanguageProvider>
    );
  }

  if (window.location.pathname === "/account-deletion") {
    return (
      <LanguageProvider apiUrl={API_URL} userNumber={localStorage.getItem("user_number")}>
        <TrustSecurity publicView initialTab="gdpr" focusSection="accountDeletion" />
      </LanguageProvider>
    );
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

  // Main App
  return (
    <LanguageProvider apiUrl={API_URL} userNumber={userNumber}>
      <MainAppShell
        userNumber={userNumber}
        currentPage={currentPage}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        isMobile={isMobile}
        handleNavigate={handleNavigate}
        toggleSidebar={toggleSidebar}
      />
    </LanguageProvider>
  );
}

function MainAppShell({
  userNumber,
  currentPage,
  isSidebarOpen,
  setIsSidebarOpen,
  isMobile,
  handleNavigate,
  toggleSidebar
}) {
  const { t, language } = useLanguage();
  const [introCardsEnabled, setIntroCardsEnabled] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(null);
  const [onboardingReveal, setOnboardingReveal] = useState(null);

  useEffect(() => {
    if (!userNumber) return;
    fetch(`${API_URL}/api/auth/me?user_number=${encodeURIComponent(userNumber)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => setOnboardingComplete(Boolean(data?.user?.onboarding_completed)))
      .catch(() => setOnboardingComplete(true));
  }, [userNumber]);
  const pageTitles = {
    home: t('page.home'),
    'todo-list': t('page.tasks'),
    'my-goals': t('page.goals'),
    'my-team': t('page.team'),
    meetings: t('page.meetings'),
    projects: t('page.projects'),
    'my-journey': t('page.journey'),
    'my-habits': t('page.habits'),
    'coaching-sessions': t('page.coaching'),
    'my-journal': t('page.journal'),
    'alfred-story': t('page.story'),
    [TRUST_SECURITY_PAGE]: t('trustSecurity.title'),
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

  useEffect(() => {
    if (!userNumber) {
      setIntroCardsEnabled(false);
      return;
    }

    fetch(`${API_URL}/api/usage-events/intro-state?user_number=${encodeURIComponent(userNumber)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        setIntroCardsEnabled(Boolean(data?.show_intro_cards));
      })
      .catch(() => {
        setIntroCardsEnabled(false);
      });
  }, [userNumber]);

  useEffect(() => {
    if (!userNumber) return;

    fetch(`${API_URL}/api/usage-events/intro-recap-message?user_number=${encodeURIComponent(userNumber)}`, {
      method: 'POST'
    })
      .then(() => {
        window.dispatchEvent(new Event('alfred-messages-refresh'));
      })
      .catch(() => {
        // Message-center seeding should never interrupt the app.
      });
  }, [userNumber]);

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
        <PageIntroBanner
          pageId={currentPage}
          userNumber={userNumber}
          enabled={(introCardsEnabled || currentPage === 'my-journal') && !onboardingReveal}
        />

        {currentPage === 'settings' && (
          <Settings
            apiUrl={API_URL}
            userNumber={userNumber}
            onBack={() => handleNavigate('my-goals')}
          />
        )}
        {currentPage === 'home' && (
          <Home apiUrl={API_URL} userNumber={userNumber} onNavigate={handleNavigate} />
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
        {currentPage === 'meetings' && (
          <Meetings apiUrl={API_URL} userNumber={userNumber} />
        )}
        {currentPage === 'projects' && (
          <Projects apiUrl={API_URL} userNumber={userNumber} />
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
        {currentPage === 'alfred-story' && (
          <AlfredStory />
        )}
        {currentPage === TRUST_SECURITY_PAGE && (
          <TrustSecurity onBack={() => handleNavigate('my-goals')} />
        )}
      </main>

      {/* Alfred Chat - Always available */}
      <AlfredChat 
        apiUrl={API_URL} 
        userNumber={userNumber}
        currentPage={currentPage}
        showLauncher={!isMobile || isSidebarOpen}
        preferredLanguage={language}
      />

      {onboardingComplete === false && (
        <InAppOnboarding
          apiUrl={API_URL}
          userNumber={userNumber}
          onComplete={(result) => {
            setOnboardingComplete(true);
            setOnboardingReveal(result || null);
            handleNavigate(NEW_USER_DEFAULT_PAGE);
          }}
        />
      )}

      {onboardingReveal && (
        <OnboardingReveal
          result={onboardingReveal}
          userNumber={userNumber}
          onNavigate={handleNavigate}
          onFinish={() => setOnboardingReveal(null)}
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
