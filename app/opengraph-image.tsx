import { ImageResponse } from "next/og";

export const alt = "HackBuddy";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background:
            "radial-gradient(circle at 50% 38%, #f4f9ff 0%, #ffffff 54%, #f8fbff 100%)",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            background: "#ffffff",
            border: "2px solid #dbeafe",
            borderRadius: 44,
            boxShadow: "0 24px 64px rgba(15, 30, 56, 0.12)",
            display: "flex",
            height: 190,
            justifyContent: "center",
            width: 190,
          }}
        >
          <svg
            height="136"
            viewBox="0 0 200 200"
            width="136"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M52 34h96v42c0 42-19 68-48 68S52 118 52 76V34Z"
              fill="#0877e8"
            />
            <path
              d="M52 51H22v18c0 31 19 51 49 53M148 51h30v18c0 31-19 51-49 53"
              fill="none"
              stroke="#0877e8"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="14"
            />
            <path
              d="M100 141v25M70 181h60M82 166h36"
              fill="none"
              stroke="#0f1e38"
              strokeLinecap="round"
              strokeWidth="13"
            />
            <path
              d="m80 75-16 13 16 13M120 75l16 13-16 13M109 67 91 109"
              fill="none"
              stroke="#ffffff"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="9"
            />
          </svg>
        </div>

        <div
          style={{
            alignItems: "baseline",
            display: "flex",
            fontFamily: "Arial, Helvetica, sans-serif",
            fontSize: 78,
            fontWeight: 800,
            letterSpacing: "-4px",
            lineHeight: 1,
            marginTop: 42,
          }}
        >
          <span style={{ color: "#0f1e38" }}>Hack</span>
          <span style={{ color: "#0877e8" }}>Buddy</span>
        </div>
      </div>
    ),
    size,
  );
}
