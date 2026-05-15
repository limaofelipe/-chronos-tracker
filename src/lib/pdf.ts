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
  let currentY = finalY + 15;
  doc.text('Thank you for your business!', 14, currentY);
  
  if (currentY + 80 > doc.internal.pageSize.getHeight()) {
    doc.addPage();
    currentY = 20;
  } else {
    currentY += 15;
  }
  
  // Payment Instructions
  doc.setFontSize(11);
  doc.text('Payment Instructions:', 14, currentY);
  
  doc.setFontSize(9);
  doc.text('ACH Transfer or Wise (Deposit in USD or BRL)', 14, currentY + 6);
  doc.text('Wise Name Tag: @antoniofelipet', 14, currentY + 11);
  
  doc.text('These are the USD account details for Antonio Felipe Torres Lima at Wise.', 14, currentY + 21);
  doc.text('- If you are sending from a bank in the United States, you can use these details to make a domestic transfer.', 14, currentY + 26);
  doc.text('- If you are sending from somewhere else, make an international Swift transfer.', 14, currentY + 31);
  
  doc.text('Name: Antonio Felipe Torres Lima', 14, currentY + 41);
  doc.text('Account Type: Deposit (Use when sending money from the United States)', 14, currentY + 46);
  doc.text('Routing number (for wire and ACH transfers): 084009519', 14, currentY + 51);
  doc.text('Account Number: 336689223409946', 14, currentY + 56);
  doc.text('Address: Wise US Inc, 108 W 13th St, Wilmington, DE, 19801, United States', 14, currentY + 61);

  // Save the PDF
  doc.save(`invoice_${new Date().getTime()}.pdf`);
}
