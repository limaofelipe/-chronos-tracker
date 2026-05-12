import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, formatTime } from './utils';
import { WorkEntry } from '../types';

export function generateInvoicePDF(entries: WorkEntry[], hourlyRate: number, employerName: string) {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(22);
  doc.text('Service Invoice', 14, 20);
  
  doc.setFontSize(12);
  doc.text(`Date: ${new Intl.DateTimeFormat('en-US').format(new Date())}`, 14, 30);
  doc.text(`Employer/Client: ${employerName || 'Not specified'}`, 14, 38);
  doc.text(`Hourly Rate: ${formatCurrency(hourlyRate)}/h`, 14, 46);

  // Table Data
  const tableData = entries.map((entry) => [
    new Intl.DateTimeFormat('en-US', { dateStyle: 'short' }).format(new Date(entry.date)),
    entry.task || 'No description',
    formatTime(entry.durationMs),
    formatCurrency(entry.earned),
  ]);

  const totalEarned = entries.reduce((acc, entry) => acc + entry.earned, 0);
  const totalDuration = entries.reduce((acc, entry) => acc + entry.durationMs, 0);

  // Add Table
  autoTable(doc, {
    startY: 55,
    head: [['Date', 'Activity', 'Time (H:M:S)', 'Amount']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [63, 63, 70] }, // Zinc 700
    foot: [['TOTAL', '', formatTime(totalDuration), formatCurrency(totalEarned)]],
    footStyles: { fillColor: [244, 244, 245], textColor: [0, 0, 0], fontStyle: 'bold' },
  });

  // Footer
  const finalY = (doc as any).lastAutoTable.finalY || 55;
  doc.setFontSize(10);
  doc.text('Thank you for your business!', 14, finalY + 15);

  // Save the PDF
  doc.save(`invoice_${new Date().getTime()}.pdf`);
}
