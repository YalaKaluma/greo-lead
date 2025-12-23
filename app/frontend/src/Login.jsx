import { useState } from "react";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login"); // login | register
  const [error, setError] = useState("");

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

      // 🔑 Store user identity (Phase-0 auth)
      localStorage.setItem("user_number", data.user_number);

      onLogin();
    } catch (err) {
      setError("Authentication failed");
    }
  }

  return (
    <div style={{
      maxWidth: 360,
      margin: "120px auto",
      padding: 24,
      border: "1px solid #ddd",
      borderRadius: 8
    }}>
      <h2 style={{ marginBottom: 16 }}>
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h2>

      <form onSubmit={handleSubmit}>
        <input
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          style={{ width: "100%", marginBottom: 8 }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={{ width: "100%", marginBottom: 12 }}
        />

        {error && <p style={{ color: "red" }}>{error}</p>}

        <button style={{ width: "100%" }} type="submit">
          {mode === "login" ? "Login" : "Register"}
        </button>
      </form>

      <p style={{ marginTop: 12, fontSize: 14 }}>
        {mode === "login" ? "No account?" : "Already have one?"}{" "}
        <button
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          style={{ border: "none", background: "none", color: "#2563eb", cursor: "pointer" }}
        >
          {mode === "login" ? "Register" : "Login"}
        </button>
      </p>
    </div>
  );
}
