import { useState, useEffect } from "react";
import { API_URL } from "./config";

/**
 * Welcome Page - First-time login for new users
 * Users arrive here via link from WhatsApp with user_id in URL
 * They enter their one-time password to access the app and start the tour
 */
export default function Welcome({ onLogin }) {
  const [userId, setUserId] = useState(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Extract user_id from URL params
    const params = new URLSearchParams(window.location.search);
    const id = params.get("user");
    if (id) {
      setUserId(parseInt(id));
    } else {
      setError("Invalid link. Please use the link sent via WhatsApp.");
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/onboarding/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          user_id: userId, 
          password: password.trim().toUpperCase() 
        })
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.message);
        setLoading(false);
        return;
      }

      // Store user info and trigger login
      localStorage.setItem("user_number", data.user_number);
      localStorage.setItem("user_name", data.user_name);
      localStorage.setItem("needs_tour", data.needs_tour.toString());
      
      // ✅ NOTE: Onboarding data is now processed automatically during WhatsApp onboarding
      // No need to call process-onboarding-data here anymore!

      onLogin(data.user_number, data.needs_tour);
    } catch (err) {
      console.error("Login error:", err);
      setError("Connection error. Please try again.");
      setLoading(false);
    }
  }

  if (!userId) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Invalid Access</h1>
          <p className="text-slate-600">
            {error || "Please use the link sent via WhatsApp to access your account."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Decorative gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-900/10 via-transparent to-blue-900/10 pointer-events-none" />

      {/* Main Content */}
      <div className="relative z-10 w-full flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-block p-6 bg-white/10 backdrop-blur-sm rounded-3xl mb-6 shadow-2xl">
              <div className="w-20 h-20 bg-amber-400 rounded-full flex items-center justify-center">
                <span className="text-4xl">🎩</span>
              </div>
            </div>
            <h1 className="text-4xl font-serif font-light text-amber-100 mb-3">
              Welcome to Alfred
            </h1>
            <p className="text-xl text-slate-300">
              Your Executive Operating System
            </p>
          </div>

          {/* Login Card */}
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">
                Let's Get Started
              </h2>
              <p className="text-slate-600">
                Enter the password I sent you via WhatsApp
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  One-Time Password
                </label>
                <input
                  type="text"
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3.5 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition shadow-sm text-lg tracking-wider font-mono"
                  required
                  maxLength={8}
                  disabled={loading}
                />
                <p className="mt-2 text-sm text-slate-500">
                  This password expires in 24 hours
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border-l-4 border-red-500 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start">
                  <svg className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || password.length < 6}
                className="w-full bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed text-white font-semibold py-4 px-4 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Signing in...
                  </span>
                ) : (
                  "Access My Dashboard"
                )}
              </button>
            </form>

            {/* Help Text */}
            <div className="mt-6 pt-6 border-t border-slate-200 text-center">
              <p className="text-sm text-slate-600">
                Can't find your password?{" "}
                <a href="https://wa.me/YOUR_NUMBER" className="text-amber-600 hover:text-amber-700 font-semibold">
                  Text Alfred on WhatsApp
                </a>
              </p>
            </div>
          </div>

          {/* Trial Info */}
          <div className="mt-6 text-center text-sm text-slate-400">
            <p>✓ 21-day free trial · No credit card required</p>
          </div>
        </div>
      </div>
    </div>
  );
}