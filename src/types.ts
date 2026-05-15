export interface WorkEntry {
  id: string;
  date: string;
  task: string;
  durationMs: number;
  earned: number;
  userId?: string;
  employer?: string;
}

export interface InvoiceHistory {
  id: string;
  generatedAt: string;
  periodStr: string;
  employer?: string;
  totalAmount: number;
  userId: string;
}
