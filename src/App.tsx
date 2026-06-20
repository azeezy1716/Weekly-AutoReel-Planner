import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE_URL = "http://localhost:4000";

type ConnectedAccount = {
  accountId: string;
  connectedAt: string;
  channelId: string;
  channelTitle: string;
  connected: boolean;
};

type PostStatus = "Pending" | "Uploading" | "Posted" | "Failed";

const contentPlatforms = [
  "YouTube Shorts",
  "TikTok",
  "Instagram Reels",
  "Facebook Reels",
] as const;

type ContentPlatform = (typeof contentPlatforms)[number];

type ScheduledPost = {
  id: string;
  accountId: string;
  channelTitle?: string;
  originalFilename: string;
  title: string;
  description: string;
  tags: string;
  privacyStatus: "private" | "unlisted" | "public";
  scheduledAt: string;
  status: PostStatus;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

type PlannedVideo = {
  id: string;
  file: File;
  previewUrl: string;
  filename: string;
  contentPlatform: ContentPlatform;
  topic: string;
  title: string;
  description: string;
  tags: string;
  captionText: string;
  processedVideoUrl: string;
  processedFilename: string;
  scheduledAt: string;
  privacyStatus: "private" | "unlisted" | "public";
  status: "Draft" | "Scheduled";
};

const usaPostingTimes = [
  { hour: 12 },
  { hour: 15 },
  { hour: 18 },
  { hour: 21 },
];

function createId() {
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatFileSize(bytes: number) {
  if (!bytes) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size = size / 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

function cleanFilename(filename: string) {
  const cleaned =
    filename
      .replace(/\.[^/.]+$/, "")
      .replace(/^(VID|VIDEO|IMG|IMAGE|MOV|PXL|WA|WhatsApp)[_\-\s]*/i, "")
      .replace(/20\d{10,14}/g, "")
      .replace(/\b20\d{2}[_\-\s.]?\d{2}[_\-\s.]?\d{2}[_\-\s.]?\d{0,6}\b/g, "")
      .replace(/\b\d{6,}\b/g, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/[,.;:-]\s*$/g, "")
      .trim();

  return cleaned || "Short video";
}

function titleCase(text: string) {
  return text
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function generatePack(
  topicInput: string,
  platform: ContentPlatform = "YouTube Shorts"
) {
  const cleanedTopic = cleanFilename(topicInput);
  const topic = titleCase(cleanedTopic);
  const lowerTopic = topic.toLowerCase();

  let hook = "Watch this till the end.";
  let title = topic;
  let baseHashtags = ["#Shorts", "#ViralShorts", "#ShortFormContent"];

  if (
    lowerTopic.includes("friend") ||
    lowerTopic.includes("photo") ||
    lowerTopic.includes("left out") ||
    lowerTopic.includes("one left")
  ) {
    title = "One Friend Was Left Out";
    hook = "Everyone smiled, but one person felt it.";
    baseHashtags = ["#Friendship", "#Relatable", "#POV", "#Shorts"];
  }

  if (
    lowerTopic.includes("message") ||
    lowerTopic.includes("phone") ||
    lowerTopic.includes("alone") ||
    lowerTopic.includes("sad") ||
    lowerTopic.includes("silent")
  ) {
    title = lowerTopic.includes("message")
      ? "He Typed The Message But Never Sent It"
      : topic;

    hook = "Some feelings are quiet, but heavy.";
    baseHashtags = [
      "#DeepQuotes",
      "#RealFeelings",
      "#LonelyVibes",
      "#Shorts",
    ];
  }

  if (
    lowerTopic.includes("rat") ||
    lowerTopic.includes("chef") ||
    lowerTopic.includes("kitchen") ||
    lowerTopic.includes("cat")
  ) {
    title = topic;
    hook = "The tiny chef has one serious problem.";
    baseHashtags = [
      "#TinyChefRat",
      "#AnimatedStory",
      "#FunnyAnimation",
      "#RatChef",
      "#Shorts",
    ];
  }

  if (
    lowerTopic.includes("football") ||
    lowerTopic.includes("soccer") ||
    lowerTopic.includes("goal") ||
    lowerTopic.includes("stadium") ||
    lowerTopic.includes("world cup")
  ) {
    title = topic;
    hook = "Football fans will understand this feeling.";
    baseHashtags = [
      "#Football",
      "#Soccer",
      "#WorldCup",
      "#FootballFans",
      "#Shorts",
    ];
  }

  if (
    lowerTopic.includes("rust") ||
    lowerTopic.includes("clean") ||
    lowerTopic.includes("satisfying") ||
    lowerTopic.includes("asmr")
  ) {
    title = topic;
    hook = "This cleaning moment is too satisfying.";
    baseHashtags = [
      "#Satisfying",
      "#OddlySatisfying",
      "#ASMR",
      "#CleanTok",
      "#Shorts",
    ];
  }

  const platformHashtags: Record<ContentPlatform, string[]> = {
    "YouTube Shorts": ["#YouTubeShorts", "#Shorts"],
    TikTok: ["#TikTok", "#FYP", "#ForYou"],
    "Instagram Reels": ["#Reels", "#InstagramReels", "#ExplorePage"],
    "Facebook Reels": ["#FacebookReels", "#ReelsVideo", "#WatchThis"],
  };

  const finalHashtags = Array.from(
    new Set([...baseHashtags, ...platformHashtags[platform]])
  ).slice(0, 9);

  const descriptionByPlatform: Record<ContentPlatform, string> = {
    "YouTube Shorts": `${hook}

${topic}

${finalHashtags.join(" ")}`,

    TikTok: `POV: ${topic.toLowerCase()}

${hook}

${finalHashtags.join(" ")}`,

    "Instagram Reels": `${hook}

${topic}

Save this if you felt it.

${finalHashtags.join(" ")}`,

    "Facebook Reels": `${hook}

${topic}

What would you do?

${finalHashtags.join(" ")}`,
  };

  return {
    title: title.slice(0, 90),
    description: descriptionByPlatform[platform],
    tags: finalHashtags.join(" "),
    captionText: hook,
  };
}

function getNextWeekSchedule(index: number) {
  const now = new Date();
  const dayOffset = index;
  const time = usaPostingTimes[index % usaPostingTimes.length];

  const date = new Date(now);
  date.setDate(now.getDate() + dayOffset);
  date.setHours(time.hour, 0, 0, 0);

  if (date.getTime() <= now.getTime()) {
    date.setDate(date.getDate() + 1);
  }

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formatDateTime(value: string) {
  if (!value) return "No time";

  return new Date(value).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function processedUrlToFile(url: string, filename: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Could not load processed captioned video.");
  }

  const blob = await response.blob();

  return new File([blob], filename || "captioned-video.mp4", {
    type: blob.type || "video/mp4",
  });
}

function App() {
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [newAccountId, setNewAccountId] = useState("");
  const [plannedVideos, setPlannedVideos] = useState<PlannedVideo[]>([]);
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [processingVideoId, setProcessingVideoId] = useState("");
  const [message, setMessage] = useState("");

  const selectedAccount = connectedAccounts.find(
    (account) => account.accountId === selectedAccountId
  );

  const stats = useMemo(() => {
    return {
      drafts: plannedVideos.length,
      pending: scheduledPosts.filter((post) => post.status === "Pending").length,
      posted: scheduledPosts.filter((post) => post.status === "Posted").length,
      failed: scheduledPosts.filter((post) => post.status === "Failed").length,
    };
  }, [plannedVideos.length, scheduledPosts]);

  const calendarGroups = useMemo(() => {
    return [
      ...plannedVideos.map((video) => ({
        id: video.id,
        title: video.title,
        scheduledAt: video.scheduledAt,
        status: video.status,
        source: "Draft",
      })),
      ...scheduledPosts.map((post) => ({
        id: post.id,
        title: post.title,
        scheduledAt: post.scheduledAt,
        status: post.status,
        source: "Backend",
      })),
    ].sort(
      (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );
  }, [plannedVideos, scheduledPosts]);

  async function loadAccounts() {
    try {
      setIsLoadingAccounts(true);
      const response = await fetch(`${API_BASE_URL}/api/youtube/status`);
      const data = await response.json();

      const accounts = Array.isArray(data.connectedAccounts)
        ? data.connectedAccounts
        : [];

      setConnectedAccounts(accounts);

      if (accounts.length && !selectedAccountId) {
        setSelectedAccountId(accounts[0].accountId);
      }
    } catch {
      setMessage("Backend is not reachable. Make sure npm run server is running.");
    } finally {
      setIsLoadingAccounts(false);
    }
  }

  async function loadPosts() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/posts`);
      const data = await response.json();

      setScheduledPosts(Array.isArray(data.posts) ? data.posts : []);
    } catch {
      setMessage("Could not load scheduled posts.");
    }
  }

  useEffect(() => {
    loadAccounts();
    loadPosts();

    const interval = window.setInterval(() => {
      loadPosts();
    }, 10000);

    return () => window.clearInterval(interval);
  }, []);

  function connectYouTube() {
    const accountId = newAccountId.trim();

    if (!accountId) {
      alert("Enter an account ID first. Example: main-youtube");
      return;
    }

    window.open(
      `${API_BASE_URL}/api/youtube/connect/${encodeURIComponent(accountId)}`,
      "_blank"
    );
  }

  function handleVideoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []).filter((file) =>
      file.type.startsWith("video/")
    );

    if (!files.length) return;

    const defaultPlatform: ContentPlatform = "YouTube Shorts";

    const newVideos = files.map((file, index) => {
      const topic = cleanFilename(file.name);
      const pack = generatePack(topic, defaultPlatform);

      return {
        id: createId(),
        file,
        previewUrl: URL.createObjectURL(file),
        filename: file.name,
        contentPlatform: defaultPlatform,
        topic,
        title: pack.title,
        description: pack.description,
        tags: pack.tags,
        captionText: pack.captionText,
        processedVideoUrl: "",
        processedFilename: "",
        scheduledAt: getNextWeekSchedule(plannedVideos.length + index),
        privacyStatus: "public" as const,
        status: "Draft" as const,
      };
    });

    setPlannedVideos((current) => [...current, ...newVideos]);
    event.currentTarget.value = "";
  }

  function regenerateAll() {
    setPlannedVideos((current) =>
      current.map((video, index) => {
        const pack = generatePack(video.topic, video.contentPlatform);

        return {
          ...video,
          ...pack,
          processedVideoUrl: "",
          processedFilename: "",
          scheduledAt: video.scheduledAt || getNextWeekSchedule(index),
        };
      })
    );
  }

  function updateVideo(id: string, updates: Partial<PlannedVideo>) {
    setPlannedVideos((current) =>
      current.map((video) => (video.id === id ? { ...video, ...updates } : video))
    );
  }

  function removeDraft(id: string) {
    const video = plannedVideos.find((item) => item.id === id);
    if (video?.previewUrl) URL.revokeObjectURL(video.previewUrl);

    setPlannedVideos((current) => current.filter((item) => item.id !== id));
  }

  async function processCaptionedVideo(video: PlannedVideo) {
    if (!video.captionText.trim()) {
      alert("Add caption text first.");
      return;
    }

    try {
      setProcessingVideoId(video.id);
      setMessage("Processing captioned video with FFmpeg...");

      const formData = new FormData();
      formData.append("captionText", video.captionText.trim());
      formData.append("video", video.file);

      const response = await fetch(`${API_BASE_URL}/api/media/process`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Video processing failed.");
      }

      updateVideo(video.id, {
        processedVideoUrl: data.processed.fullUrl,
        processedFilename: data.processed.filename,
      });

      setMessage("Captioned video is ready. YouTube will use the captioned version.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Processing failed.");
    } finally {
      setProcessingVideoId("");
    }
  }

  async function getUploadFile(video: PlannedVideo) {
    if (video.processedVideoUrl) {
      return processedUrlToFile(video.processedVideoUrl, video.processedFilename);
    }

    return video.file;
  }

  async function scheduleOne(video: PlannedVideo) {
    if (video.contentPlatform !== "YouTube Shorts") {
      throw new Error(
        "Auto-posting currently supports YouTube Shorts only. Use TikTok/Instagram/Facebook packs for manual posting for now."
      );
    }

    if (!selectedAccountId) {
      throw new Error("Connect/select a YouTube account first.");
    }

    const uploadFile = await getUploadFile(video);

    const formData = new FormData();
    formData.append("accountId", selectedAccountId);
    formData.append("title", video.title);
    formData.append("description", video.description);
    formData.append("tags", video.tags);
    formData.append("privacyStatus", video.privacyStatus);
    formData.append("scheduledAt", new Date(video.scheduledAt).toISOString());
    formData.append("video", uploadFile);

    const response = await fetch(`${API_BASE_URL}/api/posts`, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Schedule failed");
    }

    return data;
  }

  async function scheduleAll() {
    if (!plannedVideos.length) {
      alert("Upload videos first.");
      return;
    }

    if (!selectedAccountId) {
      alert("Connect/select a YouTube account first.");
      return;
    }

    const unsupportedVideos = plannedVideos.filter(
      (video) => video.contentPlatform !== "YouTube Shorts"
    );

    if (unsupportedVideos.length) {
      alert(
        "Schedule All only supports YouTube Shorts for now. Change TikTok/Instagram/Facebook drafts back to YouTube Shorts or post them manually."
      );
      return;
    }

    try {
      setIsScheduling(true);
      setMessage("Scheduling videos to backend...");

      for (const video of plannedVideos) {
        await scheduleOne(video);
      }

      plannedVideos.forEach((video) => URL.revokeObjectURL(video.previewUrl));
      setPlannedVideos([]);
      await loadPosts();

      setMessage("All videos scheduled. Backend will auto-post when time reaches.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Scheduling failed.");
    } finally {
      setIsScheduling(false);
    }
  }

  async function uploadNow(postId: string) {
    try {
      setMessage("Uploading now...");

      const response = await fetch(`${API_BASE_URL}/api/posts/${postId}/upload-now`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload now failed");
      }

      await loadPosts();
      setMessage("Upload finished.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload now failed.");
    }
  }

  async function deletePost(postId: string) {
    const confirmed = window.confirm("Delete this pending scheduled post?");
    if (!confirmed) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/posts/${postId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Delete failed");
      }

      await loadPosts();
      setMessage("Post deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed.");
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-grid">
        <div className="hero-card animate-rise">
          <div className="top-pill">AutoPost Dashboard</div>
          <h1>Weekly Video Planner</h1>
          <p>
            Upload weekly videos, generate clean captions, burn captions into the video,
            schedule them, and let your backend post automatically.
          </p>

          <div className="hero-actions">
            <label className="primary-button">
              Upload Week Videos
              <input type="file" accept="video/*" multiple onChange={handleVideoUpload} />
            </label>

            <button type="button" onClick={regenerateAll}>
              Generate Packs
            </button>

            <button
              type="button"
              className="success-button"
              onClick={scheduleAll}
              disabled={isScheduling}
            >
              {isScheduling ? "Scheduling..." : "Schedule All"}
            </button>
          </div>

          <p style={{ marginTop: "1rem", color: "#aebcdf" }}>
            Later, we can add: royalty-free music library, auto-merge music into video
            using FFmpeg, volume control, and fade in/out.
          </p>
        </div>

        <div className="connect-card animate-rise delay-1">
          <div className="section-heading">
            <div>
              <h2>Real YouTube Connection</h2>
              <p>Only connected channels appear here.</p>
            </div>
          </div>

          <div className="connect-row">
            <input
              value={newAccountId}
              onChange={(event) => setNewAccountId(event.target.value)}
              placeholder="example: my-youtube-channel"
            />
            <button type="button" onClick={connectYouTube}>
              Connect
            </button>
            <button type="button" onClick={loadAccounts}>
              Refresh
            </button>
          </div>

          <label className="field-block">
            Select connected channel
            <select
              value={selectedAccountId}
              onChange={(event) => setSelectedAccountId(event.target.value)}
            >
              {!connectedAccounts.length && <option value="">No channel connected</option>}
              {connectedAccounts.map((account) => (
                <option key={account.accountId} value={account.accountId}>
                  {account.channelTitle || account.accountId}
                </option>
              ))}
            </select>
          </label>

          <div className="connection-status">
            {isLoadingAccounts ? (
              <span>Checking connection...</span>
            ) : selectedAccount ? (
              <>
                <strong>Connected ✅</strong>
                <span>{selectedAccount.channelTitle || selectedAccount.accountId}</span>
              </>
            ) : (
              <>
                <strong>No channel selected</strong>
                <span>Connect YouTube first.</span>
              </>
            )}
          </div>
        </div>
      </section>

      {message && <div className="notice-bar">{message}</div>}

      <section className="stats-grid">
        <article className="stat-card">
          <span>Draft Videos</span>
          <strong>{stats.drafts}</strong>
        </article>

        <article className="stat-card">
          <span>Pending</span>
          <strong>{stats.pending}</strong>
        </article>

        <article className="stat-card">
          <span>Posted</span>
          <strong>{stats.posted}</strong>
        </article>

        <article className="stat-card">
          <span>Failed</span>
          <strong>{stats.failed}</strong>
        </article>
      </section>

      <section className="main-layout">
        <div className="left-panel">
          <div className="section-heading">
            <div>
              <h2>Draft Week Videos</h2>
              <p>Edit, caption, process, then schedule.</p>
            </div>
            <span>{plannedVideos.length} drafts</span>
          </div>

          {!plannedVideos.length && (
            <div className="empty-state">
              <div className="empty-icon">▶</div>
              <h3>No draft videos yet</h3>
              <p>Upload your 1-week videos. The app will generate packs automatically.</p>
            </div>
          )}

          <div className="draft-list">
            {plannedVideos.map((video, index) => (
              <article className="video-card animate-rise" key={video.id}>
                <div className="video-preview">
                  <video
                    src={video.processedVideoUrl || video.previewUrl}
                    controls
                  />
                  <span>{formatFileSize(video.file.size)}</span>
                </div>

                <div className="video-info">
                  <div className="video-title-row">
                    <div>
                      <h3>{video.filename}</h3>
                      <p>
                        Draft #{index + 1}
                        {video.processedVideoUrl ? " · captioned video ready" : ""}
                      </p>
                    </div>

                    <select
                      value={video.privacyStatus}
                      onChange={(event) =>
                        updateVideo(video.id, {
                          privacyStatus: event.target.value as
                            | "private"
                            | "unlisted"
                            | "public",
                        })
                      }
                    >
                      <option value="public">Public</option>
                      <option value="unlisted">Unlisted</option>
                      <option value="private">Private</option>
                    </select>
                  </div>

                  <div className="form-grid">
                    <label>
                      Content Platform
                      <select
                        value={video.contentPlatform}
                        onChange={(event) => {
                          const contentPlatform = event.target.value as ContentPlatform;
                          const pack = generatePack(video.topic, contentPlatform);

                          updateVideo(video.id, {
                            contentPlatform,
                            ...pack,
                            processedVideoUrl: "",
                            processedFilename: "",
                          });
                        }}
                      >
                        {contentPlatforms.map((platform) => (
                          <option key={platform} value={platform}>
                            {platform}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Topic
                      <input
                        value={video.topic}
                        onChange={(event) => {
                          const topic = event.target.value;
                          const pack = generatePack(topic, video.contentPlatform);

                          updateVideo(video.id, {
                            topic,
                            ...pack,
                            processedVideoUrl: "",
                            processedFilename: "",
                          });
                        }}
                      />
                    </label>

                    <label>
                      Schedule Time
                      <input
                        type="datetime-local"
                        value={video.scheduledAt}
                        onChange={(event) =>
                          updateVideo(video.id, { scheduledAt: event.target.value })
                        }
                      />
                    </label>
                  </div>

                  <label>
                    Title
                    <input
                      value={video.title}
                      onChange={(event) =>
                        updateVideo(video.id, { title: event.target.value })
                      }
                    />
                  </label>

                  <label>
                    Caption / Description
                    <textarea
                      value={video.description}
                      onChange={(event) =>
                        updateVideo(video.id, { description: event.target.value })
                      }
                    />
                  </label>

                  <label>
                    Hashtags / Tags
                    <input
                      value={video.tags}
                      onChange={(event) =>
                        updateVideo(video.id, { tags: event.target.value })
                      }
                    />
                  </label>

                  <label>
                    Text To Burn On Video
                    <input
                      value={video.captionText}
                      onChange={(event) =>
                        updateVideo(video.id, {
                          captionText: event.target.value,
                          processedVideoUrl: "",
                          processedFilename: "",
                        })
                      }
                      placeholder="Example: Some feelings are quiet but heavy"
                    />
                  </label>

                  <div className="button-row">
                    <button
                      type="button"
                      onClick={() => {
                        const pack = generatePack(video.topic, video.contentPlatform);
                        updateVideo(video.id, {
                          ...pack,
                          processedVideoUrl: "",
                          processedFilename: "",
                        });
                      }}
                    >
                      Regenerate
                    </button>

                    <button
                      type="button"
                      onClick={() => processCaptionedVideo(video)}
                      disabled={processingVideoId === video.id}
                    >
                      {processingVideoId === video.id
                        ? "Processing..."
                        : "Process Captioned Video"}
                    </button>

                    {video.processedVideoUrl && (
                      <a
                        href={video.processedVideoUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ alignSelf: "center" }}
                      >
                        Open Processed Video
                      </a>
                    )}

                    <button
                      type="button"
                      className="success-button"
                      onClick={async () => {
                        try {
                          setMessage("Scheduling video...");
                          await scheduleOne(video);
                          removeDraft(video.id);
                          await loadPosts();
                          setMessage("Video scheduled.");
                        } catch (error) {
                          setMessage(
                            error instanceof Error ? error.message : "Schedule failed."
                          );
                        }
                      }}
                    >
                      Schedule
                    </button>

                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => removeDraft(video.id)}
                    >
                      Remove
                    </button>
                  </div>

                  {video.processedVideoUrl && (
                    <p style={{ color: "#b9ffdc", margin: 0, lineHeight: 1.6 }}>
                      Captioned video ready. YouTube upload will use the processed video.
                    </p>
                  )}

                  {video.contentPlatform !== "YouTube Shorts" && (
                    <p style={{ color: "#ffcf8a", margin: 0, lineHeight: 1.6 }}>
                      {video.contentPlatform} pack is for manual posting for now. Real
                      auto-post currently supports YouTube Shorts only.
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="right-panel">
          <div className="section-heading">
            <div>
              <h2>AutoPost Queue</h2>
              <p>Backend schedule status.</p>
            </div>

            <button type="button" onClick={loadPosts}>
              Refresh
            </button>
          </div>

          <div className="queue-list">
            {!scheduledPosts.length && (
              <div className="mini-empty">No scheduled backend posts yet.</div>
            )}

            {scheduledPosts.map((post) => (
              <article
                className={`queue-card status-${post.status.toLowerCase()}`}
                key={post.id}
              >
                <div>
                  <h3>{post.title}</h3>
                  <p>{post.channelTitle || post.accountId}</p>
                  <span>{formatDateTime(post.scheduledAt)}</span>
                </div>

                <div className="queue-meta">
                  <strong>{post.status}</strong>
                  <small>{post.privacyStatus}</small>
                </div>

                {post.error && <p className="error-text">{post.error}</p>}

                {post.youtubeUrl && (
                  <a href={post.youtubeUrl} target="_blank" rel="noreferrer">
                    Open YouTube
                  </a>
                )}

                <div className="button-row compact">
                  {post.status !== "Posted" && (
                    <button type="button" onClick={() => uploadNow(post.id)}>
                      Upload Now
                    </button>
                  )}

                  {post.status !== "Posted" && (
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => deletePost(post.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>

          <div className="calendar-box">
            <h2>Week Timeline</h2>

            {calendarGroups.length === 0 && <p>No videos on timeline yet.</p>}

            {calendarGroups.slice(0, 12).map((item) => (
              <div className="timeline-item" key={`${item.source}-${item.id}`}>
                <span>{formatDateTime(item.scheduledAt)}</span>
                <strong>{item.title}</strong>
                <small>{item.status}</small>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}

export default App;