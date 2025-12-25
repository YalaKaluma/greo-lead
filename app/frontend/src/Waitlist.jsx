import { useState } from "react";

export default function Waitlist() {
  const [email, setEmail] = useState("");
  const [success, setSuccess] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const params = new URLSearchParams(window.location.search);
    const source = params.get("src") || "landing_page";

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source })
      });

      if (!res.ok) throw new Error("Request failed");

      const data = await res.json();
      setAlreadyRegistered(!!data.already_registered);
      setSuccess(true);
    } catch (err) {
      console.error("Waitlist error:", err);
      setError("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 h-screen">

      {/* ================= LEFT VISUAL PANEL ================= */}
      <div className="hidden lg:flex flex-col items-center justify-center bg-slate-900 text-white px-8">
        <img
          src="/alfred-logo.png"
          alt="Alfred"
          className="w-40 mb-10"
        />

        <img
          src="/leadership-cycle.png"
          alt="Leadership Cycle"
          className="w-[420px] opacity-90"
        />

        <p className="mt-10 text-slate-300 text-center max-w-md text-sm">
          Vision · Execution · People · Routines
        </p>
      </div>

      {/* ================= RIGHT FORM PANEL ================= */}
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
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-3 mb-4 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:outline-none"
                />

                <button
                  type="submit"
                  className="w-full bg-slate-900 text-white font-semibold py-3 rounded-xl hover:bg-black transition"
                >
                  Join the waitlist
                </button>
              </form>

              {error && (
                <p className="text-red-600 text-sm mt-4">
                  {error}
                </p>
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
                Alfred will reach out when early access opens.
              </p>
            </>
          )}

        </div>
      </div>

    </div>
  );
}
