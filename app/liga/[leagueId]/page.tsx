import LeagueAdminView from "../../components/LeagueAdminView";

export default async function LigaPage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  return <LeagueAdminView leagueId={leagueId} />;
}
