import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PlayerRoute } from "./routes/player.js";
import { TvRoute } from "./routes/tv.js";
import "./styles.css";

const path = window.location.pathname;
const roomMatch = /^\/room\/([^/]+)$/.exec(path);
const app =
  path === "/tv" || path.startsWith("/tv/") ? (
    <TvRoute />
  ) : roomMatch !== null ? (
    <PlayerRoute roomId={decodeURIComponent(roomMatch[1] ?? "")} />
  ) : (
    <main className="phone-shell">
      <h1>Room link required</h1>
      <p>Scan the QR code shown on the local TV.</p>
    </main>
  );

const root = document.getElementById("root");
if (root === null) throw new Error("Application root is missing.");
createRoot(root).render(<StrictMode>{app}</StrictMode>);

if ("serviceWorker" in navigator)
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
