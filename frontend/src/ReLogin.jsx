// ReLoginButton.jsx
import React from "react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

export default function ReLoginButton({ message = "Spotify session expired or missing. Please reconnect." }) {
  return (
    <div className="box text-center my-4">
      <p className="mb-3 font-bold">{message}</p>
      <a href={`${BACKEND_URL}/auth/login`} className="btn btn-lime btn-big">
        Reconnect Spotify
      </a>
    </div>
  );
}
