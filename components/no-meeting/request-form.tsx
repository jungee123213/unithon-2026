'use client';

import { useActionState, useState } from 'react';
import { submitRequest, type RequestState } from '@/app/p/[projectId]/no-meeting/actions';
import { solidBtn } from './atoms';

/**
 * 회의 신청서.
 *
 * 이 폼은 마찰이 아니라 게이트다 — 회의를 잡기 전에 여기를 지나가고,
 * 대부분은 회의가 열리지 않는다. 그래서 칸을 늘리지 않는다.
 * 유형·안건 분류·근거는 신청자가 아니라 시스템이 채운다.
 */
export function RequestForm({
  projectId, member, members,
}: { projectId: string; member: string; members: string[] }) {
  const [open, setOpen] = useState(false);
  const action = submitRequest.bind(null, projectId);
  const [state, formAction, pending] = useActionState<RequestState, FormData>(action, {});

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={solidBtn}>
        회의 신청서 쓰기
      </button>
    );
  }

  return (
    <form action={formAction} className="rounded-sm border border-[var(--rule)] bg-white p-5 shadow-[0_1px_3px_rgba(20,22,26,.06)] sm:p-7">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-[21px] font-bold">회의 신청서</h3>
        <button
          type="button" onClick={() => setOpen(false)}
          className="text-[14px] font-semibold text-[var(--placeholder)] hover:text-[var(--ink)]"
        >
          닫기
        </button>
      </div>
      <p className="mt-1.5 text-[14.5px] leading-relaxed text-[var(--ink-soft)]">
        내면 그 자리에서 판정합니다. 조건이 이미 충족돼 있으면 회의는 열리지 않습니다.
      </p>

      <label className="mt-6 block">
        <span className="stencil !text-[10px]">제목</span>
        <input
          name="title" required maxLength={120}
          className="mt-1.5 w-full border-b border-[var(--rule)] bg-transparent py-2 text-[17px] outline-none focus:border-[var(--accent)]"
          placeholder="5.2 릴리즈 관련"
        />
      </label>

      {/* 줄 단위로만 받는다. 종류(확인·질의·결정)는 분류기가 판정한다 —
          신청자가 고르면 분류기가 할 일이 없어지고, 되묻기도 죽는다. */}
      <label className="mt-5 block">
        <span className="stencil !text-[10px]">안건 · 한 줄에 하나씩</span>
        <textarea
          name="agenda" rows={5} maxLength={2000}
          className="mt-1.5 w-full resize-y border border-[var(--rule)] bg-transparent p-3 text-[16px] leading-relaxed outline-none focus:border-[var(--accent)]"
          placeholder={'QA 체크리스트가 다 끝났는지\n결제 P1 결함을 안고 나갈지\n롤백 기준을 어디로 둘지'}
        />
        <span className="mt-1.5 block text-[13.5px] text-[var(--placeholder)]">
          쓴 표현 그대로 씁니다. 확인·질의·결정 구분은 시스템이 합니다.
        </span>
      </label>

      {/* 유형 판정의 가장 강한 신호. 목적 문장보다 이게 낫다 —
          무엇을 만들려는지가 곧 회의 종류다. */}
      <label className="mt-5 block">
        <span className="stencil !text-[10px]">이 회의가 끝나면 무엇이 나와야 하나요</span>
        <input
          name="outcome" maxLength={200}
          className="mt-1.5 w-full border-b border-[var(--rule)] bg-transparent py-2 text-[16.5px] outline-none focus:border-[var(--accent)]"
          placeholder="출시 여부 결론"
        />
        <span className="mt-1.5 block text-[13.5px] text-[var(--placeholder)]">
          문서 · 결론 · 원인 · 일정 — 무엇이든 한 줄이면 됩니다.
        </span>
      </label>

      <fieldset className="mt-5">
        <legend className="stencil !text-[10px]">유형 표식 (해당하면)</legend>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
          {[
            ['', '없음'],
            ['1on1', '1:1'],
            ['brainstorming', '브레인스토밍'],
            ['crisis', '긴급 · 장애'],
          ].map(([value, label]) => (
            <label key={label} className="flex cursor-pointer items-center gap-2 text-[15.5px]">
              <input type="radio" name="marker" value={value} defaultChecked={value === ''}
                className="h-[16px] w-[16px] accent-[var(--ink)]" />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <span className="mt-2 block text-[13.5px] text-[var(--placeholder)]">
          표시하면 안건을 읽지 않습니다. 1:1 내용은 분류기에 보내지 않습니다.
        </span>
      </fieldset>

      {/* 이름을 타이핑하게 두지 않는다. 주입 기록이 쓰는 이름과 글자가 어긋나면
          "이미 전달됨" 조건이 사람은 맞다고 보는데 시스템은 대조에 실패한다. */}
      <fieldset className="mt-6">
        <legend className="stencil !text-[10px]">참석 후보</legend>
        {members.length === 0 ? (
          <p className="mt-2 text-[14.5px] text-[var(--placeholder)]">
            이 프로젝트에 다른 참여자가 없습니다. 신청자 본인만 후보가 됩니다.
          </p>
        ) : (
          <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2.5">
            {members.map((m) => (
              <label key={m} className="flex cursor-pointer items-center gap-2 text-[16px]">
                <input
                  type="checkbox" name="attendees" value={m}
                  defaultChecked={m === member}
                  className="h-[17px] w-[17px] accent-[var(--ink)]"
                />
                <span>{m}</span>
                {m === member && <span className="text-[13px] text-[var(--placeholder)]">(나)</span>}
              </label>
            ))}
          </div>
        )}
        <span className="mt-2.5 block text-[13.5px] text-[var(--placeholder)]">
          부를 사람을 다 고르세요. 시스템이 여기서 뺄 사람을 골라냅니다 — 이미 내용을
          주입받은 사람은 앉아 있을 이유가 없습니다.
        </span>
      </fieldset>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="stencil !text-[10px]">예정 시각</span>
          <input
            type="datetime-local" name="scheduled_at"
            className="tabular mt-1.5 w-full border-b border-[var(--rule)] bg-transparent py-2 text-[15.5px] outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="block">
          <span className="stencil !text-[10px]">예정 시간</span>
          <input
            type="number" name="minutes" defaultValue={30} min={5} max={480} step={5}
            className="tabular mt-1.5 w-full border-b border-[var(--rule)] bg-transparent py-2 text-[15.5px] outline-none focus:border-[var(--accent)]"
          />
        </label>
      </div>

      {state.error && (
        <p className="mt-5 border-l-2 border-[var(--stamp)] pl-3 text-[14.5px] text-[var(--stamp)]">
          {state.error}
        </p>
      )}

      <div className="mt-7 flex flex-wrap items-center gap-4 border-t border-[var(--rule)] pt-5">
        <button type="submit" disabled={pending} className={`${solidBtn} disabled:opacity-50`}>
          {pending ? '판정 중…' : '판정 요청'}
        </button>
        <span className="text-[13.5px] text-[var(--placeholder)]">
          신청자 · {member}
        </span>
      </div>
    </form>
  );
}
