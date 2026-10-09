"use client";

// 관리자 — 자료실 드라이브 연결 + 유료회원 권한 동기화
// 원래 자료실 섹션 안에 있던 관리자 전용 설정을 관리자 페이지로 옮긴 것.
// (파일 하나하나에 대한 작업은 자료실 현장에 그대로 남아 있다)
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getAdminKey } from "@/lib/admin";
import { listUsers } from "@/lib/membership";
import { saveSiteConfig, useSiteConfig } from "@/lib/site-config";
import { revokeAllAccess, syncPaidEmails } from "@/lib/library";

export default function LibrarySettings() {
  const cfg = useSiteConfig();
  const url = cfg.libraryUrl?.trim() ?? "";
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const saveUrl = async () => {
    const v = draft.trim();
    if (v && !/^https:\/\/script\.google\.com\/.+\/exec$/.test(v)) {
      setError("Apps Script 웹앱의 /exec 로 끝나는 URL 을 넣어주세요.");
      return;
    }
    setError("");
    await saveSiteConfig({ ...cfg, libraryUrl: v });
    setDraft("");
    setDone("✅ 연결을 저장했습니다.");
  };

  // 유료회원 이메일을 웹앱에 밀어 넣는다 — 서버가 이 목록으로 다운로드를 판정한다
  const syncPaid = async () => {
    setBusy("유료회원 목록 동기화 중…");
    setError("");
    setDone("");
    try {
      const users = await listUsers();
      const paidUsers = users.filter((u) => u.group !== "general");
      const emails = paidUsers.filter((u) => u.email).map((u) => u.email);
      // 이메일이 없는 카카오 유료회원도 서버가 판정할 수 있도록 회원 ID 도 함께 보낸다
      const uids = paidUsers.map((u) => u.uid);
      const n = await syncPaidEmails(url, getAdminKey(), emails, uids);
      setDone(`✅ 유료회원 이상 ${n}명의 다운로드 권한을 동기화했습니다.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "동기화에 실패했습니다.");
    }
    setBusy("");
  };

  const revokeAll = async () => {
    if (!window.confirm("지금까지 부여된 파일 열람 권한을 모두 회수할까요?")) return;
    setBusy("권한 회수 중…");
    setError("");
    setDone("");
    try {
      const n = await revokeAllAccess(url, getAdminKey());
      setDone(`✅ ${n}건의 열람 권한을 회수했습니다.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "회수에 실패했습니다.");
    }
    setBusy("");
  };

  return (
    <section className="space-y-4 rounded-xl border border-amber-400/40 bg-amber-400/5 p-4">
      <h2 className="text-sm font-bold text-amber-500">자료실 드라이브 연결</h2>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {url ? (
          <>
            현재 연결됨: <span className="break-all">{url}</span>
          </>
        ) : (
          <>
            <code>scripts/library-webapp.gs</code> 를 Apps Script 에 배포한 뒤 받은
            /exec URL 을 넣어주세요.
          </>
        )}
      </p>

      <div className="flex flex-wrap gap-2">
        <input
          type="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://script.google.com/macros/s/…/exec"
          className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-zinc-700"
        />
        <Button onClick={saveUrl} disabled={!draft.trim()}>
          연결 저장
        </Button>
      </div>

      {url && (
        <div className="space-y-2 border-t border-amber-400/20 pt-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={syncPaid} disabled={Boolean(busy)}>
              유료회원 권한 동기화
            </Button>
            <Button variant="outline" onClick={revokeAll} disabled={Boolean(busy)}>
              열람 권한 전체 회수
            </Button>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            회원 등급을 바꾼 뒤에는 <b>동기화</b>를 눌러야 서버의 다운로드 허용
            목록에 반영됩니다. 등급이 내려간 사람의 기존 권한은 <b>전체 회수</b> 후
            다시 동기화하면 정리됩니다.
          </p>
        </div>
      )}

      {busy && <p className="text-xs text-zinc-500">{busy}</p>}
      {done && <p className="text-xs font-semibold text-emerald-500">{done}</p>}
      {error && <p className="text-xs font-semibold text-rose-500">{error}</p>}
    </section>
  );
}
