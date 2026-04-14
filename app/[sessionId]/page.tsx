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
          Comparar e aprender
        </h1>
        <p className="mt-3 text-gray-500 max-w-xl mx-auto">
          Envie duas versões do mesmo documento — o original e a tradução ou a
          cópia revisada. A IA analisa como o texto mudou e guarda os padrões
          para consulta futura.
        </p>
      </div>
      <FileUploader sessionId={sessionId} />
    </div>
  );
}
