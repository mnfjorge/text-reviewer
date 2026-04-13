import { FileUploader } from '@/components/FileUploader';

export default function HomePage() {
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
      <FileUploader />
    </div>
  );
}
