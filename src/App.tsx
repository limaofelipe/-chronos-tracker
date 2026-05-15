import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, FileText, Plus, Trash2, Clock, CheckCircle, Download, LogIn, LogOut } from 'lucide-react';
import { formatTime, formatCurrency, cn } from './lib/utils';
import { generateInvoicePDF } from './lib/pdf';
import { WorkEntry, InvoiceHistory } from './types';
import { auth, db, loginWithGoogle, logout, handleFirestoreError, OperationType } from './lib/firebase';
import { collection, doc, setDoc, onSnapshot, query, where, orderBy, deleteDoc, writeBatch, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { DatePicker } from './components/DatePicker';

export default function App() {
  // Auth State
  const [user, setUser] = useState<User | null>(null);

  // Config States
  const [hourlyRate, setHourlyRate] = useState<number>(() => {
    const saved = localStorage.getItem('hourlyRate');
    return saved ? parseFloat(saved) : 50;
  });
  const [employerName, setEmployerName] = useState<string>(() => {
    return localStorage.getItem('employerName') || '';
  });

  // Timer States
  const [task, setTask] = useState(() => localStorage.getItem('activeTask') || '');
  const [isRunning, setIsRunning] = useState(() => localStorage.getItem('isRunning') === 'true');
  const [accumulatedMs, setAccumulatedMs] = useState(() => parseInt(localStorage.getItem('accumulatedMs') || '0'));
  const [sessionStart, setSessionStart] = useState<number | null>(() => {
    const s = localStorage.getItem('sessionStart');
    return s && s !== 'null' ? parseInt(s) : null;
  });
  const [currentMs, setCurrentMs] = useState(accumulatedMs);

  // Entries State
  const [entries, setEntries] = useState<WorkEntry[]>([]);
  const [invoices, setInvoices] = useState<InvoiceHistory[]>([]);

  // Tab State
  const [activeTab, setActiveTab] = useState<'entries' | 'invoices'>('entries');

  // Manual Entry State
  const [showManual, setShowManual] = useState(false);
  const [manualTask, setManualTask] = useState('');
  const [manualHours, setManualHours] = useState('');
  const [manualMinutes, setManualMinutes] = useState('');
  const [manualSeconds, setManualSeconds] = useState('');
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [manualEmployer, setManualEmployer] = useState('');
  const [manualRate, setManualRate] = useState('');

  // Filter States
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterEmployer, setFilterEmployer] = useState('');
  
  // Invoice Filter States
  const [filterInvoiceStartDate, setFilterInvoiceStartDate] = useState('');
  const [filterInvoiceEndDate, setFilterInvoiceEndDate] = useState('');
  const [filterInvoiceEmployer, setFilterInvoiceEmployer] = useState('');

  // Persist configurations and active timer
  useEffect(() => {
    localStorage.setItem('hourlyRate', hourlyRate.toString());
  }, [hourlyRate]);

  useEffect(() => {
    localStorage.setItem('employerName', employerName);
  }, [employerName]);

  useEffect(() => {
    localStorage.setItem('activeTask', task);
    localStorage.setItem('isRunning', isRunning.toString());
    localStorage.setItem('accumulatedMs', accumulatedMs.toString());
    localStorage.setItem('sessionStart', sessionStart !== null ? sessionStart.toString() : 'null');
  }, [task, isRunning, accumulatedMs, sessionStart]);

  // Auth & Sync Effect
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Hydrate config if available
        try {
          const profileSnap = await getDoc(doc(db, `users/${currentUser.uid}`));
          if (profileSnap.exists()) {
            const data = profileSnap.data();
            if (data.hourlyRate) setHourlyRate(data.hourlyRate);
            if (data.employerName) setEmployerName(data.employerName);
          } else {
            // Setup profile
            await setDoc(doc(db, `users/${currentUser.uid}`), {
              hourlyRate,
              employerName
            });
          }
        } catch (error) {
          console.error(error);
        }

        // Listen for entries
        const q = query(
          collection(db, `users/${currentUser.uid}/entries`),
          where('userId', '==', currentUser.uid)
        );
        const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
          const newEntries: WorkEntry[] = [];
          snapshot.forEach((docSnap) => {
            newEntries.push({ id: docSnap.id, ...docSnap.data() } as WorkEntry);
          });
          // Sort client-side to avoid needing a Firestore composite index
          newEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setEntries(newEntries);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `users/${currentUser.uid}/entries`);
        });

        // Listen for invoices
        const qInvoices = query(
          collection(db, `users/${currentUser.uid}/invoices`),
          where('userId', '==', currentUser.uid)
        );
        const unsubscribeInvoices = onSnapshot(qInvoices, (snapshot) => {
          const loadedInvoices: InvoiceHistory[] = [];
          snapshot.forEach((docSnap) => {
            loadedInvoices.push({ id: docSnap.id, ...docSnap.data() } as InvoiceHistory);
          });
          loadedInvoices.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
          setInvoices(loadedInvoices);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `users/${currentUser.uid}/invoices`);
        });
        
        return () => {
          unsubscribeSnapshot();
          unsubscribeInvoices();
        };
      } else {
        setEntries([]);
        setInvoices([]);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Sync profile when local changes
  useEffect(() => {
    if (user) {
      setDoc(doc(db, `users/${user.uid}`), { hourlyRate, employerName }, { merge: true }).catch(console.error);
    }
  }, [hourlyRate, employerName, user]);

  // Timer interval
  useEffect(() => {
    let interval: number | undefined;
    if (isRunning && sessionStart !== null) {
      interval = window.setInterval(() => {
        setCurrentMs(accumulatedMs + (Date.now() - sessionStart));
      }, 100); // 100ms for smooth UI feel
    } else {
      setCurrentMs(accumulatedMs);
    }
    return () => clearInterval(interval);
  }, [isRunning, sessionStart, accumulatedMs]);

  // Timer Actions
  const handleStart = () => {
    if (!isRunning) {
      setIsRunning(true);
      setSessionStart(Date.now());
    }
  };

  const handlePause = () => {
    if (isRunning && sessionStart !== null) {
      setIsRunning(false);
      setAccumulatedMs(prev => prev + (Date.now() - sessionStart));
      setSessionStart(null);
    }
  };

  const handleStop = async () => {
    const finalMs = isRunning && sessionStart !== null 
      ? accumulatedMs + (Date.now() - sessionStart) 
      : accumulatedMs;

    if (finalMs > 0 && user) {
      const earned = (finalMs / (1000 * 60 * 60)) * hourlyRate;
      const newEntryRef = doc(collection(db, `users/${user.uid}/entries`));
      const newEntry: WorkEntry = {
        id: newEntryRef.id,
        date: new Date().toISOString(),
        task: task.trim() || 'No description',
        durationMs: finalMs,
        earned,
        userId: user.uid,
        employer: employerName.trim()
      };
      
      try {
        await setDoc(newEntryRef, newEntry);
        // Reset timer only after successful save
        setIsRunning(false);
        setSessionStart(null);
        setAccumulatedMs(0);
        setCurrentMs(0);
        setTask('');
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/entries/${newEntry.id}`);
      }
    } else if (finalMs > 0 && !user) {
      alert("Please login to save your tracked time!");
      setIsRunning(false);
      setSessionStart(null);
      setAccumulatedMs(finalMs);
      return;
    } else {
      // If finalMs === 0
      setIsRunning(false);
      setSessionStart(null);
      setAccumulatedMs(0);
      setCurrentMs(0);
      setTask('');
    }
  };

  const addManualEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert("Please login to add entries!");
      return;
    }
    
    const h = parseInt(manualHours) || 0;
    const m = parseInt(manualMinutes) || 0;
    const s = parseInt(manualSeconds) || 0;
    const totalMs = (h * 60 * 60 * 1000) + (m * 60 * 1000) + (s * 1000);
    
    if (totalMs > 0) {
      const rateToUse = manualRate ? parseFloat(manualRate) : hourlyRate;
      const earned = (totalMs / (1000 * 60 * 60)) * rateToUse;
      const newEntryRef = doc(collection(db, `users/${user.uid}/entries`));
      const newEntry: WorkEntry = {
        id: newEntryRef.id,
        date: new Date(manualDate).toISOString(),
        task: manualTask.trim() || 'No description',
        durationMs: totalMs,
        earned,
        userId: user.uid,
        employer: manualEmployer.trim() || employerName.trim()
      };
      
      try {
        await setDoc(newEntryRef, newEntry);
        setManualTask('');
        setManualHours('');
        setManualMinutes('');
        setManualSeconds('');
        setManualEmployer('');
        setManualRate('');
        setShowManual(false);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/entries/${newEntry.id}`);
      }
    }
  };

  const removeEntry = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/entries`, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/entries/${id}`);
    }
  };

  const removeInvoice = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/invoices`, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/invoices/${id}`);
    }
  };

  const clearAllEntries = async () => {
    if (!user) return;
    if (confirm('Are you sure you want to delete all history?')) {
      try {
        const batch = writeBatch(db);
        entries.forEach(e => {
          batch.delete(doc(db, `users/${user.uid}/entries`, e.id));
        });
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/entries`);
      }
    }
  };

  const filteredEntries = entries.filter(entry => {
    let matches = true;
    if (filterStartDate && entry.date < filterStartDate) matches = false;
    // Add one day to filterEndDate so it includes the full end date
    if (filterEndDate) {
      const end = new Date(filterEndDate);
      end.setDate(end.getDate() + 1);
      if (entry.date >= end.toISOString()) matches = false;
    }
    if (filterEmployer && (entry.employer || '').trim() !== filterEmployer) matches = false;
    return matches;
  });

  const uniqueEmployers = Array.from(new Set(entries.map(e => (e.employer || '').trim()).filter(Boolean)));

  const filteredInvoices = invoices.filter(invoice => {
    let matches = true;
    if (filterInvoiceStartDate && invoice.generatedAt < filterInvoiceStartDate) matches = false;
    // Add one day to filterInvoiceEndDate so it includes the full end date
    if (filterInvoiceEndDate) {
      const end = new Date(filterInvoiceEndDate);
      end.setDate(end.getDate() + 1);
      if (invoice.generatedAt >= end.toISOString()) matches = false;
    }
    if (filterInvoiceEmployer && (invoice.employer || '').trim() !== filterInvoiceEmployer) matches = false;
    return matches;
  });

  const uniqueInvoiceEmployers = Array.from(new Set(invoices.map(e => (e.employer || '').trim()).filter(Boolean)));

  const handleGeneratePDF = async () => {
    if (filteredEntries.length === 0) {
      alert('No entries to generate an invoice.');
      return;
    }
    // Calculate periodStr to store
    const entryDates = filteredEntries.map(e => new Date(e.date).getTime()).filter(t => !isNaN(t));
    let periodStr = 'N/A';
    if (entryDates.length > 0) {
      const minDateTs = Math.min(...entryDates);
      const minD = new Date(minDateTs);
      const sundayStart = new Date(minD);
      sundayStart.setDate(sundayStart.getDate() - sundayStart.getDay());
      const sundayEnd = new Date(sundayStart);
      sundayEnd.setDate(sundayEnd.getDate() + 7);
      periodStr = `${new Intl.DateTimeFormat('en-US').format(sundayStart)} - ${new Intl.DateTimeFormat('en-US').format(sundayEnd)}`;
    }

    const totalAmount = filteredEntries.reduce((sum, entry) => sum + entry.earned, 0);

    // Save metadata to DB if user is logged in
    if (user) {
      const invoiceRef = doc(collection(db, `users/${user.uid}/invoices`));
      const invoiceData: InvoiceHistory = {
        id: invoiceRef.id,
        generatedAt: new Date().toISOString(),
        periodStr,
        employer: filterEmployer || employerName,
        totalAmount,
        userId: user.uid
      };
      
      try {
        await setDoc(invoiceRef, invoiceData);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/invoices`);
      }
    }

    // PDF generated using the filtered list and using the filterEmployer if applicable
    generateInvoicePDF(filteredEntries, hourlyRate, filterEmployer || employerName);
  };

  const handleExportCSV = () => {
    if (filteredEntries.length === 0) {
      alert('No entries to export.');
      return;
    }
    
    const headers = ['Date', 'Employer', 'Activity', 'Duration (H:M:S)', 'Amount ($)'];
    const csvData = filteredEntries.map(e => [
      new Intl.DateTimeFormat('en-US').format(new Date(e.date)),
      `"${(e.employer || '').replace(/"/g, '""')}"`,
      `"${e.task.replace(/"/g, '""')}"`,
      formatTime(e.durationMs),
      e.earned.toFixed(2)
    ].join(','));
    
    const csvContent = [headers.join(','), ...csvData].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `timesheet_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const activeEarned = (currentMs / (1000 * 60 * 60)) * hourlyRate;
  const totalHistoricallyEarned = filteredEntries.reduce((acc, e) => acc + e.earned, 0);
  const totalHistoricallyMs = filteredEntries.reduce((acc, e) => acc + e.durationMs, 0);

  return (
    <div className="min-h-[100dvh] w-full bg-slate-50 flex flex-col font-sans text-slate-900">
      <nav className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 shrink-0 sticky top-0 z-10 w-full">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 flex items-center justify-center rounded-sm">
            <div className="w-4 h-4 border-2 border-white"></div>
          </div>
          <span className="font-bold text-xl tracking-tight text-slate-800">CHRONOS<span className="text-indigo-600">FLOW</span></span>
        </div>
        <div className="hidden sm:flex items-center gap-6 text-sm font-medium text-slate-500">
          <span className="text-indigo-600 border-b-2 border-indigo-600 py-5">Dashboard</span>
          
          {user ? (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Avatar" className="w-6 h-6 rounded-full" />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-slate-200 border border-slate-300"></div>
                )}
                <span className="text-slate-800 text-xs font-semibold">{user.displayName}</span>
              </div>
              <button onClick={logout} className="text-slate-400 hover:text-slate-600">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button onClick={loginWithGoogle} className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-md transition-colors">
              <LogIn className="w-4 h-4" /> Sign In
            </button>
          )}
        </div>
      </nav>

      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-8 flex flex-col lg:flex-row gap-8">
        
        {/* Left Column: Active Tracking */}
        <div className="w-full lg:w-[380px] flex flex-col gap-6">
          <div className="bg-white border border-slate-200 p-6 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-6">Active Session</h2>
            
            {/* Timer Display */}
            <div className="bg-slate-900 rounded-sm p-8 mb-6 flex flex-col items-center">
              <div className="text-5xl font-mono font-bold text-white tracking-tighter tabular-nums">
                {formatTime(currentMs)}
              </div>
              <div className="text-[10px] text-slate-400 mt-2 font-medium uppercase tracking-widest">
                {formatCurrency(activeEarned)}
              </div>
            </div>

            {/* Task Input & Settings */}
            <div className="space-y-4 mb-8">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500 mb-1 block">Task Description</label>
                <textarea
                  className="w-full bg-slate-50 border border-slate-200 p-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 h-24 resize-none"
                  placeholder="What are you working on right now?"
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  disabled={isRunning}
                ></textarea>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500 mb-1 block">Hourly Rate ($)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 pl-10 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500 mb-1 block">Employer / Client</label>
                <input
                  type="text"
                  placeholder="Client name for invoice"
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  value={employerName}
                  onChange={(e) => setEmployerName(e.target.value)}
                />
              </div>
            </div>

            {/* Controls */}
            <div className="grid grid-cols-2 gap-3">
              {!isRunning ? (
                <button
                  onClick={handleStart}
                  className="col-span-2 bg-indigo-600 text-white font-bold py-4 text-xs uppercase tracking-widest hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" /> Resume / Start
                </button>
              ) : (
                <>
                  <button
                    onClick={handlePause}
                    className="bg-amber-500 text-white font-bold py-3 text-xs uppercase tracking-widest hover:bg-amber-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <Pause className="w-4 h-4 fill-current" /> Pause
                  </button>
                  <button
                    onClick={handleStop}
                    disabled={currentMs === 0}
                    className="bg-red-600 text-white font-bold py-3 text-xs uppercase tracking-widest hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Square className="w-4 h-4 fill-current" /> Stop
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Summary Stats */}
          <div className="bg-indigo-900 text-white p-6 shadow-sm">
            <div className="flex justify-between items-end">
              <div>
                <p className="text-[10px] font-bold uppercase opacity-60 mb-1">Total Billable</p>
                <h3 className="text-2xl font-bold">{formatCurrency(totalHistoricallyEarned)}</h3>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase opacity-60 mb-1">Hours</p>
                <h3 className="text-2xl font-bold">{formatTime(totalHistoricallyMs)}</h3>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Session History & Invoice Generation */}
        <div className="flex-1 flex flex-col gap-6">
          <div className="bg-white border border-slate-200 flex-1 flex flex-col shadow-sm min-h-[600px]">
            <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
              <div className="flex gap-4">
                <button 
                  onClick={() => setActiveTab('entries')}
                  className={cn(
                    "text-xs font-bold uppercase tracking-widest pb-1 transition-colors",
                    activeTab === 'entries' ? "text-indigo-600 border-b-2 border-indigo-600" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  Entry History
                </button>
                <button 
                  onClick={() => setActiveTab('invoices')}
                  className={cn(
                    "text-xs font-bold uppercase tracking-widest pb-1 transition-colors",
                    activeTab === 'invoices' ? "text-indigo-600 border-b-2 border-indigo-600" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  Invoices
                </button>
              </div>
              
              {activeTab === 'entries' && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setShowManual(!showManual)}
                    className="flex items-center gap-2 text-slate-500 font-bold text-[10px] uppercase tracking-wider border border-slate-300 px-4 py-2 hover:bg-slate-50 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Add Manual
                  </button>
                  <button
                    onClick={handleExportCSV}
                    className="flex items-center gap-2 text-emerald-600 font-bold text-[10px] uppercase tracking-wider border border-emerald-600 px-4 py-2 hover:bg-emerald-50 transition-colors"
                  >
                    <Download className="w-3 h-3" /> Export CSV
                  </button>
                  <button
                    onClick={handleGeneratePDF}
                    className="flex items-center gap-2 text-indigo-600 font-bold text-[10px] uppercase tracking-wider border border-indigo-600 px-4 py-2 hover:bg-indigo-50 transition-colors"
                  >
                    <FileText className="w-3 h-3" /> Generate Invoice (PDF)
                  </button>
                </div>
              )}
            </div>

            {activeTab === 'entries' ? (
              <>
                {/* Filters */}
            <div className="bg-slate-50 border-b border-slate-100 p-4 px-6 flex flex-wrap gap-4 items-end">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500 mb-1 block">From Date</label>
                <DatePicker
                  value={filterStartDate}
                  onChange={setFilterStartDate}
                  highlightedDates={entries.map(e => e.date)}
                  className="w-36"
                  placeholder="From..."
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500 mb-1 block">To Date</label>
                <DatePicker
                  value={filterEndDate}
                  onChange={setFilterEndDate}
                  highlightedDates={entries.map(e => e.date)}
                  className="w-36"
                  placeholder="To..."
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500 mb-1 block">Employer / Client</label>
                <select 
                  value={filterEmployer} 
                  onChange={(e) => setFilterEmployer(e.target.value)} 
                  className="bg-white border border-slate-200 p-2 text-xs min-w-[150px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">All Employers</option>
                  {uniqueEmployers.map(emp => (
                    <option key={emp} value={emp}>{emp}</option>
                  ))}
                </select>
              </div>
              {(filterStartDate || filterEndDate || filterEmployer) && (
                <button 
                  onClick={() => { setFilterStartDate(''); setFilterEndDate(''); setFilterEmployer(''); }}
                  className="text-[10px] text-slate-500 hover:text-slate-800 underline font-bold uppercase pb-2"
                >
                  Clear Filters
                </button>
              )}
            </div>

            {/* Manual Entry Form */}
            {showManual && (
              <form onSubmit={addManualEntry} className="m-6 p-6 bg-slate-50 border border-slate-200 space-y-4">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-800">Add Time Manually</h3>
                <div className="grid grid-cols-2 lg:grid-cols-7 gap-4">
                  <div className="col-span-2 lg:col-span-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 mb-1 block">Date</label>
                    <DatePicker 
                      value={manualDate} 
                      onChange={setManualDate} 
                      highlightedDates={entries.map(e => e.date)}
                    />
                  </div>
                  <div className="col-span-2 lg:col-span-2">
                    <label className="text-[10px] font-bold uppercase text-slate-500 mb-1 block">Time (H/M/S)</label>
                    <div className="flex gap-2">
                      <input type="number" min="0" placeholder="0h" value={manualHours} onChange={(e) => setManualHours(e.target.value)} className="w-full bg-white border border-slate-200 p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                      <input type="number" min="0" max="59" placeholder="0m" value={manualMinutes} onChange={(e) => setManualMinutes(e.target.value)} className="w-full bg-white border border-slate-200 p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                      <input type="number" min="0" max="59" placeholder="0s" value={manualSeconds} onChange={(e) => setManualSeconds(e.target.value)} className="w-full bg-white border border-slate-200 p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                    </div>
                  </div>
                  <div className="col-span-2 lg:col-span-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 mb-1 block">Rate ($/h)</label>
                    <input type="number" min="0" step="0.01" placeholder={hourlyRate.toString()} value={manualRate} onChange={(e) => setManualRate(e.target.value)} className="w-full bg-white border border-slate-200 p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                  </div>
                  <div className="col-span-2 lg:col-span-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 mb-1 block">Employer</label>
                    <input type="text" placeholder="Client Name" value={manualEmployer} onChange={(e) => setManualEmployer(e.target.value)} className="w-full bg-white border border-slate-200 p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                  </div>
                  <div className="col-span-2 lg:col-span-2">
                    <label className="text-[10px] font-bold uppercase text-slate-500 mb-1 block">Activity</label>
                    <input type="text" placeholder="Description" value={manualTask} onChange={(e) => setManualTask(e.target.value)} className="w-full bg-white border border-slate-200 p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setShowManual(false)} className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-4 py-2 hover:bg-slate-200 transition-colors">Cancel</button>
                  <button type="submit" className="bg-indigo-600 text-white font-bold text-[10px] uppercase tracking-wider px-4 py-2 hover:bg-indigo-700 transition-colors">Save Entry</button>
                </div>
              </form>
            )}

            {/* List */}
            <div className="overflow-x-auto flex-1 h-0 min-h-[300px]">
              {filteredEntries.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3 p-8">
                  <Clock className="w-12 h-12 stroke-[1.5]" />
                  <p className="text-sm font-medium">No entries found for these filters.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="text-[10px] uppercase font-bold text-slate-500 select-none">
                      <th className="px-6 py-4 border-b border-slate-200">Date and Description</th>
                      <th className="px-6 py-4 border-b border-slate-200 hidden sm:table-cell w-32">Duration</th>
                      <th className="px-6 py-4 border-b border-slate-200 hidden md:table-cell w-32">Employer</th>
                      <th className="px-6 py-4 border-b border-slate-200 text-right w-32">Subtotal</th>
                      <th className="px-4 py-4 border-b border-slate-200 w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="text-sm text-slate-600">
                    {filteredEntries.map(entry => (
                      <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50/50 group">
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-900 mb-1">{entry.task}</div>
                          <div className="text-xs text-slate-500 flex items-center gap-2">
                            <span>{new Intl.DateTimeFormat('en-US', { dateStyle: 'short' }).format(new Date(entry.date))}</span>
                            <span className="sm:hidden text-indigo-600 font-mono text-[10px] font-bold">{formatTime(entry.durationMs)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-[11px] font-bold text-slate-500 hidden sm:table-cell">
                          {formatTime(entry.durationMs)}
                        </td>
                        <td className="px-6 py-4 text-[12px] text-slate-500 hidden md:table-cell">
                          {entry.employer || '-'}
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-medium text-slate-900">
                          {formatCurrency(entry.earned)}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <button 
                            onClick={() => removeEntry(entry.id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Summary Footer */}
            {entries.length > 0 && (
              <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-between items-center mt-auto">
                <div className="text-[10px] text-slate-400 uppercase font-bold">
                  Total Entries: {entries.length}
                </div>
                <button 
                  onClick={clearAllEntries}
                  className="bg-white border border-red-200 text-red-600 font-bold text-[10px] uppercase tracking-wider px-4 py-2 hover:bg-red-50 transition-colors"
                >
                  Clear All
                </button>
              </div>
            )}
            </>
            ) : (
              <>
                {/* Invoice Filters */}
                <div className="bg-slate-50 border-b border-slate-100 p-4 px-6 flex flex-wrap gap-4 items-end">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 mb-1 block">From Date</label>
                    <DatePicker
                      value={filterInvoiceStartDate}
                      onChange={setFilterInvoiceStartDate}
                      highlightedDates={invoices.map(e => e.generatedAt)}
                      className="w-36"
                      placeholder="From..."
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 mb-1 block">To Date</label>
                    <DatePicker
                      value={filterInvoiceEndDate}
                      onChange={setFilterInvoiceEndDate}
                      highlightedDates={invoices.map(e => e.generatedAt)}
                      className="w-36"
                      placeholder="To..."
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 mb-1 block">Employer / Client</label>
                    <select 
                      value={filterInvoiceEmployer} 
                      onChange={(e) => setFilterInvoiceEmployer(e.target.value)} 
                      className="bg-white border border-slate-200 p-2 text-xs min-w-[150px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="">All Employers</option>
                      {uniqueInvoiceEmployers.map(emp => (
                        <option key={emp} value={emp}>{emp}</option>
                      ))}
                    </select>
                  </div>
                  {(filterInvoiceStartDate || filterInvoiceEndDate || filterInvoiceEmployer) && (
                    <button 
                      onClick={() => { setFilterInvoiceStartDate(''); setFilterInvoiceEndDate(''); setFilterInvoiceEmployer(''); }}
                      className="text-[10px] text-slate-500 hover:text-slate-800 underline font-bold uppercase pb-2"
                    >
                      Clear Filters
                    </button>
                  )}
                </div>

                {/* Invoices List */}
                <div className="overflow-x-auto flex-1 h-0 min-h-[300px]">
                  {filteredInvoices.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3 p-8">
                      <FileText className="w-12 h-12 stroke-[1.5]" />
                      <p className="text-sm font-medium">No invoices generated yet.</p>
                      <p className="text-xs">Go to "Entry History" and click "Generate Invoice".</p>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr className="text-[10px] uppercase font-bold text-slate-500 select-none">
                          <th className="px-6 py-4 border-b border-slate-200">Generated On</th>
                          <th className="px-6 py-4 border-b border-slate-200 hidden sm:table-cell w-48">Period</th>
                          <th className="px-6 py-4 border-b border-slate-200 hidden md:table-cell w-32">Employer</th>
                          <th className="px-6 py-4 border-b border-slate-200 text-right w-32">Amount</th>
                          <th className="px-4 py-4 border-b border-slate-200 w-16"></th>
                        </tr>
                      </thead>
                      <tbody className="text-sm text-slate-600">
                        {filteredInvoices.map(invoice => (
                          <tr key={invoice.id} className="border-b border-slate-100 hover:bg-slate-50/50 group">
                            <td className="px-6 py-4 font-medium text-slate-900">
                              {new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(invoice.generatedAt))}
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-500 hidden sm:table-cell">
                              {invoice.periodStr}
                            </td>
                            <td className="px-6 py-4 text-[12px] text-slate-500 hidden md:table-cell">
                              {invoice.employer || '-'}
                            </td>
                            <td className="px-6 py-4 text-right font-mono font-medium text-indigo-700">
                              {formatCurrency(invoice.totalAmount)}
                            </td>
                            <td className="px-4 py-4 text-right">
                              <button 
                                onClick={() => removeInvoice(invoice.id)}
                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title="Delete Record"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      <footer className="h-8 bg-slate-200 border-t border-slate-300 flex items-center justify-between px-4 sm:px-8 shrink-0 text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-auto">
        <div className="flex gap-6">
          <span className="hidden sm:inline">Status: <span className="text-green-600">Online</span></span>
          <span className="hidden sm:inline">Cloud Sync: <span className={user ? "text-indigo-600" : "text-amber-500"}>{user ? "Synced" : "Logged Out"}</span></span>
        </div>
        <div>CHRONOS FLOW</div>
      </footer>
    </div>
  );
}
