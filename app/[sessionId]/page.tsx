import { notFound } from 'next/navigation';
import { FileUploader } from '@/components/FileUploader';

const UUID_V4 =
  /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

export default async function SessionWorkspacePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  if (!UUID_V4.test(sessionId)) notFound();

  return (
    <div>
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Compare & Learn
        </h1>
        <p className="mt-3 text-gray-500 max-w-xl mx-auto">
          Upload two versions of the same document — an original and its
          translation or reviewed copy. AI will analyze how the text changed
          and store the patterns for future reference.
        </p>
      </div>
      <FileUploader sessionId={sessionId} />
    </div>
  );
}
