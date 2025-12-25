import { useEffect, useState } from "react";

const slides = [
  {
    image: "/leadership-cycle.png",
    caption: "Vision · Execution · People · Routines"
  },
  {
    image: "/alfred-logo.png",
    caption: "Your AI Chief of Staff"
  }
];

export default function Waitlist() {
  const [email, setEmail] = useState("");
  const [success, setSuccess] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [error, setError] = useState("");
  const [slideIndex, setSlideIndex] = useState(0);

  // Auto-rotate carousel
  useEffect(() => {
    const interval = setInterval(() => {
      setSlideIndex((i) => (i + 1) % slides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "waitlist_page" })
      });

      if (!res.ok) throw new Error("Request failed");

      const data = await res.json();
      setAlreadyRegistered(!!data.already_registered);
      setSuccess(true);
    } catch {
      setError("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 h-screen">

      {/* LEFT — CAROUSEL */}
      <div className="hidden lg:flex flex-col items-center justify-center bg-slate-900 text-white px-10">
        <img
          src={slides[slideIndex].image}
          className="w-[420px] mb-6 transition-opacity duration-500"
          alt="Slide"
        />
        <p className="text-slate-300 text-sm">
          {slides[slideIndex].caption}
        </p>
      </div>

      {/* RIGHT — FORM */}
      <div className="flex items-center justify-center bg-white px-6">
        <div className="w-full max-w-md text-center">

          {!success ? (
            <>
              <h1 className="text-3xl font-bold mb-4">
                Join the Alfred waitlist
              </h1>

              <p className="text-slate-600 mb-8">
                Be among the first executives to experience Alfred.
              </p>

              <form onSubmit={handleSubmit}>
                <input
                  type="email"
                  required
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 mb-4 border rounded-xl"
                />

                <button
                  type="submit"
                  className="w-full bg-black text-white py-3 rounded-xl"
                >
                  Join the waitlist
                </button>
              </form>

              {error && (
                <p className="text-red-600 text-sm mt-4">{error}</p>
              )}
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold mb-4">
                {alreadyRegistered
                  ? "You're already on the list 🙌"
                  : "You're on the list 🎉"}
              </h1>

              <p className="text-slate-600">
                Alfred will reach out soon.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
