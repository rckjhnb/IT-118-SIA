import { Link } from 'react-router-dom';
import { Button } from '../components/ui';

export function NotFound() {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-line bg-paper p-10 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-muted">That page does not exist.</p>
      <Link to="/" className="mt-5 inline-block">
        <Button>Back to browse</Button>
      </Link>
    </div>
  );
}
