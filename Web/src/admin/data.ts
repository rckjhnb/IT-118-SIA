import { useCallback, useEffect, useState } from 'react';
import { api, type AuthEvent, type Post } from '../lib/api';

export interface AdminUser {
  id: number;
  email: string;
  role: string;
  verified_at: string | null;
  created_at: string;
  student_id: string | null;
  full_name: string | null;
  course: string | null;
  year_level: number | null;
  block: string | null;
}

export interface AdminStats {
  posts: number;
  open_lost: number;
  open_found: number;
  resolved: number;
  users: number;
  pending: number;
  unread_messages: number;
}

export interface AdminData {
  newPosts: Post[];
  stats: AdminStats;
  recent: Post[];
  users: AdminUser[];
  events: AuthEvent[];
}

export function useAdminData() {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setError('');
    try {
      setData(await api<AdminData>('/admin'));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, reload, setData };
}
