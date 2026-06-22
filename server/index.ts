import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { google } from "googleapis";
import mediaRouter, { PROCESSED_DIR } from "./media";
import accountsRouter, { upsertRealYouTubeAccount } from "./accounts";

dotenv.config();

const app = express();

const PORT = Number(process.env.SERVER_PORT || 4000);
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  "http://localhost:4000/api/youtube/callback";

const DATA_DIR = path.join(process.cwd(), "server", "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const TOKENS_FILE = path.join(DATA_DIR, "youtube-tokens.json");
const POSTS_FILE = path.join(DATA_DIR, "scheduled-posts.json");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (!fs.existsSync(TOKENS_FILE)) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify({}, null, 2));
}

if (!fs.existsSync(POSTS_FILE)) {
  fs.writeFileSync(POSTS_FILE, JSON.stringify([], null, 2));
}

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://azeezy1716.github.io"
    ],
    credentials: true
  })
);

app.use(express.json({ limit: "10mb" }));
app.use("/processed", express.static(PROCESSED_DIR));
app.use("/api/media", mediaRouter);
app.use("/api/accounts", accountsRouter);

const upload = multer({
  dest: UPLOAD_DIR,
  limits: {
    fileSize: 1024 * 1024 * 1024,
  },
});

type StoredYoutubeToken = {
  tokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    scope?: string;
    token_type?: string | null;
    expiry_date?: number | null;
  };
  connectedAt: string;
  channelId?: string;
  channelTitle?: string;
};

type YoutubeTokenStore = Record<string, StoredYoutubeToken>;

type ScheduledPostStatus = "Pending" | "Uploading" | "Posted" | "Failed";

type ScheduledPost = {
  id: string;
  accountId: string;
  channelTitle?: string;
  originalFilename: string;
  storedFilePath: string;
  mimeType: string;
  title: string;
  description: string;
  tags: string;
  privacyStatus: "private" | "unlisted" | "public";
  scheduledAt: string;
  status: ScheduledPostStatus;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  error?: string;
  retryCount?: number;
  nextRetryAt?: string;
  createdAt: string;
  updatedAt: string;
};

function createId() {
  return `post-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readTokenStore(): YoutubeTokenStore {
  try {
    const raw = fs.readFileSync(TOKENS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveTokenStore(store: YoutubeTokenStore) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(store, null, 2));
}

function readPosts(): ScheduledPost[] {
  try {
    const raw = fs.readFileSync(POSTS_FILE, "utf-8");
    const posts = JSON.parse(raw);
    return Array.isArray(posts) ? posts : [];
  } catch {
    return [];
  }
}

function savePosts(posts: ScheduledPost[]) {
  fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
}

function getOAuthClient() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env");
  }

  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

function cleanTags(tagsText: string) {
  return tagsText
    .split(/[,\s]+/)
    .map((tag) => tag.replace("#", "").trim())
    .filter(Boolean)
    .slice(0, 15);
}

function getConnectedAccounts() {
  const store = readTokenStore();

  return Object.entries(store).map(([accountId, data]) => ({
    accountId,
    connectedAt: data.connectedAt,
    channelId: data.channelId || "",
    channelTitle: data.channelTitle || "",
    connected: Boolean(data.tokens.refresh_token || data.tokens.access_token),
  }));
}

async function uploadVideoToYouTube(post: ScheduledPost) {
  const store = readTokenStore();
  const accountToken = store[post.accountId];

  if (!accountToken) {
    throw new Error("This YouTube account is not connected.");
  }

  if (!fs.existsSync(post.storedFilePath)) {
    throw new Error("Video file is missing from server storage.");
  }

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(accountToken.tokens);

  const youtube = google.youtube({
    version: "v3",
    auth: oauth2Client,
  });

  const response = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: post.title,
        description: post.description,
        tags: cleanTags(post.tags),
        categoryId: "22",
      },
      status: {
        privacyStatus: post.privacyStatus,
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      mimeType: post.mimeType,
      body: fs.createReadStream(post.storedFilePath),
    },
  });

  return {
    videoId: response.data.id || "",
    title: response.data.snippet?.title || post.title,
    privacyStatus: response.data.status?.privacyStatus || post.privacyStatus,
    watchUrl: response.data.id
      ? `https://www.youtube.com/watch?v=${response.data.id}`
      : "",
  };
}

async function processDuePosts() {
  const posts = readPosts();
  const now = Date.now();

  const duePosts = posts.filter((post) => {
    if (post.status !== "Pending") return false;

    const scheduledTimeReached = new Date(post.scheduledAt).getTime() <= now;
    const retryTimeReached = post.nextRetryAt
      ? new Date(post.nextRetryAt).getTime() <= now
      : true;

    return scheduledTimeReached && retryTimeReached;
  });

  if (!duePosts.length) return;

  for (const duePost of duePosts) {
    const latestPosts = readPosts();

    const uploadingPosts = latestPosts.map((post) =>
      post.id === duePost.id
        ? {
            ...post,
            status: "Uploading" as ScheduledPostStatus,
            updatedAt: new Date().toISOString(),
            error: "",
          }
        : post
    );

    savePosts(uploadingPosts);

    try {
      const uploadResult = await uploadVideoToYouTube(duePost);

      const completedPosts = readPosts().map((post) =>
        post.id === duePost.id
          ? {
              ...post,
              status: "Posted" as ScheduledPostStatus,
              youtubeVideoId: uploadResult.videoId,
              youtubeUrl: uploadResult.watchUrl,
              updatedAt: new Date().toISOString(),
              error: "",
              nextRetryAt: "",
            }
          : post
      );

      savePosts(completedPosts);
      console.log(`Posted to YouTube: ${uploadResult.watchUrl}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      const retryCount = (duePost.retryCount || 0) + 1;
      const shouldRetry = retryCount < 5;

      const retryDate = new Date();
      retryDate.setSeconds(retryDate.getSeconds() + 30);

      const failedPosts = readPosts().map((post) =>
        post.id === duePost.id
          ? {
              ...post,
              status: shouldRetry
                ? ("Pending" as ScheduledPostStatus)
                : ("Failed" as ScheduledPostStatus),
              retryCount,
              nextRetryAt: shouldRetry ? retryDate.toISOString() : "",
              error: shouldRetry
                ? `Retry ${retryCount}/5: ${message}`
                : `Failed after ${retryCount} attempts: ${message}`,
              updatedAt: new Date().toISOString(),
            }
          : post
      );

      savePosts(failedPosts);

      if (shouldRetry) {
        console.error(`Scheduled upload failed. Retrying in 30 seconds: ${message}`);
      } else {
        console.error("Scheduled upload failed permanently:", message);
      }
    }
  }
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    app: "Weekly AutoReel Planner API",
    port: PORT,
    scheduler: "running",
  });
});

app.get("/api/youtube/connect/:accountId", (req, res) => {
  try {
    const accountId = req.params.accountId;

    if (!accountId) {
      res.status(400).send("Missing accountId");
      return;
    }

    const oauth2Client = getOAuthClient();

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/youtube.readonly",
      ],
      state: accountId,
    });

    res.redirect(authUrl);
  } catch (error) {
    res.status(500).send(error instanceof Error ? error.message : "OAuth error");
  }
});

app.get("/api/youtube/callback", async (req, res) => {
  try {
    const code = String(req.query.code || "");
    const accountId = String(req.query.state || "");

    if (!code || !accountId) {
      res.status(400).send("Missing OAuth code or account id.");
      return;
    }

    const oauth2Client = getOAuthClient();
    const tokenResponse = await oauth2Client.getToken(code);

    oauth2Client.setCredentials(tokenResponse.tokens);

    let channelId = "";
    let channelTitle = "";

    try {
      const youtube = google.youtube({
        version: "v3",
        auth: oauth2Client,
      });

      const channelResponse = await youtube.channels.list({
        part: ["snippet"],
        mine: true,
      });

      const channel = channelResponse.data.items?.[0];

      channelId = channel?.id || "";
      channelTitle = channel?.snippet?.title || "";
    } catch {
      channelId = "";
      channelTitle = "";
    }

    const store = readTokenStore();

    store[accountId] = {
      tokens: tokenResponse.tokens,
      connectedAt: new Date().toISOString(),
      channelId,
      channelTitle,
    };

    saveTokenStore(store);

    upsertRealYouTubeAccount({
    providerAccountId: accountId,
    channelId,
    channelTitle,
    });

    res.send(`
      <html>
        <head>
          <title>YouTube Connected</title>
          <style>
            body {
              background: #080b13;
              color: white;
              font-family: Arial, sans-serif;
              padding: 40px;
            }

            .box {
              max-width: 680px;
              padding: 24px;
              border: 1px solid #27324d;
              border-radius: 16px;
              background: #111827;
            }

            code {
              color: #9bb6ff;
            }
          </style>
        </head>
        <body>
          <div class="box">
            <h1>YouTube connected ✅</h1>
            <p>Account ID:</p>
            <code>${accountId}</code>
            <p>Channel:</p>
            <code>${channelTitle || "Connected, but channel name was not returned"}</code>
            <p>You can close this tab and return to Weekly AutoReel Planner.</p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send(error instanceof Error ? error.message : "Callback error");
  }
});

app.get("/api/youtube/status", (_req, res) => {
  res.json({
    connectedAccounts: getConnectedAccounts(),
  });
});

app.post("/api/youtube/upload", upload.single("video"), async (req, res) => {
  const uploadedFile = req.file;

  try {
    const accountId = String(req.body.accountId || "");
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    const tags = String(req.body.tags || "").trim();
    const privacyStatus = String(req.body.privacyStatus || "private") as
      | "private"
      | "unlisted"
      | "public";

    if (!accountId) {
      res.status(400).json({ error: "Missing accountId" });
      return;
    }

    if (!title) {
      res.status(400).json({ error: "Missing title" });
      return;
    }

    if (!uploadedFile) {
      res.status(400).json({ error: "Missing video file" });
      return;
    }

    const tempPost: ScheduledPost = {
      id: createId(),
      accountId,
      originalFilename: uploadedFile.originalname,
      storedFilePath: uploadedFile.path,
      mimeType: uploadedFile.mimetype,
      title,
      description,
      tags,
      privacyStatus,
      scheduledAt: new Date().toISOString(),
      status: "Uploading",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const uploadResult = await uploadVideoToYouTube(tempPost);

    res.json({
      ok: true,
      videoId: uploadResult.videoId,
      title: uploadResult.title,
      privacyStatus: uploadResult.privacyStatus,
      watchUrl: uploadResult.watchUrl,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Upload failed",
    });
  } finally {
    if (uploadedFile?.path && fs.existsSync(uploadedFile.path)) {
      fs.unlinkSync(uploadedFile.path);
    }
  }
});

app.get("/api/posts", (_req, res) => {
  const posts = readPosts().map((post) => ({
    ...post,
    storedFilePath: undefined,
  }));

  res.json({
    posts,
  });
});

app.post("/api/posts", upload.single("video"), (req, res) => {
  const uploadedFile = req.file;

  try {
    const accountId = String(req.body.accountId || "");
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    const tags = String(req.body.tags || "").trim();
    const privacyStatus = String(req.body.privacyStatus || "public") as
      | "private"
      | "unlisted"
      | "public";
    const scheduledAt = String(req.body.scheduledAt || "");

    if (!accountId) {
      res.status(400).json({ error: "Missing accountId" });
      return;
    }

    if (!title) {
      res.status(400).json({ error: "Missing title" });
      return;
    }

    if (!scheduledAt) {
      res.status(400).json({ error: "Missing scheduledAt" });
      return;
    }

    if (!uploadedFile) {
      res.status(400).json({ error: "Missing video file" });
      return;
    }

    const store = readTokenStore();
    const account = store[accountId];

    if (!account) {
      res.status(401).json({ error: "YouTube account is not connected." });
      return;
    }

    const extension = path.extname(uploadedFile.originalname) || ".mp4";
    const finalFilePath = path.join(UPLOAD_DIR, `${createId()}${extension}`);

    fs.renameSync(uploadedFile.path, finalFilePath);

    const now = new Date().toISOString();

    const post: ScheduledPost = {
      id: createId(),
      accountId,
      channelTitle: account.channelTitle || "",
      originalFilename: uploadedFile.originalname,
      storedFilePath: finalFilePath,
      mimeType: uploadedFile.mimetype || "video/mp4",
      title,
      description,
      tags,
      privacyStatus,
      scheduledAt,
      status: "Pending",
      retryCount: 0,
      nextRetryAt: "",
      createdAt: now,
      updatedAt: now,
    };

    const posts = readPosts();
    posts.unshift(post);
    savePosts(posts);

    res.json({
      ok: true,
      post: {
        ...post,
        storedFilePath: undefined,
      },
    });
  } catch (error) {
    if (uploadedFile?.path && fs.existsSync(uploadedFile.path)) {
      fs.unlinkSync(uploadedFile.path);
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : "Could not schedule post",
    });
  }
});

app.post("/api/posts/:id/upload-now", async (req, res) => {
  const postId = req.params.id;

  try {
    const posts = readPosts();
    const post = posts.find((item) => item.id === postId);

    if (!post) {
      res.status(404).json({ error: "Post not found" });
      return;
    }

    if (post.status === "Posted") {
      res.status(400).json({ error: "This post is already posted." });
      return;
    }

    savePosts(
      posts.map((item) =>
        item.id === postId
          ? {
              ...item,
            status: "Uploading",
            error: "",
            retryCount: 0,
            nextRetryAt: "",
            updatedAt: new Date().toISOString(),
            }
          : item
      )
    );

    const uploadResult = await uploadVideoToYouTube(post);

    const updatedPosts = readPosts().map((item) =>
      item.id === postId
        ? {
            ...item,
            status: "Posted" as ScheduledPostStatus,
            youtubeVideoId: uploadResult.videoId,
            youtubeUrl: uploadResult.watchUrl,
            updatedAt: new Date().toISOString(),
            error: "",
          }
        : item
    );

    savePosts(updatedPosts);

    res.json({
      ok: true,
      videoId: uploadResult.videoId,
      watchUrl: uploadResult.watchUrl,
    });
  } catch (error) {
    const posts = readPosts();

    savePosts(
      posts.map((item) =>
        item.id === postId
          ? {
              ...item,
              status: "Failed",
              error: error instanceof Error ? error.message : "Upload failed",
              updatedAt: new Date().toISOString(),
            }
          : item
      )
    );

    res.status(500).json({
      error: error instanceof Error ? error.message : "Upload failed",
    });
  }
});

app.delete("/api/posts/:id", (req, res) => {
  const postId = req.params.id;
  const posts = readPosts();
  const post = posts.find((item) => item.id === postId);

  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  if (post.status === "Posted") {
    res.status(400).json({ error: "Posted videos cannot be deleted from YouTube here." });
    return;
  }

  if (post.storedFilePath && fs.existsSync(post.storedFilePath)) {
    fs.unlinkSync(post.storedFilePath);
  }

  savePosts(posts.filter((item) => item.id !== postId));

  res.json({
    ok: true,
  });
});

setInterval(() => {
  processDuePosts().catch((error) => {
    console.error("Scheduler error:", error);
  });
}, 30_000);

app.listen(PORT, () => {
  console.log(`Weekly AutoReel Planner API running on http://localhost:${PORT}`);
  console.log("Auto-post scheduler is checking every 30 seconds.");
});


