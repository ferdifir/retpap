/**
 * Curated reaction set, shared by the picker and the API.
 *
 * Emoji are stored as plain text, so these strings are canonical: changing a
 * code point (for example dropping U+FE0F from "❤️") would make the toggle-off
 * branch miss existing rows. Keep the literals exactly as they are.
 *
 * Nothing here is newer than Emoji 14 and there are no ZWJ sequences, so older
 * Android fonts render every glyph and no entry needs more than a few bytes.
 */

export type ReactionEmoji = {
  emoji: string;
  /** Short Indonesian name, also read by screen readers. */
  label: string;
  /** Lowercase search terms, Indonesian and English. */
  keywords: readonly string[];
};

export const REACTION_EMOJIS: readonly ReactionEmoji[] = [
  // Hype
  { emoji: "🔥", label: "api", keywords: ["api", "fire", "keren", "hot"] },
  { emoji: "⚡", label: "kilat", keywords: ["kilat", "listrik", "bolt", "energy"] },
  { emoji: "💥", label: "ledakan", keywords: ["ledakan", "boom", "explosion", "wow"] },
  { emoji: "✨", label: "kilau", keywords: ["kilau", "sparkle", "cantik", "shine"] },
  { emoji: "🎉", label: "pesta", keywords: ["pesta", "party", "selamat", "congrats"] },
  { emoji: "🥳", label: "selebrasi", keywords: ["selebrasi", "party", "celebrate", "hore"] },
  { emoji: "🏆", label: "trofi", keywords: ["trofi", "trophy", "juara", "menang"] },
  { emoji: "🥇", label: "medali emas", keywords: ["medali", "emas", "gold", "juara"] },
  { emoji: "🚀", label: "roket", keywords: ["roket", "rocket", "ngebut", "launch"] },
  { emoji: "💎", label: "berlian", keywords: ["berlian", "diamond", "premium", "mahal"] },
  { emoji: "👑", label: "mahkota", keywords: ["mahkota", "crown", "raja", "king"] },
  { emoji: "🎯", label: "tepat sasaran", keywords: ["target", "tepat", "akurat", "bullseye"] },

  // Love and approval
  { emoji: "❤️", label: "cinta", keywords: ["cinta", "love", "hati", "heart"] },
  { emoji: "💯", label: "seratus", keywords: ["seratus", "sempurna", "perfect", "hundred"] },
  { emoji: "👍", label: "jempol", keywords: ["jempol", "like", "setuju", "thumbs up"] },
  { emoji: "👎", label: "jempol turun", keywords: ["jempol turun", "dislike", "jelek", "thumbs down"] },
  { emoji: "👏", label: "tepuk tangan", keywords: ["tepuk", "tangan", "clap", "applause"] },
  { emoji: "🙌", label: "angkat tangan", keywords: ["angkat", "tangan", "hooray", "praise"] },
  { emoji: "🤝", label: "jabat tangan", keywords: ["jabat", "tangan", "deal", "handshake"] },
  { emoji: "🙏", label: "tolong", keywords: ["tolong", "doa", "pray", "makasih"] },
  { emoji: "💪", label: "kuat", keywords: ["kuat", "otot", "strong", "semangat"] },
  { emoji: "🫶", label: "hati di tangan", keywords: ["hati", "sayang", "love", "heart hands"] },

  // Faces
  { emoji: "😂", label: "tertawa", keywords: ["tertawa", "lucu", "laugh", "lol"] },
  { emoji: "🤣", label: "ngakak", keywords: ["ngakak", "lucu", "rofl", "laugh"] },
  { emoji: "😭", label: "menangis", keywords: ["menangis", "sedih", "cry", "sob"] },
  { emoji: "🥹", label: "menahan haru", keywords: ["haru", "sedih", "cry", "touched"] },
  { emoji: "😍", label: "suka", keywords: ["suka", "cinta", "love", "heart eyes"] },
  { emoji: "🥰", label: "sayang", keywords: ["sayang", "cinta", "love", "adore"] },
  { emoji: "😘", label: "cium", keywords: ["cium", "kiss", "sayang", "muah"] },
  { emoji: "😎", label: "keren", keywords: ["keren", "cool", "santai", "sunglasses"] },
  { emoji: "🤩", label: "terpukau", keywords: ["terpukau", "wow", "star struck", "kagum"] },
  { emoji: "🤯", label: "meledak pikiran", keywords: ["kaget", "mind blown", "shock", "wow"] },
  { emoji: "😱", label: "panik", keywords: ["panik", "kaget", "scream", "shock"] },
  { emoji: "🤔", label: "berpikir", keywords: ["pikir", "hmm", "think", "ragu"] },
  { emoji: "🤨", label: "curiga", keywords: ["curiga", "aneh", "suspicious", "really"] },
  { emoji: "😅", label: "gugup", keywords: ["gugup", "canggung", "sweat", "nervous"] },
  { emoji: "😬", label: "kikuk", keywords: ["kikuk", "canggung", "grimace", "awkward"] },
  { emoji: "🫣", label: "ngintip", keywords: ["ngintip", "malu", "peek", "shy"] },
  { emoji: "🤡", label: "badut", keywords: ["badut", "clown", "lucu", "tolol"] },
  { emoji: "👀", label: "mata", keywords: ["mata", "lihat", "eyes", "intip"] },
  { emoji: "💀", label: "tengkorak", keywords: ["tengkorak", "mati", "skull", "dead"] },
  { emoji: "🤖", label: "robot", keywords: ["robot", "bot", "ai", "mesin"] },
  { emoji: "👻", label: "hantu", keywords: ["hantu", "ghost", "seram", "boo"] },
  { emoji: "🗿", label: "moai", keywords: ["moai", "batu", "stone", "sigma"] },

  // Gestures
  { emoji: "✌️", label: "damai", keywords: ["damai", "peace", "dua jari", "victory"] },
  { emoji: "🤞", label: "semoga", keywords: ["semoga", "harap", "fingers crossed", "hope"] },
  { emoji: "🫡", label: "siap", keywords: ["siap", "salut", "salute", "yes sir"] },
  { emoji: "🤌", label: "gestur tangan", keywords: ["tangan", "pinch", "chef kiss", "mantap"] },
  { emoji: "👌", label: "oke", keywords: ["oke", "ok", "sip", "perfect"] },
  { emoji: "✍️", label: "menulis", keywords: ["tulis", "write", "catat", "tanda tangan"] },
  { emoji: "🙈", label: "tutup mata", keywords: ["malu", "tutup mata", "see no evil", "shy"] },
  { emoji: "🙊", label: "tutup mulut", keywords: ["diam", "tutup mulut", "speak no evil", "oops"] },
  { emoji: "💅", label: "kuku", keywords: ["kuku", "nails", "santai", "sassy"] },

  // Objects and vibes
  { emoji: "👓", label: "kacamata", keywords: ["kacamata", "glasses", "mata", "baca"] },
  { emoji: "🕶️", label: "kacamata hitam", keywords: ["kacamata hitam", "sunglasses", "keren", "cool"] },
  { emoji: "📸", label: "kamera", keywords: ["kamera", "camera", "foto", "jepret"] },
  { emoji: "🎬", label: "klaket", keywords: ["film", "video", "clapper", "movie"] },
  { emoji: "🍿", label: "popcorn", keywords: ["popcorn", "nonton", "movie", "snack"] },
  { emoji: "🎵", label: "musik", keywords: ["musik", "lagu", "music", "note"] },
  { emoji: "🎸", label: "gitar", keywords: ["gitar", "guitar", "musik", "band"] },
  { emoji: "🍕", label: "pizza", keywords: ["pizza", "makan", "food", "lapar"] },
  { emoji: "🍺", label: "bir", keywords: ["bir", "beer", "minum", "santai"] },
  { emoji: "☕", label: "kopi", keywords: ["kopi", "coffee", "pagi", "ngopi"] },
  { emoji: "🍌", label: "pisang", keywords: ["pisang", "banana", "buah", "lucu"] },
  { emoji: "🍓", label: "stroberi", keywords: ["stroberi", "strawberry", "buah", "manis"] },
  { emoji: "🍾", label: "sampanye", keywords: ["sampanye", "champagne", "selebrasi", "party"] },
  { emoji: "🎮", label: "game", keywords: ["game", "main", "gaming", "kontrol"] },
  { emoji: "⚽", label: "bola", keywords: ["bola", "football", "soccer", "olahraga"] },
  { emoji: "🏀", label: "basket", keywords: ["basket", "bola", "basketball", "olahraga"] },
  { emoji: "🌚", label: "bulan gelap", keywords: ["bulan", "moon", "gelap", "jahat"] },

  // Extras
  { emoji: "🧠", label: "otak", keywords: ["otak", "pintar", "brain", "smart"] },
  { emoji: "🐐", label: "kambing", keywords: ["kambing", "goat", "terbaik", "legenda"] },
  { emoji: "🐍", label: "ular", keywords: ["ular", "snake", "licik", "sly"] },
  { emoji: "🦍", label: "gorila", keywords: ["gorila", "gorilla", "kuat", "besar"] },
  { emoji: "💔", label: "patah hati", keywords: ["patah hati", "broken heart", "sedih", "kecewa"] },
  { emoji: "✅", label: "centang", keywords: ["centang", "check", "benar", "setuju"] },
  { emoji: "⚠️", label: "peringatan", keywords: ["peringatan", "warning", "awas", "hati-hati"] },
  { emoji: "💬", label: "komentar", keywords: ["komentar", "comment", "bicara", "chat"] },
];

export const REACTION_EMOJI_SET: ReadonlySet<string> = new Set(
  REACTION_EMOJIS.map((entry) => entry.emoji),
);

/**
 * The six original reactions, kept as the fallback quick row so the panel does
 * not look empty on a spot nobody has reacted to yet.
 */
export const QUICK_REACTION_EMOJIS: readonly string[] = ["🔥", "👓", "💯", "😂", "🎯", "❤️"];

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
