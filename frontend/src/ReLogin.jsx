// ReLoginButton.jsx
import React from "react";

export default function ReLoginButton({ message = "Spotify session expired or missing. Please reconnect." }) {
  return (
    <div className="text-center my-6">
      <p className="mb-2 text-red-400 font-semibold">{message}</p>
      <a
        href="http://localhost:5000/auth/login"
        className="bg-green-600 px-6 py-2 rounded font-bold text-white shadow hover:bg-green-700 transition"
        style={{ display: "inline-block" }}
      >
        Reconnect Spotify
      </a>
    </div>
  );
}
