/**
 * Single source of truth for the bot's /howto command. The in-app dialog was
 * removed when the info button became the leaderboard entry point.
 */
export type HowToTipKey =
  | "tap"
  | "hold"
  | "marker"
  | "rate"
  | "swipe"
  | "upload"
  | "anon"
  | "reward";

export type HowToTip = {
  key: HowToTipKey;
  title: string;
  body: string;
};

export const HOW_TO_TIPS: readonly HowToTip[] = [
  {
    key: "tap",
    title: "Tap foto/video",
    body: "menempelkan reaksi emoji di titik itu.",
  },
  {
    key: "hold",
    title: "Tahan foto/video",
    body: "menulis komentar di titik itu.",
  },
  {
    key: "marker",
    title: "Tap marker",
    body: "membuka reaksi dan komentar di titik itu. Tahan marker untuk langsung ke komentar.",
  },
  {
    key: "rate",
    title: "Geser slider kanan",
    body: "kasih rating 1 sampai 10.",
  },
  {
    key: "swipe",
    title: "Geser kartu",
    body: "pindah ke foto atau video berikutnya dan sebelumnya.",
  },
  {
    key: "upload",
    title: "Upload PAP",
    body: "lewat bot: /upload, kirim foto atau video (maks 1 menit, 20 MB), kirim caption, lalu tekan Upload.",
  },
  {
    key: "anon",
    title: "Komentar anonim",
    body: "ketik /anon di bot supaya komentar berikutnya tampil tanpa nama.",
  },
  {
    key: "reward",
    title: "Hadiah Top PAP",
    body: "PAP peringkat 1 tiap bulan dapat Stars. Klaim lewat /reward sebelum bulan berakhir.",
  },
];

export const HOW_TO_NOTE =
  "Satu reaksi dan satu komentar per konten. Memilih titik lain akan memindahkannya, dan komentarmu bisa dihapus kapan saja.";
