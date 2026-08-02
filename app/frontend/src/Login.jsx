import { useState, useEffect } from "react";
import { API_URL } from "./config";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login");
  const [error, setError] = useState("");
  const [currentSlide, setCurrentSlide] = useState(0);

  // Carousel auto-advance
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % 2);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    try {
      const res = await fetch(`${API_URL}/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      if (!res.ok) throw new Error("Auth failed");

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || (mode === "login" ? "Login failed" : "Registration failed"));
      }
      localStorage.setItem("user_number", data.user_number);
      localStorage.setItem("user_name", data.user_name);
      localStorage.setItem("access_token", data.access_token);
      onLogin(data.user_number);

    } catch (err) {
      setError(err.message || (mode === "login" ? "Invalid credentials" : "Registration failed"));
    }
  }

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Left Side - Carousel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 relative overflow-hidden">
        {/* Decorative gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-amber-900/10 via-transparent to-blue-900/10 pointer-events-none" />
        
        {/* Carousel Container */}
        <div className="relative w-full h-full flex items-center justify-center z-10">
          {/* Slide 1: Leadership Cycle */}
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center p-16 transition-all duration-1000 ${
              currentSlide === 0 
                ? 'opacity-100 translate-x-0' 
                : 'opacity-0 translate-x-12'
            }`}
          >
            <div className="mb-12 w-full max-w-2xl transform hover:scale-105 transition-transform duration-500">
              <img 
                src="/leadership-cycle.png" 
                alt="Leadership Cycle"
                className="w-full h-auto drop-shadow-2xl"
              />
            </div>
            <h2 className="text-5xl font-serif font-light text-amber-100 mb-6 text-center">
              The Leadership Cycle
            </h2>
            <p className="text-xl text-slate-300 text-center max-w-xl leading-relaxed">
              A continuous system of Vision, Execution, People Development, and Routines
            </p>
          </div>

          {/* Slide 2: Alfred Logo */}
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center p-16 transition-all duration-1000 ${
              currentSlide === 1 
                ? 'opacity-100 translate-x-0' 
                : 'opacity-0 -translate-x-12'
            }`}
          >
            <div className="mb-12 transform hover:scale-105 transition-transform duration-500">
              <div className="relative">
                {/* Glow effect */}
                <div className="absolute inset-0 bg-amber-500/20 blur-3xl rounded-full scale-150" />
                <img 
                  src="/alfred-logo.png" 
                  alt="Alfred"
                  className="w-80 h-80 relative z-10"
                />
              </div>
            </div>
            <h2 className="text-5xl font-serif font-light text-amber-100 mb-6 text-center">
              Meet Alfred
            </h2>
            <p className="text-xl text-slate-300 text-center max-w-xl leading-relaxed">
              Your AI-powered Chief of Staff, available 24/7 to coach, organize, and elevate your leadership
            </p>
          </div>
        </div>

        {/* Carousel Indicators */}
        <div className="absolute bottom-12 left-1/2 transform -translate-x-1/2 flex space-x-3 z-20">
          {[0, 1].map((index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`h-2 rounded-full transition-all duration-300 ${
                currentSlide === index
                  ? 'bg-amber-400 w-12'
                  : 'bg-slate-600 hover:bg-slate-500 w-2'
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Right Side - Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden mb-10 text-center">
            <div className="inline-block p-6 bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl mb-6 shadow-2xl">
              <img 
                src="/alfred-logo.png" 
                alt="Alfred"
                className="w-20 h-20"
              />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Alfred</h1>
            <p className="text-slate-600 text-lg">Your Executive Operating System</p>
          </div>

          {/* Welcome Text */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-slate-900 mb-3">
              {mode === "login" ? "Welcome back" : "Get started"}
            </h2>
            <p className="text-slate-600 text-lg">
              {mode === "login" 
                ? "Sign in to access your executive dashboard" 
                : "Create your account to elevate your leadership"}
            </p>
          </div>

          {/* Auth Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Username
              </label>
              <input
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full px-4 py-3.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none transition shadow-sm"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Password
              </label>
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none transition shadow-sm"
                required
              />
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
              className="w-full bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-900 hover:to-black text-white font-semibold py-4 px-4 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              {mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          {/* Toggle Mode */}
          <div className="mt-8 text-center">
            <p className="text-slate-600">
              {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
              <button
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError("");
                }}
                className="text-slate-800 hover:text-slate-900 font-semibold hover:underline"
              >
                {mode === "login" ? "Sign up" : "Sign in"}
              </button>
            </p>
          </div>

          {/* Divider */}
          <div className="mt-10 pt-6 border-t border-slate-200">
            <p className="text-xs text-slate-500 text-center">
              By continuing, you agree to Alfred's Terms of Service and Privacy Policy
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
