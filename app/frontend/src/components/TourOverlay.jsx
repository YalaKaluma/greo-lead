import { useState, useEffect } from "react";
import { API_URL } from "../config";

/**
 * TourOverlay - Guided tour system for first-time users
 * Non-skippable, professional, executive-focused
 * Shows contextual guidance for each page with user's own data
 */
export default function TourOverlay({ userNumber, currentPage, onTourComplete }) {
  const [tourActive, setTourActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(null);
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);

  // Tour content for each step
  const tourSteps = {
    "tour_goals": {
      page: "my-goals",
      title: "Your Goals",
      message: (name) => `${name}, this is where we track what you're building toward.

I've added the goal you shared during setup. You can add more goals anytime by texting me.

Every Sunday at 6pm, I'll check in on your progress and help you refine these.`,
      action: "Tell me about the 'why' for this goal",
      illustration: "🎯"
    },
    "tour_tasks": {
      page: "todo-list",
      title: "Your To-Do List",
      message: (name) => `Here are the tasks you mentioned, ${name}.

They're organized by priority, with your quick win at the top. Check it off when done—no celebration, just progress.

Each morning at 7am, I'll highlight what's most important for the day.`,
      action: "Add task details or notes if needed",
      illustration: "✓"
    },
    "tour_team": {
      page: "my-team",
      title: "Your Team",
      message: (name) => `Track who you're working with and what you've delegated.

Add team members by texting me: "Add [name] to my team, email: [email]"

I'll help you follow up on delegated items and manage your collaboration.`,
      action: null,
      illustration: "👥"
    },
    "tour_journey": {
      page: "my-journey",
      title: "Your Leadership Journey",
      message: (name) => `This is your professional memory, ${name}.

I'm building a comprehensive picture of your strengths, lessons learned, key relationships, and growth areas.

Every Friday at 5pm, I'll ask you to reflect and add to this. It's powerful context that makes our coaching more effective.`,
      action: null,
      illustration: "🧭"
    },
    "tour_habits": {
      page: "my-habits",
      title: "Your Habits",
      message: (name) => `Track daily and weekly routines that support your goals.

Add habits by texting me, and I'll help you build consistency.

This is optional but powerful for executives building new leadership practices.`,
      action: null,
      illustration: "📊"
    }
  };

  useEffect(() => {
    // Check if tour is needed
    const needsTour = localStorage.getItem("needs_tour");
    const storedName = localStorage.getItem("user_name");
    
    if (needsTour === "true") {
      setUserName(storedName || "");
      fetchTourProgress();
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Update tour content when page changes
    if (tourActive && currentStep) {
      const stepInfo = tourSteps[currentStep];
      if (stepInfo && stepInfo.page !== currentPage) {
        // User navigated away from expected tour page - redirect them back
        // or just wait for them to navigate back
      }
    }
  }, [currentPage]);

  async function fetchTourProgress() {
    try {
      const res = await fetch(`${API_URL}/api/onboarding/tour/progress?user_number=${userNumber}`);
      const data = await res.json();
      
      if (!data.completed && data.current_step) {
        setCurrentStep(data.current_step);
        setTourActive(true);
      }
      setLoading(false);
    } catch (error) {
      console.error("Error fetching tour progress:", error);
      setLoading(false);
    }
  }

  async function completeStep() {
    if (!currentStep) return;

    try {
      const res = await fetch(`${API_URL}/api/onboarding/tour/complete-step?user_number=${userNumber}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: currentStep })
      });

      const data = await res.json();

      if (data.tour_completed) {
        // Tour finished!
        setTourActive(false);
        localStorage.setItem("needs_tour", "false");
        if (onTourComplete) {
          onTourComplete();
        }
        showCompletionMessage();
      } else if (data.next_step) {
        // Move to next step
        setCurrentStep(data.next_step);
      }
    } catch (error) {
      console.error("Error completing tour step:", error);
    }
  }

  function showCompletionMessage() {
    // Show a final message when tour is complete
    setTimeout(() => {
      alert(`That's the tour complete, ${userName}!\n\nYou're all set. Text me anytime at ${userNumber}—I'm your Chief of Staff, available 24/7.\n\n📱 Forward emails for drafting or review\n📊 Send decks for feedback\n💬 Use me as a thinking partner\n\nReady when you are.`);
    }, 500);
  }

  if (loading || !tourActive || !currentStep) {
    return null;
  }

  const stepInfo = tourSteps[currentStep];
  
  // Only show tour overlay on the correct page
  if (!stepInfo || stepInfo.page !== currentPage) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-60 z-50 backdrop-blur-sm" />

      {/* Tour Card */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto">
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-8 rounded-t-2xl">
            <div className="text-6xl mb-4 text-center">{stepInfo.illustration}</div>
            <h2 className="text-3xl font-bold text-center mb-2">{stepInfo.title}</h2>
            <div className="flex items-center justify-center space-x-2 text-slate-300 text-sm">
              <span>Step {Object.keys(tourSteps).indexOf(currentStep) + 1} of {Object.keys(tourSteps).length}</span>
            </div>
          </div>

          {/* Content */}
          <div className="p-8">
            <div className="prose prose-lg max-w-none">
              <p className="text-slate-700 whitespace-pre-line leading-relaxed text-lg">
                {stepInfo.message(userName)}
              </p>
            </div>

            {stepInfo.action && (
              <div className="mt-6 p-4 bg-amber-50 border-l-4 border-amber-500 rounded-r-lg">
                <p className="text-sm font-semibold text-amber-900">
                  💡 Try this: {stepInfo.action}
                </p>
              </div>
            )}

            {/* Progress Bar */}
            <div className="mt-8">
              <div className="flex items-center justify-between text-sm text-slate-600 mb-2">
                <span>Tour Progress</span>
                <span>{Math.round(((Object.keys(tourSteps).indexOf(currentStep) + 1) / Object.keys(tourSteps).length) * 100)}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-amber-500 to-amber-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${((Object.keys(tourSteps).indexOf(currentStep) + 1) / Object.keys(tourSteps).length) * 100}%` }}
                />
              </div>
            </div>

            {/* Action Button */}
            <div className="mt-8 flex justify-center">
              <button
                onClick={completeStep}
                className="bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-semibold py-4 px-12 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 text-lg"
              >
                {Object.keys(tourSteps).indexOf(currentStep) === Object.keys(tourSteps).length - 1 
                  ? "Complete Tour" 
                  : "Continue"}
              </button>
            </div>

            {/* Note: Tour is mandatory */}
            <p className="mt-6 text-center text-sm text-slate-500">
              This guided tour helps you get the most from Leadership OS
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
