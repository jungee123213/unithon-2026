import { redirect } from 'next/navigation';

export default function Home() {
  redirect(`/p/${process.env.TEAMSYNC_PROJECT_ID || 'unithon'}`);
}
