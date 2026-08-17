import SpectatorView from "../../components/SpectatorView";

export default async function DraftSpectatorPage({ params }: { params: Promise<{ spectatorId: string }> }) {
  const { spectatorId } = await params;
  return <SpectatorView spectatorId={spectatorId} />;
}
