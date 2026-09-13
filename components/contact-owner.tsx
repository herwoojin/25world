"use client";

// 주인장에게 메시지 보내기 — 푸터 바로 위.
// 메시지는 tg-post-saver 서버(/api/contact)가 받아 텔레그램(@jini_message_replybot)으로 전달한다.
// 봇 토큰은 서버 환경변수에만 있다 — 정적 사이트인 이 코드에 두면 누구나 꺼내 쓸 수 있다.
import { useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { BOT_SERVER_URL, getFirebaseAuth } from "@/lib/firebase";

const MAX_LEN = 1000;

type Status = "idle" | "sending" | "sent" | "error";

export default function ContactOwner() {
  const [name, setName] = useState("");
  const [reply, setReply] = useState(""); // 답장 받을 연락처 (선택)
  const [message, setMessage] = useState("");
  const [trap, setTrap] = useState(""); // 허니팟 — 사람에게는 보이지 않는 칸
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  // 게이트 안쪽에서만 렌더되므로 로그인 사용자가 있다
  const user = typeof window !== "undefined" ? getFirebaseAuth().currentUser : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = message.trim();
    if (!text || status === "sending") return;

    setStatus("sending");
    setError("");
    try {
      const idToken = await user?.getIdToken().catch(() => undefined);
      // 무료 서버는 잠들어 있을 수 있다 — 먼저 깨운다 (길면 수십 초)
      await fetch(`${BOT_SERVER_URL}/api/wake`).catch(() => {});
      const res = await fetch(`${BOT_SERVER_URL}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || user?.displayName || "",
          reply: reply.trim(),
          message: text,
          website: trap,
          page: window.location.pathname + window.location.hash,
          idToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.message || "메시지를 보내지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
      setStatus("sent");
      setMessage("");
    } catch (err) {
      setError(
        err instanceof Error && err.message !== "Failed to fetch"
          ? err.message
          : "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."
      );
      setStatus("error");
    }
  };

  return (
    <section id="contact" aria-labelledby="contact-title" className="mx-auto max-w-3xl px-4 py-16">
      <div className="rounded-2xl border border-zinc-200 bg-background/60 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800 sm:p-8">
        <h2 id="contact-title" className="flex items-center gap-2 text-xl font-bold">
          <MessageCircle className="h-5 w-5 text-sky-500" aria-hidden="true" />
          주인장에게 메시지 보내기
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          궁금한 점, 제안, 응원 한마디 — 주인장 텔레그램으로 바로 전달돼요.
        </p>

        {status === "sent" ? (
          <div role="status" className="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5 text-center">
            <p className="text-lg font-bold">✅ 전달했어요!</p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              주인장이 확인하면 답장 드릴게요. 소중한 메시지 고마워요.
            </p>
            <button
              type="button"
              onClick={() => setStatus("idle")}
              className="mt-4 min-h-[44px] rounded-full border border-zinc-300 px-4 text-sm font-semibold hover:border-zinc-400 dark:border-zinc-700"
            >
              메시지 하나 더 보내기
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-semibold">
                이름 <span className="font-normal text-zinc-500">(선택)</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                  placeholder={user?.displayName || "닉네임"}
                  autoComplete="name"
                  className="min-h-[44px] rounded-lg border border-zinc-300 bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-zinc-700"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold">
                답장 받을 연락처 <span className="font-normal text-zinc-500">(선택)</span>
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  maxLength={100}
                  placeholder="이메일 또는 텔레그램 @아이디"
                  className="min-h-[44px] rounded-lg border border-zinc-300 bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-zinc-700"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1 text-sm font-semibold">
              메시지
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_LEN))}
                required
                rows={5}
                placeholder="주인장에게 하고 싶은 말을 적어 주세요."
                className="resize-y rounded-lg border border-zinc-300 bg-background px-3 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-zinc-700"
              />
              <span className="self-end text-xs font-normal text-zinc-500">
                {message.length} / {MAX_LEN}
              </span>
            </label>

            {/* 허니팟 — 화면·스크린리더·탭 이동에서 모두 숨긴다. 채워져 오면 서버가 버린다 */}
            <input
              value={trap}
              onChange={(e) => setTrap(e.target.value)}
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
            />

            {error && (
              <p role="alert" className="text-sm text-red-500">
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {user?.email
                  ? `로그인 계정(${user.email})이 함께 전달돼요.`
                  : "보낸 메시지는 주인장만 볼 수 있어요."}
              </p>
              <button
                type="submit"
                disabled={!message.trim() || status === "sending"}
                className="flex min-h-[44px] items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                {status === "sending" ? "보내는 중… (서버를 깨우는 중일 수 있어요)" : "메시지 보내기"}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
