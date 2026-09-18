import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useLogin } from "../api/auth";

export default function Login() {
  const [password, setPassword] = useState("");
  const login = useLogin();
  const navigate = useNavigate();

  function submit(e: FormEvent) {
    e.preventDefault();
    login.mutate(password, {
      onSuccess: () => navigate("/app/today"),
    });
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <h1>Opravilko</h1>
        <p>Your tasks, stored in your Dropbox.</p>
        {login.isError && <div className="login-error">Incorrect password.</div>}
        <input
          type="password"
          placeholder="Password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn btn-primary" type="submit" disabled={login.isPending}>
          {login.isPending ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
