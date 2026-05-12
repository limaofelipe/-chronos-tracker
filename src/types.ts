export interface WorkEntry {
  id: string;
  date: string;
  task: string;
  durationMs: number;
  earned: number;
  userId?: string;
}
