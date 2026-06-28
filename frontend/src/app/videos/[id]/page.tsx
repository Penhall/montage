import VideoDetailClient from "./VideoDetailClient";

export const dynamicParams = true;

export function generateStaticParams() {
  return [{ id: "placeholder" }];
}

export default async function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <VideoDetailClient id={id} />;
}
