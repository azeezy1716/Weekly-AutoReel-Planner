import express from "express";
import fs from "node:fs";
import path from "node:path";

const router = express.Router();

const DATA_DIR = path.join(process.cwd(), "server", "data");
const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

if (!fs.existsSync(ACCOUNTS_FILE)) {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify([], null, 2));
}

export type PlatformName =
  | "YouTube Shorts"
  | "TikTok"
  | "Instagram Reels"
  | "Facebook Reels";

export type PlatformAccount = {
  id: string;
  platform: PlatformName;
  accountName: string;
  accountHandle: string;
  connectionType: "real" | "manual";
  status: "connected" | "manual" | "needs_setup";
  providerAccountId?: string;
  channelId?: string;
  channelTitle?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

const allowedPlatforms: PlatformName[] = [
  "YouTube Shorts",
  "TikTok",
  "Instagram Reels",
  "Facebook Reels",
];

function createId(platform: PlatformName) {
  const slug = platform.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `${slug}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readAccounts(): PlatformAccount[] {
  try {
    const raw = fs.readFileSync(ACCOUNTS_FILE, "utf-8");
    const accounts = JSON.parse(raw);
    return Array.isArray(accounts) ? accounts : [];
  } catch {
    return [];
  }
}

function saveAccounts(accounts: PlatformAccount[]) {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}

function isPlatform(value: string): value is PlatformName {
  return allowedPlatforms.includes(value as PlatformName);
}

export function upsertRealYouTubeAccount(input: {
  providerAccountId: string;
  channelId?: string;
  channelTitle?: string;
}) {
  const accounts = readAccounts();
  const now = new Date().toISOString();

  const existingIndex = accounts.findIndex(
    (account) =>
      account.platform === "YouTube Shorts" &&
      account.providerAccountId === input.providerAccountId
  );

  const accountName =
    input.channelTitle?.trim() || input.providerAccountId || "YouTube Channel";

  const updatedAccount: PlatformAccount = {
    id:
      existingIndex >= 0
        ? accounts[existingIndex].id
        : createId("YouTube Shorts"),
    platform: "YouTube Shorts",
    accountName,
    accountHandle: accountName,
    connectionType: "real",
    status: "connected",
    providerAccountId: input.providerAccountId,
    channelId: input.channelId || "",
    channelTitle: input.channelTitle || accountName,
    notes: "Connected through Google OAuth.",
    createdAt: existingIndex >= 0 ? accounts[existingIndex].createdAt : now,
    updatedAt: now,
  };

  if (existingIndex >= 0) {
    accounts[existingIndex] = updatedAccount;
  } else {
    accounts.unshift(updatedAccount);
  }

  saveAccounts(accounts);

  return updatedAccount;
}

router.get("/", (_req, res) => {
  res.json({
    accounts: readAccounts(),
  });
});

router.get("/platform/:platform", (req, res) => {
  const platform = decodeURIComponent(req.params.platform || "");

  if (!isPlatform(platform)) {
    res.status(400).json({
      error: "Invalid platform.",
      allowedPlatforms,
    });
    return;
  }

  const accounts = readAccounts().filter(
    (account) => account.platform === platform
  );

  res.json({
    platform,
    accounts,
  });
});

router.post("/manual", (req, res) => {
  const platform = String(req.body.platform || "");
  const accountName = String(req.body.accountName || "").trim();
  const accountHandle = String(req.body.accountHandle || "").trim();
  const notes = String(req.body.notes || "").trim();

  if (!isPlatform(platform)) {
    res.status(400).json({
      error: "Invalid platform.",
      allowedPlatforms,
    });
    return;
  }

  if (!accountName) {
    res.status(400).json({
      error: "Account name is required.",
    });
    return;
  }

  const now = new Date().toISOString();

  const account: PlatformAccount = {
    id: createId(platform),
    platform,
    accountName,
    accountHandle,
    connectionType: "manual",
    status: "manual",
    notes,
    createdAt: now,
    updatedAt: now,
  };

  const accounts = readAccounts();
  accounts.unshift(account);
  saveAccounts(accounts);

  res.json({
    ok: true,
    account,
  });
});

router.delete("/:accountId", (req, res) => {
  const accountId = req.params.accountId;
  const accounts = readAccounts();
  const account = accounts.find((item) => item.id === accountId);

  if (!account) {
    res.status(404).json({
      error: "Account not found.",
    });
    return;
  }

  const remainingAccounts = accounts.filter((item) => item.id !== accountId);
  saveAccounts(remainingAccounts);

  res.json({
    ok: true,
    deletedAccount: account,
  });
});

export default router;