export interface User {
  id: number;
  email: string;
  role: 'admin' | 'student';
  verified_at: string | null;
  student_id: string | null;
  full_name: string | null;
  course: string | null;
  year_level: number | null;
  block: string | null;
}

export interface Post {
  id: number;
  user_id: number;
  type: 'lost' | 'found';
  item_name: string;
  category: string;
  description: string;
  location: string;
  occurred_at: string;
  status: string;
  created_at: string;
  full_name: string | null;
  course: string | null;
  year_level: number | null;
  block: string | null;
  image: string | null;
}

export interface Message {
  id: number;
  sender_id: number;
  body: string;
  created_at: string;
  deleted_at: string | null;
  full_name: string;
}

export interface Conversation {
  id: number;
  post_id: number | null;
  owner_id: number;
  other_id: number;
  created_at: string;
  item_name: string | null;
  type: string | null;
  owner_email: string;
  other_email: string;
  owner_name: string | null;
  other_name: string | null;
  last_body: string | null;
  last_at: string | null;
  unread: number;
}

export interface AuthEvent {
  id: number;
  user_id: number;
  email: string;
  role: string;
  action: 'login' | 'logout';
  created_at: string;
}

export interface Config {
  categories: string[];
  locations: string[];
  demo: boolean;
}

export interface Me {
  user: User | null;
  unread: number;
  config: Config;
}

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;

  constructor(message: string, status: number, data: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

interface Options {
  method?: string;
  body?: unknown;
  form?: FormData;
}

export async function api<T = unknown>(path: string, { method = 'GET', body, form }: Options = {}): Promise<T> {
  const opts: RequestInit = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (form) opts.body = form;
  else if (body !== undefined) {
    (opts.headers as Record<string, string>)['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch('/api' + path, opts);
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) throw new ApiError(String(data.error || 'Something went wrong. Try again.'), res.status, data);
  return data as T;
}
