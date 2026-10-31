/**
 * Curated reaction set, shared by the picker and the API.
 *
 * The list is ordered: the grid renders in array order, so the reactions users
 * reach for most sit in the first rows instead of behind a scroll. The first
 * group is the vocabulary users type themselves in comments and captions
 * (🤤, 🥵, 💦, 💋), which the previous generic set did not offer at all.
 *
 * Emoji are stored as plain text, so these strings are canonical: changing a
 * code point (for example dropping U+FE0F from "❤️") would make the toggle-off
 * branch miss existing rows. Keep the literals exactly as they are.
 *
 * Nothing here is newer than Emoji 14 and there are no ZWJ sequences, so older
 * Android fonts render every glyph and no entry needs more than a few bytes.
 *
 * Removing an entry does not break stored reactions: `toggleReaction` keeps
 * accepting the user's own current emoji even when it left this list.
 */

export type ReactionEmoji = {
  emoji: string;
  /** Short Indonesian name, also read by screen readers. */
  label: string;
  /** Lowercase search terms, Indonesian and English. */
  keywords: readonly string[];
};

export const REACTION_EMOJIS: readonly ReactionEmoji[] = [
  // Hasrat
  { emoji: "🤤", label: "ngiler", keywords: ["ngiler", "drool", "hasrat", "mupeng", "lapar"] },
  { emoji: "🥵", label: "kepanasan", keywords: ["panas", "kepanasan", "hot", "gerah"] },
  { emoji: "💦", label: "basah", keywords: ["basah", "keringat", "sweat", "wet", "droplet"] },
  { emoji: "💋", label: "cium", keywords: ["cium", "kiss", "muah", "bibir"] },
  { emoji: "😋", label: "nyam", keywords: ["nyam", "enak", "yum", "makan", "lidah"] },
  { emoji: "😘", label: "cium manis", keywords: ["cium", "kiss", "muah", "sayang"] },
  { emoji: "🫦", label: "gigit bibir", keywords: ["gigit bibir", "biting lip", "menggoda", "tegang"] },
  { emoji: "🤭", label: "menahan ketawa", keywords: ["ketawa", "malu", "giggle", "godaan"] },

  // Pujian dan tubuh
  { emoji: "🔥", label: "api", keywords: ["api", "fire", "keren", "hot", "panas"] },
  { emoji: "❤️", label: "cinta", keywords: ["cinta", "love", "hati", "heart"] },
  { emoji: "😍", label: "suka", keywords: ["suka", "cinta", "love", "heart eyes", "kagum"] },
  { emoji: "💯", label: "seratus", keywords: ["seratus", "sempurna", "perfect", "hundred"] },
  { emoji: "🍌", label: "pisang", keywords: ["pisang", "banana", "buah", "lucu"] },
  { emoji: "🍑", label: "persik", keywords: ["persik", "peach", "buah", "manis"] },
  { emoji: "😳", label: "malu", keywords: ["malu", "blush", "shy", "kaget"] },
  { emoji: "😩", label: "mengeluh", keywords: ["mengeluh", "capek", "desah", "tired"] },

  // Ekspresi
  { emoji: "😂", label: "tertawa", keywords: ["tertawa", "lucu", "laugh", "lol"] },
  { emoji: "🤣", label: "ngakak", keywords: ["ngakak", "lucu", "rofl", "laugh"] },
  { emoji: "😭", label: "menangis", keywords: ["menangis", "sedih", "cry", "sob"] },
  { emoji: "🤯", label: "meledak pikiran", keywords: ["kaget", "mind blown", "shock", "wow"] },
  { emoji: "👀", label: "mata", keywords: ["mata", "lihat", "eyes", "intip"] },
  { emoji: "🫣", label: "ngintip", keywords: ["ngintip", "malu", "peek", "shy"] },
  { emoji: "💀", label: "tengkorak", keywords: ["tengkorak", "mati", "skull", "dead"] },
  { emoji: "🤌", label: "gestur tangan", keywords: ["tangan", "pinch", "chef kiss", "mantap"] },

  // Apresiasi
  { emoji: "👍", label: "jempol", keywords: ["jempol", "like", "setuju", "thumbs up"] },
  { emoji: "👏", label: "tepuk tangan", keywords: ["tepuk", "tangan", "clap", "applause"] },
  { emoji: "💪", label: "kuat", keywords: ["kuat", "otot", "strong", "semangat"] },
  { emoji: "🏆", label: "trofi", keywords: ["trofi", "trophy", "juara", "menang"] },
  { emoji: "✨", label: "kilau", keywords: ["kilau", "sparkle", "cantik", "shine"] },
  { emoji: "🎯", label: "tepat sasaran", keywords: ["target", "tepat", "akurat", "bullseye"] },
  { emoji: "👌", label: "oke", keywords: ["oke", "ok", "sip", "perfect"] },
  { emoji: "✌️", label: "damai", keywords: ["damai", "peace", "dua jari", "victory"] },
];

export const REACTION_EMOJI_SET: ReadonlySet<string> = new Set(
  REACTION_EMOJIS.map((entry) => entry.emoji),
);

/**
 * The quick row on the card. Ordered by actual use: the four most reacted and
 * most typed emoji first, so the one-tap row matches what people reach for.
 */
export const QUICK_REACTION_EMOJIS: readonly string[] = ["🤤", "🥵", "💦", "💋", "🔥", "❤️"];

export function isReactionEmoji(value: string): boolean {
  return REACTION_EMOJI_SET.has(value);
}

const SEARCH_INDEX = REACTION_EMOJIS.map((entry) => ({
  entry,
  haystack: [entry.label, ...entry.keywords].join(" ").toLowerCase(),
}));

/** Token AND over label + keywords, so "tepuk tangan" and "clap" both work. */
export function searchReactions(query: string): readonly ReactionEmoji[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return REACTION_EMOJIS;

  return SEARCH_INDEX.filter(({ haystack }) => tokens.every((token) => haystack.includes(token))).map(
    ({ entry }) => entry,
  );
}
