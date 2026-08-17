import CoManagerView from "../../../components/CoManagerView";

export default async function CoManagerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CoManagerView token={token} />;
}
