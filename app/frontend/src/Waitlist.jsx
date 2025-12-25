import { useState } from "react";

export default function Waitlist() {
  const [email, setEmail] = useState("");
  const [success, setSuccess] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    // Optional: capture source from URL (?src=video, ?src=friend, etc.)
    const params = new URLSearchParams(window.location.search);
    const source = params.get("src") || "landing_page";

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source })
      });

      if (!res.ok) throw new Error();

      const data = await res.json();
      setAlreadyRegistered(!!data.already_registered);
      setSuccess(true);
    } catch {
      setError("Something went wrong. Please try again.");
    }
  }

  // ✅ SUCCESS STATE
  if (success) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="text-center max-w-md px-6">
          <h1 className="text-3xl font-bold mb-4">
            {alreadyRegistered
              ? "You're already on the list 🙌"
              : "You're on the list 🎉"}
          </h1>
          <p className="text-slate-600">
            Alfred will reach out when early access opens.
          </p>
        </div>
      </div>
    );
  }

  // ✅ FORM STATE
  return (
    <div className="flex h-screen items-center justify-center bg-white">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md px-6 text-center"
      >
        <h1 className="text-3xl font-bold mb-4">Join the Alfred waitlist</h1>
        <p className="text-slate-600 mb-8">
          Be among the first executives to experience Alfred.
        </p>

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

        {error && (
          <p className="text-red-600 text-sm mt-4">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
