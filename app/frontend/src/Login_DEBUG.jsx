import { useState, useEffect } from "react";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login");
  const [error, setError] = useState("");
  const [currentSlide, setCurrentSlide] = useState(0);
  const [imageErrors, setImageErrors] = useState({});

  // Carousel auto-advance
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % 2);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  // Log image load status
  const handleImageLoad = (imageName) => {
    console.log(`✅ Image loaded successfully: ${imageName}`);
    setImageErrors(prev => ({ ...prev, [imageName]: false }));
  };

  const handleImageError = (imageName, src) => {
    console.error(`❌ Image failed to load: ${imageName} from ${src}`);
    setImageErrors(prev => ({ ...prev, [imageName]: true }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      if (!res.ok) throw new Error("Auth failed");

      const data = await res.json();
      localStorage.setItem("user_number", data.user.user_number);
      onLogin(data.user.user_number);
    } catch (err) {
      setError(mode === "login" ? "Invalid credentials" : "Registration failed");
    }
  }

  // Test different image paths
  const imagePaths = {
    alfred1: "/alfred-logo.png",
    alfred2: "./alfred-logo.png",
    alfred3: "/static/alfred-logo.png",
    alfred4: "/assets/alfred-logo.png",
    cycle1: "/leadership-cycle.png",
    cycle2: "./leadership-cycle.png",
  };

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Left Side - Carousel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 relative overflow-hidden">
        {/* Debug Info */}
        <div className="absolute top-4 left-4 bg-black/80 text-white p-4 rounded text-xs max-w-md z-50">
          <div className="font-bold mb-2">🔍 Image Debug Info:</div>
          <div className="space-y-1">
            <div>Current URL: {window.location.href}</div>
            <div className="mt-2 font-bold">Testing paths:</div>
            {Object.entries(imagePaths).map(([key, path]) => (
              <div key={key} className="flex items-center gap-2">
                <span className={imageErrors[key] ? "text-red-400" : "text-green-400"}>
                  {imageErrors[key] === false ? "✓" : imageErrors[key] === true ? "✗" : "?"}
                </span>
                <span>{key}: {path}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Decorative gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-amber-900/10 via-transparent to-blue-900/10 pointer-events-none" />
        
        {/* Carousel Container */}
        <div className="relative w-full h-full flex items-center justify-center z-10">
          {/* Slide 1: Leadership Cycle */}
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center p-16 transition-all duration-1000 ${
              currentSlide === 0 ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="mb-12 w-full max-w-2xl">
              <img 
                src="/leadership-cycle.png" 
                alt="Leadership Cycle"
                className="w-full h-auto drop-shadow-2xl"
                onLoad={() => handleImageLoad('cycle1')}
                onError={(e) => handleImageError('cycle1', e.target.src)}
              />
              {imageErrors.cycle1 && (
                <div className="text-red-400 text-center mt-4">
                  ❌ Failed to load /leadership-cycle.png
                  <div className="text-sm mt-2">Trying alternate paths...</div>
                  <img 
                    src="./leadership-cycle.png" 
                    alt="Leadership Cycle Fallback"
                    className="hidden"
                    onLoad={() => handleImageLoad('cycle2')}
                    onError={(e) => handleImageError('cycle2', e.target.src)}
                  />
                </div>
              )}
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
              currentSlide === 1 ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="mb-12">
              <div className="relative">
                <div className="absolute inset-0 bg-amber-500/20 blur-3xl rounded-full scale-150" />
                <img 
                  src="/alfred-logo.png" 
                  alt="Alfred"
                  className="w-80 h-80 relative z-10"
                  onLoad={() => handleImageLoad('alfred1')}
                  onError={(e) => handleImageError('alfred1', e.target.src)}
                />
                {imageErrors.alfred1 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-800/90 rounded-lg">
                    <div className="text-red-400 text-center p-4">
                      ❌ Failed to load /alfred-logo.png
                      <div className="text-sm mt-2">Testing alternates...</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <h2 className="text-5xl font-serif font-light text-amber-100 mb-6 text-center">
              Meet Alfred
            </h2>
            <p className="text-xl text-slate-300 text-center max-w-xl leading-relaxed">
              Your AI-powered Chief of Staff, available 24/7
            </p>
          </div>

          {/* Hidden test images */}
          <div className="hidden">
            <img src="./alfred-logo.png" onLoad={() => handleImageLoad('alfred2')} onError={(e) => handleImageError('alfred2', e.target.src)} />
            <img src="/static/alfred-logo.png" onLoad={() => handleImageLoad('alfred3')} onError={(e) => handleImageError('alfred3', e.target.src)} />
            <img src="/assets/alfred-logo.png" onLoad={() => handleImageLoad('alfred4')} onError={(e) => handleImageError('alfred4', e.target.src)} />
          </div>
        </div>

        {/* Carousel Indicators */}
        <div className="absolute bottom-12 left-1/2 transform -translate-x-1/2 flex space-x-3 z-20">
          {[0, 1].map((index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`h-2 rounded-full transition-all duration-300 ${
                currentSlide === index ? 'bg-amber-400 w-12' : 'bg-slate-600 w-2'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Right Side - Auth Form (unchanged) */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">
          <div className="hidden lg:block mb-12">
            <div className="flex items-center mb-8">
              <div className="p-3 bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-xl">
                <img 
                  src="/alfred-logo.png" 
                  alt="Alfred"
                  className="w-12 h-12"
                  onError={(e) => {
                    console.error("Logo failed in header too");
                    e.target.style.display = 'none';
                  }}
                />
              </div>
              <div className="ml-4">
                <h1 className="text-2xl font-bold text-slate-900">Alfred</h1>
                <p className="text-slate-600">Leadership OS</p>
              </div>
            </div>
          </div>

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
                className="w-full px-4 py-3.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-sm"
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
                className="w-full px-4 py-3.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-sm"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-4 px-4 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              {mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-slate-600">
              {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
              <button
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError("");
                }}
                className="text-blue-600 hover:text-blue-700 font-semibold"
              >
                {mode === "login" ? "Sign up" : "Sign in"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
