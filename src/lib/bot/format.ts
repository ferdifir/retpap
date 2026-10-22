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

export function digestNotificationBody(counts: {
  reactions: number;
  ratings: number;
  comments: number;
}): string {
  const parts: string[] = [];
  if (counts.reactions > 0) parts.push(counts.reactions + " reaksi baru");
  if (counts.ratings > 0) parts.push(counts.ratings + " nilai baru");
  if (counts.comments > 0) parts.push(counts.comments + " komentar baru");

  return "📣 Fotomu dapat " + parts.join(", ") + " dalam 15 menit terakhir.";
}
