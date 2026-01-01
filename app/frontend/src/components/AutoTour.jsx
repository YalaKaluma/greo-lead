import { useState, useEffect } from 'react';
import axios from 'axios';

/**
 * AutoTour - Alfred's automatic guided tour
 * 
 * Automatically navigates user through pages with Alfred speaking
 * in the chat widget. No user interaction needed - fully automated.
 */
export default function AutoTour({ 
  apiUrl, 
  userNumber, 
  onNavigate,      // Function to change pages
  onComplete       // Called when tour is done
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isActive, setIsActive] = useState(true);

  // Tour sequence: page + Alfred's message + how long to wait
  const tourSteps = [
    {
      page: 'my-goals',
      delay: 8000, // 8 seconds on this page
      message: `Welcome to your Leadership OS! 🎉

I'm Alfred - your AI Chief of Staff. I'm here whenever you need me.

This is your Goals page - where we track what you're building toward.

I've added the goal you shared during setup. Click on it anytime to see details, or click the 🎩 icon when editing to get my coaching.

Let me show you your tasks...`
    },
    {
      page: 'todo-list',
      delay: 8000, // 8 seconds
      message: `Here's your task list.

I've organized your tasks by priority - most important work at the top.

You can check off tasks, change priorities with the 🔴🟠🟢 flags, or click any task to add notes.

The task at the very top? That's your quick win for today.

Now let me show you the most powerful part...`
    },
    {
      page: 'my-journey',
      delay: 10000, // 10 seconds (more to explain)
      message: `This is your Leadership Journey.

Every conversation we have builds this wheel - your comprehensive professional profile.

The 5 dimensions:
• Vision & Goals
• People  
• Prioritize & Execute
• Time & Energy
• Learning & Development

Click any topic to see what we've captured. And remember - click the 🎩 icon when editing for my coaching.

One more page...`
    },
    {
      page: 'my-habits',
      delay: 6000, // 6 seconds (shorter, less to explain)
      message: `This is your Habits tracker.

It's empty now, but powerful for building new leadership practices.

To add a habit, just text me: "Track habit: [name], frequency: daily"

---

That's the tour! 🎯

Text me anytime (WhatsApp) or chat here in the app.

I'll check in each morning (7am), evening (6pm), and Sunday at 5pm for weekly reflection.

Your quick win is in your task list. Go make it happen.`
    }
  ];

  // Auto-advance through tour steps
  useEffect(() => {
    if (!isActive || currentStep >= tourSteps.length) {
      return;
    }

    const step = tourSteps[currentStep];
    
    // Navigate to page
    onNavigate(step.page);
    
    // Send Alfred's message (after small delay for page load)
    setTimeout(() => {
      if (window.alfredChat) {
        window.alfredChat.sendMessage(step.message);
        window.alfredChat.open();
      }
    }, 500);
    
    // Auto-advance to next step after delay
    const timer = setTimeout(() => {
      if (currentStep < tourSteps.length - 1) {
        setCurrentStep(prev => prev + 1);
      } else {
        completeTour();
      }
    }, step.delay);

    return () => clearTimeout(timer);
  }, [currentStep, isActive]);

  const completeTour = async () => {
    setIsActive(false);
    
    // Mark tour as complete in backend
    try {
      await axios.post(`${apiUrl}/api/onboarding/tour/complete`, {
        user_number: userNumber
      });
    } catch (error) {
      console.error('Failed to mark tour complete:', error);
    }
    
    // Keep chat open (don't close)
    // User can continue chatting with Alfred
    
    // Notify parent
    onComplete();
  };

  // Show progress indicator during tour
  if (!isActive || currentStep >= tourSteps.length) {
    return null;
  }

  return (
    // Progress indicator - shows which step user is on
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-black bg-opacity-80 text-white px-6 py-3 rounded-full shadow-lg">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
        <span className="text-sm font-medium">
          Alfred is showing you around... ({currentStep + 1}/{tourSteps.length})
        </span>
      </div>
    </div>
  );
}
