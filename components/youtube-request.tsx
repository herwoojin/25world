"use client";

// 유료회원 전용 — 유튜브 URL + 이메일을 입력하면 우리 서버(tg-post-saver)가
// 유튜브 자막을 Claude 로 블로그 HTML 로 변환해 그 이메일로 발송한다.
// @jini_youtube_bot(외부)은 건드리지 않는다. 일반회원에게는 잠금 안내만 보인다.
import { useEffect, useState } from "react";
import { Send, Youtube } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BOT_SERVER_URL } from "@/lib/firebase";
import { useMyProfile, useEffectiveGroup } from "@/lib/membership";

// 접수 팝업의 단계별 멘트 — 접수(회원 확인)는 수 초면 끝나고, 변환 결과는 메일로 도착한다
const STAGES = [
  { at: 0, emoji: "🚀", title: "서버를 깨우는 중이에요", sub: "기지개를 켜고 있어요… 조금만요!" },
  { at: 30, emoji: "📮", title: "변환을 접수하고 있어요", sub: "요청서를 예쁘게 접는 중이에요" },
  { at: 70, emoji: "🔍", title: "회원 확인 중이에요", sub: "이제 얼마 남지 않았어요!" },
];
const DONE_STAGE = {
  emoji: "📨",
  title: "접수 완료!",
  sub: "변환이 끝나면 메일로 보내드려요 — 탭을 닫아도 괜찮아요 ☕",
};

export default function YoutubeRequest() {
  const profile = useMyProfile();
  const group = useEffectiveGroup();
  const paid = group === "paid" || group === "vip" || group === "admin";

  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [progress, setProgress] = useState(0);

  // 로그인 이메일을 기본값으로
  useEffect(() => {
    if (profile?.email && !email) setEmail(profile.email);
  }, [profile?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  // 진행률 애니메이션 — 접수는 보통 수 초(서버 슬립 시 ~30초), 응답 전에는 95%에서 대기
  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    setProgress(0);
    const id = setInterval(() => {
      const sec = (Date.now() - t0) / 1000;
      setProgress((p) => (p >= 100 ? p : Math.min(95, 95 * (1 - Math.exp(-sec / 8)))));
    }, 200);
    return () => clearInterval(id);
  }, [busy]);

  if (!paid) {
    return (
      <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/5 p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold text-amber-500">
          <Youtube className="h-4 w-4" aria-hidden="true" />
          유튜브 → 블로그 이메일 변환{" "}
          <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-extrabold text-black">
            VIP
          </span>
        </p>
        <p className="mt-1.5 text-zinc-500 dark:text-zinc-400">
          유료회원 전용 기능입니다. 유튜브 URL을 넣으면 블로그 글(HTML)로 변환해
          가입 이메일로 보내드립니다.
        </p>
      </div>
    );
  }

  const submit = async () => {
    const u = url.trim();
    const e = email.trim();
    if (!/^https?:\/\/.+/.test(u) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
      setMsg({ ok: false, text: "유튜브 URL과 이메일을 정확히 입력해 주세요." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      // Render 무료 플랜이 잠들어 있을 수 있어 먼저 깨운다
      await fetch(`${BOT_SERVER_URL}/api/wake`).catch(() => {});
      const r = await fetch(`${BOT_SERVER_URL}/api/yt-to-blog`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeUrl: u, email: e }),
      });
      const data = await r.json().catch(() => ({ ok: false, message: "응답을 읽지 못했어요." }));
      if (data.ok) {
        // 100% + 📨 접수 완료를 잠깐 보여준 뒤 팝업을 닫는다
        setProgress(100);
        await new Promise((res) => setTimeout(res, 2500));
      }
      setMsg({ ok: !!data.ok, text: data.message || (data.ok ? "완료" : "실패") });
      if (data.ok) setUrl("");
    } catch {
      setMsg({ ok: false, text: "요청에 실패했어요. 잠시 후 다시 시도해 주세요." });
    } finally {
      setBusy(false);
    }
  };

  const stage =
    progress >= 100 ? DONE_STAGE : [...STAGES].reverse().find((s) => progress >= s.at) ?? STAGES[0];

  const inputCls =
    "w-full rounded-md border border-zinc-300 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-zinc-700";

  return (
    <div className="mt-4 rounded-xl border border-violet-400/40 bg-violet-400/5 p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-violet-500">
        <Youtube className="h-4 w-4" aria-hidden="true" />
        유튜브 → 블로그 이메일 변환 (유료회원)
      </p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        유튜브 URL을 넣으면 자막을 블로그 글(HTML)로 변환해 아래 이메일로 보내드립니다.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          type="url"
          value={url}
          onChange={(ev) => setUrl(ev.target.value)}
          placeholder="https://youtu.be/..."
          className={inputCls}
          disabled={busy}
        />
        <input
          type="email"
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          placeholder="받을 이메일"
          className={inputCls}
          disabled={busy}
        />
        <Button onClick={submit} disabled={busy} className="gap-1.5">
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
          {busy ? "변환 중…" : "변환 발송"}
        </Button>
      </div>

      {msg && (
        <p
          role="status"
          className={`mt-2 text-xs ${msg.ok ? "text-emerald-500" : "text-red-500"}`}
        >
          {msg.text}
        </p>
      )}

      {/* 변환 진행 팝업 — 단계별 귀여운 멘트 + 진행률 */}
      {busy && (
        <div
          role="dialog"
          aria-label="변환 진행 상황"
          aria-live="polite"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm rounded-2xl border border-violet-400/30 bg-white p-6 text-center shadow-2xl dark:bg-zinc-900">
            <div className={`text-5xl ${progress >= 100 ? "animate-none" : "animate-bounce"}`}>
              {stage.emoji}
            </div>
            <p className="mt-3 text-base font-bold text-zinc-900 dark:text-zinc-50">
              {stage.title}
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{stage.sub}</p>
            <div className="mt-5 h-2.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs font-bold text-violet-500">{Math.round(progress)}%</p>
            <p className="mt-4 text-[11px] text-zinc-400 dark:text-zinc-500">
              변환은 보통 1~5분 — 완료되면 메일함으로 찾아가요 💌
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
