import React from 'react';

export default function Sidebar({ currentPage, onNavigate, isOpen, isMobile, onClose }) {
  const menuItems = [
    { id: 'my-goals', label: 'My Goals', disabled: false },
    { id: 'todo-list', label: 'Todo-list', disabled: false },
    { id: 'my-team', label: 'My Team', disabled: false },
    { id: 'my-journey', label: 'My Leadership Journey', disabled: false },
    { id: 'my-journal', label: 'My Journal', disabled: false },
    { id: 'my-feedback', label: 'My Feedback', disabled: true },
    { id: 'my-calendar', label: 'My Calendar', disabled: true },
  ];

  return (
    <aside
      className={`
        ${isMobile ? 'fixed' : 'relative'}
        top-0 left-0 h-full
        bg-blue-700 text-white
        transition-transform duration-300 ease-in-out
        ${isMobile && !isOpen ? '-translate-x-full' : 'translate-x-0'}
        ${isMobile ? 'z-40' : 'z-10'}
        w-80
      `}
      style={{ width: '320px' }}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-6 border-b border-blue-800">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-lg font-bold leading-tight">
                Your Executive Operating System
              </h1>
              <p className="text-sm text-blue-300 mt-1 ml-2">
                Powered by Alfred
              </p>
            </div>
            {isMobile && (
              <button
                onClick={onClose}
                className="p-1 hover:bg-blue-800 rounded ml-2"
                aria-label="Close menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 overflow-y-auto p-4">
          <div className="space-y-1">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => !item.disabled && onNavigate(item.id)}
                disabled={item.disabled}
                className={`
                  w-full text-left px-4 py-3 rounded-lg
                  transition-all duration-200
                  ${item.disabled 
                    ? 'text-blue-300 opacity-60 cursor-not-allowed' 
                    : currentPage === item.id
                      ? 'bg-blue-600 text-white shadow-lg'
                      : 'text-blue-100 hover:bg-blue-800 hover:text-white'
                  }
                `}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </aside>
  );
}
