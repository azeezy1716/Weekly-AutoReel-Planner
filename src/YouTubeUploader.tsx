import { useState } from "react";

const API_BASE_URL = "http://localhost:4000";

type UploadResult = {
  ok?: boolean;
  videoId?: string;
  title?: string;
  privacyStatus?: string;
  watchUrl?: string;
  error?: string;
};

function YouTubeUploader() {
  const [accountId, setAccountId] = useState("silent-frames-youtube");
  const [title, setTitle] = useState("Silent Frames Private Test");
  const [description, setDescription] = useState(
    "This video was uploaded from Weekly AutoReel Planner."
  );
  const [tags, setTags] = useState("SilentFrames, Shorts, DeepQuotes");
  const [privacyStatus, setPrivacyStatus] = useState("private");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [statusText, setStatusText] = useState("");
  const [connectionJson, setConnectionJson] = useState("");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const connectYouTube = () => {
    if (!accountId.trim()) {
      alert("Add account ID first.");
      return;
    }

    window.open(
      `${API_BASE_URL}/api/youtube/connect/${encodeURIComponent(accountId.trim())}`,
      "_blank"
    );
  };

  const checkConnection = async () => {
    try {
      setStatusText("Checking YouTube connection...");
      setConnectionJson("");

      const response = await fetch(`${API_BASE_URL}/api/youtube/status`);
      const data = await response.json();

      setConnectionJson(JSON.stringify(data, null, 2));
      setStatusText("Connection checked.");
    } catch {
      setStatusText("Could not reach backend server. Make sure npm run server is running.");
    }
  };

  const uploadToYouTube = async () => {
    if (!accountId.trim()) {
      alert("Add account ID first.");
      return;
    }

    if (!title.trim()) {
      alert("Add video title first.");
      return;
    }

    if (!videoFile) {
      alert("Select a video file first.");
      return;
    }

    try {
      setIsUploading(true);
      setResult(null);
      setStatusText("Uploading to YouTube. Do not close this page...");

      const formData = new FormData();
      formData.append("accountId", accountId.trim());
      formData.append("title", title.trim());
      formData.append("description", description.trim());
      formData.append("tags", tags.trim());
      formData.append("privacyStatus", privacyStatus);
      formData.append("video", videoFile);

      const response = await fetch(`${API_BASE_URL}/api/youtube/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setResult(data);
      setStatusText("Upload finished.");
    } catch (error) {
      setResult({
        error: error instanceof Error ? error.message : "Upload failed",
      });
      setStatusText("Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <section className="calendar-panel" style={{ position: "static", margin: "1.2rem 0" }}>
      <div className="section-heading">
        <div>
          <h2>YouTube Real Upload</h2>
          <p>Upload to connected YouTube channel. Test with Private first.</p>
        </div>

        <div className="toolbar-group">
          <button type="button" onClick={connectYouTube}>
            Connect YouTube
          </button>

          <button type="button" onClick={checkConnection}>
            Check Connection
          </button>
        </div>
      </div>

      <div className="pack-box" style={{ marginTop: "1rem" }}>
        <div className="form-grid">
          <label>
            Backend Account ID
            <input
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              placeholder="silent-frames-youtube"
            />
          </label>

          <label>
            Privacy
            <select
              value={privacyStatus}
              onChange={(event) => setPrivacyStatus(event.target.value)}
            >
              <option value="private">Private</option>
              <option value="unlisted">Unlisted</option>
            </select>
          </label>

          <label>
            Video Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Video title"
            />
          </label>

          <label>
            Tags
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="tag1, tag2, tag3"
            />
          </label>
        </div>

        <label>
          Description
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Video description"
          />
        </label>

        <label>
          Select Video File
          <input
            type="file"
            accept="video/*"
            onChange={(event) => setVideoFile(event.target.files?.[0] || null)}
          />
        </label>

        {videoFile && (
          <p style={{ color: "#c7d0e6", margin: 0 }}>
            Selected: <strong>{videoFile.name}</strong>
          </p>
        )}

        <div className="button-grid">
          <button type="button" onClick={uploadToYouTube} disabled={isUploading}>
            {isUploading ? "Uploading..." : "Upload to YouTube Private"}
          </button>
        </div>

        {statusText && (
          <p style={{ color: "#c7d0e6", margin: 0 }}>
            {statusText}
          </p>
        )}

        {connectionJson && (
          <pre
            style={{
              background: "#0d1322",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "0.85rem",
              padding: "1rem",
              overflowX: "auto",
              whiteSpace: "pre-wrap",
            }}
          >
            {connectionJson}
          </pre>
        )}

        {result?.error && (
          <div className="danger-button" style={{ cursor: "default" }}>
            {result.error}
          </div>
        )}

        {result?.ok && (
          <div
            style={{
              background: "rgba(0, 220, 130, 0.12)",
              border: "1px solid rgba(0, 220, 130, 0.28)",
              color: "#b9ffdc",
              borderRadius: "0.85rem",
              padding: "1rem",
              lineHeight: "1.7",
            }}
          >
            <strong>Upload successful ✅</strong>
            <br />
            Video ID: {result.videoId}
            <br />
            Privacy: {result.privacyStatus}
            <br />
            {result.watchUrl && (
              <a href={result.watchUrl} target="_blank" rel="noreferrer">
                Open YouTube video
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default YouTubeUploader;