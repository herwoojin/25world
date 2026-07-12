"use client";

// 글 음성 재생 — 남성/여성 아나운서 낭독 MP3
// 음성 파일은 로컬 TTS 서버가 Firestore(audio/audio_parts)에 생성해 둔다.
// 없으면 ttsQueue 에 생성 요청을 넣고 완료될 때까지 폴링한다.
import { useEffect, useRef, useState } from "react";
import { Volume2, Play, Pause, Loader2 } from "lucide-react";
import { doc, getDoc, getFirestore, setDoc } from "firebase/firestore";
import { BOT_SERVER_URL, getFirebaseApp } from "@/lib/firebase";

type Voice = "male" | "female";
type Status = "idle" | "loading" | "generating" | "ready" | "error";

const SPEEDS = [1, 1.5, 2] as const;

// 한 번에 하나의 글만 재생 (다른 글 재생 시 이전 오디오 정지)
let currentAudio: HTMLAudioElement | null = null;

/** Firestore 에서 MP3 청크를 모아 Blob URL 생성 */
async function loadAudioUrl(postId: string, voice: Voice): Promise<string | null> {
  const db = getFirestore(getFirebaseApp());
  const key = `${postId}_${voice}`;
  const meta = await getDoc(doc(db, "audio", key));
  if (!meta.exists()) return null;
  const parts = Number(meta.data().parts ?? 0);
  if (!parts) return null;

  const buffers: Uint8Array[] = [];
  for (let i = 0; i < parts; i++) {
    const snap = await getDoc(doc(db, "audio_parts", `${key}_${i}`));
    const data = snap.data()?.data;
    if (!data) return null;
    buffers.push(data.toUint8Array());
  }
  return URL.createObjectURL(new Blob(buffers as BlobPart[], { type: "audio/mpeg" }));
}

async function requestGeneration(postId: string, voice: Voice) {
  const db = getFirestore(getFirebaseApp());
  await setDoc(doc(db, "ttsQueue", `${postId}_${voice}`), {
    postId,
    voice,
    createdAt: new Date().toISOString(),
  });
  // 잠들어 있을 수 있는 생성 서버를 깨운다 (응답은 기다리지 않음)
  fetch(`${BOT_SERVER_URL}/api/wake`, { mode: "no-cors" }).catch(() => {});
}

function fmt(sec: number) {
  if (!Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function PostAudio({
  postId,
  title,
}: {
  postId: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [voice, setVoice] = useState<Voice>("female");
  const [status, setStatus] = useState<Status>("idle");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 정리
  useEffect(
    () => () => {
      if (pollRef.current) clearTimeout(pollRef.current);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );

  const attach = (url: string) => {
    if (audioRef.current) audioRef.current.pause();
    if (currentAudio && currentAudio !== audioRef.current) currentAudio.pause();

    const audio = new Audio(url);
    audio.preload = "auto";
    audio.playbackRate = speed;
    audio.onloadedmetadata = () => setDur(audio.duration);
    audio.ontimeupdate = () => setPos(audio.currentTime);
    audio.onended = () => setPlaying(false);
    audio.onplay = () => setPlaying(true);
    audio.onpause = () => setPlaying(false);
    audioRef.current = audio;
    currentAudio = audio;

    // 잠금화면/백그라운드 컨트롤 (모바일에서 화면을 벗어나도 재생 유지)
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist: voice === "male" ? "남성 아나운서" : "여성 아나운서",
        album: "25WORLD 블로그",
      });
      navigator.mediaSession.setActionHandler("play", () => audio.play());
      navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    }
    setStatus("ready");
  };

  /** 음성 로드 (없으면 생성 요청 후 폴링) */
  const prepare = async (v: Voice, autoPlay = false) => {
    setStatus("loading");
    setPos(0);
    setDur(0);
    try {
      let url = await loadAudioUrl(postId, v);
      if (!url) {
        setStatus("generating");
        await requestGeneration(postId, v);
        // 완료될 때까지 폴링 (긴 글은 수 분 소요)
        for (let i = 0; i < 120 && !url; i++) {
          await new Promise((r) => {
            pollRef.current = setTimeout(r, 5000);
          });
          url = await loadAudioUrl(postId, v);
        }
      }
      if (!url) {
        setStatus("error");
        return;
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      attach(url);
      if (autoPlay) audioRef.current?.play().catch(() => {});
    } catch {
      setStatus("error");
    }
  };

  const onToggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next && status === "idle") prepare(voice);
  };

  const switchVoice = (v: Voice) => {
    if (v === voice) return;
    setVoice(v);
    audioRef.current?.pause();
    prepare(v, true);
  };

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      if (currentAudio && currentAudio !== a) currentAudio.pause();
      currentAudio = a;
      a.play().catch(() => {});
    } else {
      a.pause();
    }
  };

  const changeSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed as 1) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const seek = (v: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = v;
    setPos(v);
  };

  return (
    <>
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        aria-label={`${title} 음성 재생`}
        className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          open
            ? "border-sky-400/60 text-sky-400"
            : "border-zinc-300 text-zinc-500 hover:border-sky-400/60 hover:text-sky-400 dark:border-zinc-700 dark:text-zinc-400"
        }`}
      >
        {status === "loading" || status === "generating" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Volume2 className="h-4 w-4" aria-hidden="true" />
        )}
        <span className="hidden sm:inline">음성</span>
      </button>

      {open && (
        <div className="mt-2 w-full basis-full rounded-lg border border-zinc-200 bg-background/80 p-3 dark:border-zinc-800">
          {status === "generating" && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              🎙️ 음성을 생성하고 있습니다… 글 길이에 따라 1~5분 걸릴 수 있어요.
              (완료되면 자동 재생 준비)
            </p>
          )}
          {status === "error" && (
            <p className="text-xs text-red-400">
              음성 생성에 실패했습니다. 잠시 후 다시 시도해주세요.
            </p>
          )}
          {status === "loading" && (
            <p className="text-xs text-zinc-500">음성을 불러오는 중…</p>
          )}

          {status === "ready" && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={playing ? "일시정지" : "재생"}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white transition-colors hover:bg-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {playing ? (
                  <Pause className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Play className="ml-0.5 h-4 w-4" aria-hidden="true" />
                )}
              </button>

              <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                {fmt(pos)} / {fmt(dur)}
              </span>

              <input
                type="range"
                min={0}
                max={dur || 0}
                step={1}
                value={pos}
                onChange={(e) => seek(Number(e.target.value))}
                aria-label="재생 위치"
                className="h-1.5 min-w-[140px] flex-1 cursor-pointer appearance-none rounded-full bg-zinc-300 accent-sky-500 dark:bg-zinc-700"
              />

              <button
                type="button"
                onClick={changeSpeed}
                aria-label="재생 속도 변경"
                className="shrink-0 rounded-full border border-zinc-300 px-2.5 py-1 text-xs font-bold text-zinc-600 hover:border-sky-400/60 hover:text-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-zinc-700 dark:text-zinc-300"
              >
                {speed.toFixed(1)}x
              </button>

              <div
                role="group"
                aria-label="음성 선택"
                className="flex shrink-0 overflow-hidden rounded-full border border-zinc-300 dark:border-zinc-700"
              >
                {(["female", "male"] as Voice[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => switchVoice(v)}
                    aria-pressed={voice === v}
                    className={`px-2.5 py-1 text-xs font-semibold transition-colors ${
                      voice === v
                        ? "bg-sky-500 text-white"
                        : "text-zinc-500 hover:text-sky-400 dark:text-zinc-400"
                    }`}
                  >
                    {v === "female" ? "여성" : "남성"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
