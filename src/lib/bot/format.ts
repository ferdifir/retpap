/** Escapes text before it goes into an HTML-parsed Telegram message. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type MentionUser = {
  firstName: string;
  username?: string | null;
  telegramId: number;
};

/**
 * Clickable name for a notification. Users without a public username still
 * get a working link through `tg://user?id=`, which opens their profile.
 */
export function userLink(user: MentionUser): string {
  const href = user.username
    ? "https://t.me/" + user.username
    : "tg://user?id=" + user.telegramId;
  return '<a href="' + href + '">' + escapeHtml(user.firstName) + "</a>";
}

export function commentNotificationBody(author: MentionUser, body: string): string {
  return (
    "💬 <b>" +
    userLink(author) +
    "</b> mengomentari fotomu:\n\n<i>" +
    escapeHtml(body) +
    "</i>"
  );
}

/** Anonymous comments reach the uploader without any author hint. */
export function anonymousCommentNotificationBody(body: string): string {
  return "💬 <b>Seseorang</b> mengomentari fotomu:\n\n<i>" + escapeHtml(body) + "</i>";
}

/** Channel caption for a shared drawing; the owner approved this verbatim. */
export const DRAWING_CHANNEL_CAPTION =
  "<b>“Coretan dari RetPAP”</b>\n\nCoretan ini dibuat user di atas foto. Lihat versi jelas + coretan lainnya di aplikasi.";

/** Ratings and reactions are anonymous in the feed, so the owner stays too. */
export function ratingNotificationBody(score: number): string {
  const shown = Number.isInteger(score) ? String(score) : score.toFixed(1);
  return "⭐ <b>Seseorang</b> memberi rating " + shown + " ke fotomu.";
}

export function reactionNotificationBody(emoji: string): string {
  return escapeHtml(emoji) + " <b>Seseorang</b> bereaksi ke fotomu.";
}

/** Confirmation for the winner who just claimed the monthly reward. */
export function rewardClaimText(reward: {
  caption: string;
  avgScore: number;
  votes: number;
  amount: number;
}): string {
  const avg = reward.avgScore.toFixed(1);
  const raw = (reward.avgScore * reward.votes).toFixed(1);

  return [
    "🏆 <b>Hadiah Top PAP</b>",
    "",
    '"<i>' + escapeHtml(reward.caption) + '</i>"',
    avg + "/10 · " + reward.votes + " rating",
    avg + " × " + reward.votes + " = " + raw + " → <b>" + reward.amount + " Stars</b>",
    "",
    "Klaim tercatat. Stars dikirim manual oleh owner.",
  ].join("\n");
}

/** DM to the owner so the Stars transfer can be made by hand. */
export function rewardClaimOwnerNotice(input: {
  claimant: MentionUser;
  caption: string;
  avgScore: number;
  votes: number;
  amount: number;
}): string {
  return [
    "🏆 <b>Klaim hadiah</b>",
    "",
    userLink(input.claimant) + " (id " + input.claimant.telegramId + ")",
    input.amount + " Stars · " + input.avgScore.toFixed(1) + " × " + input.votes,
    '"<i>' + escapeHtml(input.caption) + '</i>"',
  ].join("\n");
}

/**
 * Shown to anyone who is not the recipient. It names the winner (already public
 * in the channel) instead of exposing whether the prize was claimed, so a
 * stranger never sees someone else's claim status.
 */
export function rewardNotEligibleText(reward: {
  caption: string;
  avgScore: number;
  votes: number;
}): string {
  return [
    "🎁 <b>Hadiah bulan ini untuk pemilik PAP</b>",
    "",
    '"<i>' + escapeHtml(reward.caption) + '</i>" (' +
      reward.avgScore.toFixed(1) + "/10 · " + reward.votes + " rating)",
    "",
    "Kamu belum termasuk penerima. Pemenang Top PAP adalah peringkat 1 bulan berjalan.",
  ].join("\n");
}
