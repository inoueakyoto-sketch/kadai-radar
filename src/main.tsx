import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

type ErrorBoundaryState = { hasError: boolean; message: string };

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "不明なエラー"
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Kadai Radar render error", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="fatal-screen">
        <section className="fatal-card">
          <p className="fatal-eyebrow">KADAI RADAR</p>
          <h1>画面を読み込めませんでした</h1>
          <p>一度再読み込みしてください。直らない場合は、下の「キャッシュを更新」を押してください。</p>
          <button type="button" onClick={() => window.location.reload()}>再読み込み</button>
          <button
            type="button"
            className="fatal-secondary"
            onClick={async () => {
              if ("serviceWorker" in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                await Promise.all(registrations.map((registration) => registration.unregister()));
              }
              if ("caches" in window) {
                const keys = await caches.keys();
                await Promise.all(keys.filter((key) => key.startsWith("kadai-radar-")).map((key) => caches.delete(key)));
              }
              window.location.reload();
            }}
          >
            キャッシュを更新
          </button>
          <details><summary>エラー情報</summary><code>{this.state.message}</code></details>
        </section>
      </main>
    );
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("root element not found");

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: "none" });
      await registration.update();
    } catch (error) {
      console.warn("Service worker registration failed", error);
    }
  });
}
