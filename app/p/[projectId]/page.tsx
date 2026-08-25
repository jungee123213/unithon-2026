import { redirect } from 'next/navigation';

/**
 * 프로젝트 홈.
 *
 * 예전에는 영수증 화면이었으나 리디자인에서 메뉴에서 빠졌다. 죽은 화면을 남겨
 * 두면 크럼브가 아무 데도 아닌 곳을 가리키므로, 프로젝트에 들어오면 바로
 * 회의 판정으로 보낸다.
 */
export default async function ProjectHomePage({ params }: PageProps<'/p/[projectId]'>) {
  const { projectId } = await params;
  redirect(`/p/${projectId}/no-meeting`);
}
