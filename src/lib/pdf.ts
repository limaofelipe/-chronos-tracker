import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, formatTime } from './utils';
import { WorkEntry } from '../types';

export function generateInvoicePDF(entries: WorkEntry[], hourlyRate: number, employerName: string) {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(22);
  doc.text('Service Invoice', 14, 20);
  
  const entryDates = entries.map(e => new Date(e.date).getTime()).filter(t => !isNaN(t));
  let periodStr = 'N/A';
  if (entryDates.length > 0) {
    const minDateTs = Math.min(...entryDates);
    const minD = new Date(minDateTs);
    // get Sunday before or equal to minDate
    const sundayStart = new Date(minD);
    sundayStart.setDate(sundayStart.getDate() - sundayStart.getDay());
    // next Sunday
    const sundayEnd = new Date(sundayStart);
    sundayEnd.setDate(sundayEnd.getDate() + 7);
    
    periodStr = `${new Intl.DateTimeFormat('en-US').format(sundayStart)} - ${new Intl.DateTimeFormat('en-US').format(sundayEnd)}`;
  }
  const generatedDateStr = new Intl.DateTimeFormat('en-US').format(new Date());

  doc.setFontSize(12);
  doc.text(`Generated on: ${generatedDateStr}`, 14, 30);
  doc.text(`Period: ${periodStr}`, 14, 38);
  doc.text(`Employer/Client: ${employerName || 'Not specified'}`, 14, 46);
  doc.text(`Hourly Rate: ${formatCurrency(hourlyRate)}/h`, 14, 54);

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
    startY: 65,
    head: [['Date', 'Activity', 'Time (H:M:S)', 'Amount']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [63, 63, 70] }, // Zinc 700
    foot: [['TOTAL', '', formatTime(totalDuration), formatCurrency(totalEarned)]],
    footStyles: { fillColor: [244, 244, 245], textColor: [0, 0, 0], fontStyle: 'bold' },
  });

  // Footer
  const finalY = (doc as any).lastAutoTable.finalY || 65;
  doc.setFontSize(10);
  doc.text('Thank you for your business!', 14, finalY + 15);

  // Save the PDF
  doc.save(`invoice_${new Date().getTime()}.pdf`);
}
