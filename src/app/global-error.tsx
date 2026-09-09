"use client";

/**
 * Last-resort boundary: this replaces the whole document, so it cannot use the
 * app shell, the theme provider, or any component that depends on them — hence
 * the inline styling rather than the design tokens used everywhere else.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#f5f5f7",
          color: "#1d1d1f",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 600, margin: "0 0 8px" }}>
            Reviewhere couldn&apos;t load
          </h1>
          <p style={{ fontSize: "15px", color: "#6e6e73", margin: "0 0 20px" }}>
            Something went wrong before the app started. Your saved work isn&apos;t affected.
          </p>
          <button
            onClick={reset}
            style={{
              height: "44px",
              padding: "0 20px",
              borderRadius: "12px",
              border: "none",
              background: "#0071e3",
              color: "#fff",
              fontSize: "15px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {error.digest && (
            <p style={{ fontSize: "13px", color: "#8e8e93", marginTop: "16px" }}>
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
