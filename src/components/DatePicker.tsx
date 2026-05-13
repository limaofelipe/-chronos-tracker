import React, { useState, useEffect, useRef } from 'react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '../lib/utils';

interface DatePickerProps {
  value: string;
  onChange: (dateStr: string) => void;
  highlightedDates?: string[];
  className?: string;
  placeholder?: string;
}

export function DatePicker({ value, onChange, highlightedDates = [], className, placeholder }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(value ? new Date(value) : new Date());
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  
  const startDateToPad = new Date(monthStart);
  startDateToPad.setDate(startDateToPad.getDate() - startDateToPad.getDay());
  
  const endDateToPad = new Date(monthEnd);
  endDateToPad.setDate(endDateToPad.getDate() + (6 - endDateToPad.getDay()));

  const calendarDays = eachDayOfInterval({ start: startDateToPad, end: endDateToPad });

  const handleDayClick = (day: Date) => {
    // Add timezone offset so it renders correctly
    const tzOffset = day.getTimezoneOffset() * 60000;
    const localDate = new Date(day.getTime() - tzOffset);
    onChange(localDate.toISOString().split('T')[0]);
    setIsOpen(false);
  };

  const selectedDate = value ? new Date(value + 'T12:00:00') : undefined; // Prevent timezone issues
  
  const highlightSet = new Set(highlightedDates.map(d => {
    // Parse the date properly for the highlights
    if (d.includes('T')) return d.split('T')[0];
    return d;
  }));

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between text-left bg-white border border-slate-200 p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500",
          !value && "text-slate-400",
          className
        )}
      >
        {value ? format(new Date(value + 'T12:00:00'), 'MMM d, yyyy') : (placeholder || "Select a date")}
        <CalendarIcon className="w-4 h-4 ml-2 opacity-50 text-slate-500" />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 bg-white border border-slate-200 shadow-lg p-3 w-64 rounded-md">
          <div className="flex justify-between items-center mb-4">
            <button
              type="button"
              className="p-1 hover:bg-slate-100 rounded-sm"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="font-bold text-sm text-slate-800">
              {format(currentMonth, 'MMMM yyyy')}
            </div>
            <button
              type="button"
              className="p-1 hover:bg-slate-100 rounded-sm"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          
          <div className="grid grid-cols-7 gap-1 mb-2">
            {days.map(day => (
              <div key={day} className="text-center text-[10px] font-bold text-slate-400">
                {day}
              </div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, i) => {
              // Add timezone offset to fix off-by-one errors with comparing dates
              const tzOffset = day.getTimezoneOffset() * 60000;
              const localDate = new Date(day.getTime() - tzOffset);
              const dayStr = localDate.toISOString().split('T')[0];
              
              const isSelected = selectedDate && format(selectedDate, 'yyyy-MM-dd') === dayStr;
              const isHighlighted = highlightSet.has(dayStr);
              
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleDayClick(day)}
                  className={cn(
                    "h-8 w-8 text-xs flex items-center justify-center rounded-sm transition-colors",
                    !isSameMonth(day, currentMonth) && "text-slate-300",
                    isSameMonth(day, currentMonth) && !isSelected && "text-slate-700 hover:bg-slate-100",
                    isHighlighted && !isSelected && "bg-emerald-100 text-emerald-800 font-bold border border-emerald-200 hover:bg-emerald-200",
                    isSelected && "bg-indigo-600 text-white font-bold",
                  )}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
