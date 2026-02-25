import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-gray-50">
      <div className="text-center space-y-6">
        <h1 className="text-8xl font-bold text-primary-500">404</h1>
        <div className="max-w-md space-y-3">
          <p className="text-2xl font-bold">Page not found</p>
          <p className="text-gray-400">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-3 text-sm font-bold text-white hover:bg-primary-500 transition-colors"
        >
          Back to Login
        </Link>
      </div>
    </div>
  );
}
