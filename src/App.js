import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './App.css';
import {
  getGroups, saveGroup, deleteGroup,
  getStudents, saveStudent, deleteStudent,
  exportBackupData, importBackupData,
  isCloudMode, syncLocalToCloud, disconnectCloud
} from './db/db';

// ============================================================
// UTILITIES
// ============================================================
const genId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

const getInitials = (name) => {
  if (!name) return '؟';
  const parts = name.trim().split(' ');
  return parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0].substring(0, 2);
};

const formatCurrency = (n) => `${(n || 0).toLocaleString('ar-EG')} ج.م`;

const today = () => new Date().toISOString().split('T')[0];

const gradeClass = (g, total) => {
  const pct = (g / total) * 100;
  if (pct >= 85) return 'excellent';
  if (pct >= 70) return 'good';
  if (pct >= 50) return 'pass';
  return 'fail';
};

const gradeLabel = (g, total) => {
  const pct = (g / total) * 100;
  if (pct >= 85) return 'ممتاز';
  if (pct >= 70) return 'جيد جداً';
  if (pct >= 50) return 'مقبول';
  return 'ضعيف';
};

// ============================================================
// CALENDAR COLOR PALETTE & SCHEDULE PARSER
// ============================================================
const GROUP_COLORS = [
  { bg: '#6366f1', light: 'rgba(99,102,241,0.13)',  text: '#4f46e5' },
  { bg: '#0ea5e9', light: 'rgba(14,165,233,0.13)',  text: '#0284c7' },
  { bg: '#10b981', light: 'rgba(16,185,129,0.13)',  text: '#059669' },
  { bg: '#f59e0b', light: 'rgba(245,158,11,0.13)',  text: '#d97706' },
  { bg: '#ef4444', light: 'rgba(239,68,68,0.13)',   text: '#dc2626' },
  { bg: '#8b5cf6', light: 'rgba(139,92,246,0.13)',  text: '#7c3aed' },
  { bg: '#06b6d4', light: 'rgba(6,182,212,0.13)',   text: '#0891b2' },
  { bg: '#f97316', light: 'rgba(249,115,22,0.13)',  text: '#ea580c' },
];

const getGroupColor = (groupId = '') => {
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) {
    hash = groupId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length];
};

const parseGroupSchedule = (scheduleStr) => {
  if (!scheduleStr) return { days: [], hour: null, mins: 0 };
  const daysSection = scheduleStr.split('(')[0].trim();
  const days = daysSection.split(' - ').map(d => d.trim()).filter(Boolean);
  const timeMatch = scheduleStr.match(/(\d{1,2}):(\d{2})\s*([صم])/);
  if (!timeMatch) return { days, hour: null, mins: 0 };
  let hour = parseInt(timeMatch[1]);
  const mins = parseInt(timeMatch[2]);
  const ampm = timeMatch[3];
  if (ampm === 'م' && hour < 12) hour += 12;
  if (ampm === 'ص' && hour === 12) hour = 0;
  return { days, hour, mins };
};

// ============================================================
// TOAST NOTIFICATION SYSTEM
// ============================================================
let toastId = 0;
const ToastContext = React.createContext(null);

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success') => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span style={{ fontSize: '1.1rem' }}>{icons[t.type]}</span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function useToast() { return React.useContext(ToastContext); }

// ============================================================
// CONFIRM DIALOG
// ============================================================
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ fontSize: '1.05rem', color: 'var(--danger)' }}>⚠ تأكيد الإجراء</h3>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>إلغاء</button>
          <button className="btn btn-danger" onClick={onConfirm}>تأكيد الحذف</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ICONS (Inline SVG)
// ============================================================
const Icon = {
  dashboard: (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="2" fill="currentColor" fillOpacity="0.12" />
      <rect x="14" y="3" width="7" height="7" rx="2" fill="currentColor" fillOpacity="0.12" />
      <rect x="3" y="14" width="7" height="7" rx="2" fill="currentColor" fillOpacity="0.12" />
      <rect x="14" y="14" width="7" height="7" rx="2" fill="currentColor" fillOpacity="0.12" />
    </svg>
  ),
  groups: (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" fill="currentColor" fillOpacity="0.08" />
      <circle cx="9" cy="7" r="4" fill="currentColor" fillOpacity="0.15" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  students: (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" fill="currentColor" fillOpacity="0.12" />
      <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5" />
    </svg>
  ),
  grades: (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" fill="currentColor" fillOpacity="0.06" />
      <rect x="8" y="2" width="8" height="4" rx="1" fill="currentColor" fillOpacity="0.15" />
      <path d="M9 14l2 2 4-4" />
    </svg>
  ),
  payments: (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" fill="currentColor" fillOpacity="0.12" />
      <line x1="2" y1="10" x2="22" y2="10" />
      <line x1="6" y1="14" x2="10" y2="14" />
    </svg>
  ),
  settings: (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity="0.15" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  plus: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  edit: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" fill="currentColor" fillOpacity="0.12" />
    </svg>
  ),
  trash: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" fill="currentColor" fillOpacity="0.08" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  ),
  search: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" fill="currentColor" fillOpacity="0.08" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  close: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  cloud: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" fill="currentColor" fillOpacity="0.1" />
    </svg>
  ),
  download: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  upload: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  money: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"></line>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
    </svg>
  ),
  group: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
      <circle cx="9" cy="7" r="4"></circle>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>
  ),
  student: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
      <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"></path>
    </svg>
  ),
  exam: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <polyline points="10 9 9 9 8 9"></polyline>
    </svg>
  ),
  calendar: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="16" y1="2" x2="16" y2="6"></line>
      <line x1="8" y1="2" x2="8" y2="6"></line>
      <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>
  ),
  chart: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"></line>
      <line x1="12" y1="20" x2="12" y2="4"></line>
      <line x1="6" y1="20" x2="6" y2="14"></line>
    </svg>
  ),
  center: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
      <line x1="9" y1="22" x2="9" y2="16"></line>
      <line x1="15" y1="22" x2="15" y2="16"></line>
      <line x1="9" y1="16" x2="15" y2="16"></line>
      <path d="M12 2v4"></path>
      <path d="M10 4h4"></path>
      <circle cx="12" cy="10" r="2"></circle>
    </svg>
  ),
  private: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
      <polyline points="9 22 9 12 15 12 15 22"></polyline>
    </svg>
  ),
  rocket: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', margin: '0 auto 1rem' }}>
      <path d="M22 2s-8 7-9 8c-.76.76-1.9 1.1-2.93.9l-3.32.96a1 1 0 0 1-1.1-.38L3.2 7.02a1 1 0 0 1 .15-1.24l3.12-3.12a1 1 0 0 1 1.24-.15l3.4 1.83c1.03.55 2.2.3 2.97-.47L22 2z"></path>
      <path d="M9 15l-5 5"></path>
      <path d="M15 9l5 5"></path>
      <path d="M9 20a2.5 2.5 0 0 0 5 0"></path>
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  ),
  cross: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  ),
  partial: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
  ),
  info: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginLeft: '0.4rem' }}>
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="16" x2="12" y2="12"></line>
      <line x1="12" y1="8" x2="12.01" y2="8"></line>
    </svg>
  ),
  lock: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginLeft: '0.4rem' }}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
    </svg>
  ),
  flash: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginLeft: '0.4rem' }}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
    </svg>
  ),
  eye: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  ),
  notes: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginLeft: '0.4rem' }}>
      <path d="M12 20h9"></path>
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
    </svg>
  ),
  book: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginLeft: '0.4rem' }}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
    </svg>
  ),
};

// ============================================================
// SIDEBAR
// ============================================================
const NAV_ITEMS = [
  { id: 'groups', label: 'المجموعات', icon: Icon.groups },
  { id: 'students', label: 'الطلاب', icon: Icon.students },
  { id: 'payments', label: 'المالية', icon: Icon.payments },
  { id: 'dashboard', label: 'التقويم', icon: Icon.calendar },
];

function Sidebar({ activeView, setActiveView, cloudMode }) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#ffffff' }}>
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M7.5 12.5V17c0 2 2 3 4.5 3s4.5-1 4.5-3v-4.5" />
              <path d="M22 10v6" />
            </svg>
          </div>
          <div className="sidebar-logo-text">
            <h2>سيستم مس الاء رمضان</h2>
            <span>لوحة التحكم الذكية</span>
          </div>
        </div>
      </div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            className={`nav-item ${activeView === item.id ? 'active' : ''}`}
            onClick={() => setActiveView(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className={`cloud-status ${cloudMode ? 'cloud' : 'local'}`}>
          <div className={`status-dot ${cloudMode ? 'cloud-dot' : 'local-dot'}`} />
          {cloudMode ? 'متصل بالسحابة' : 'تخزين محلي'}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CALENDAR VIEW (replaces Dashboard)
// ============================================================
function CalendarView({ groups, allStudents, setActiveView }) {
  const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
  const HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 7 AM → 7 PM
  const todayName = new Date().toLocaleDateString('ar-EG', { weekday: 'long' });
  const currentHour = new Date().getHours();

  const [activeDayMobile, setActiveDayMobile] = useState(() => {
    const todayName = new Date().toLocaleDateString('ar-EG', { weekday: 'long' });
    return DAYS.includes(todayName) ? todayName : DAYS[0];
  });

  // Build schedule map: { day: { hour: [{ group, color }] } }
  const scheduleMap = useMemo(() => {
    const map = {};
    groups.forEach(g => {
      const { days, hour } = parseGroupSchedule(g.schedule);
      const color = getGroupColor(g.id);
      days.forEach(day => {
        if (!map[day]) map[day] = {};
        if (hour !== null) {
          if (!map[day][hour]) map[day][hour] = [];
          map[day][hour].push({ group: g, color });
        }
      });
    });
    return map;
  }, [groups]);

  const formatHour = (h) => {
    const ampm = h >= 12 ? 'م' : 'ص';
    const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${dh}:00 ${ampm}`;
  };

  const formatTimeStr = (h, m) => {
    if (h === null) return 'غير محدد';
    const ampm = h >= 12 ? 'م' : 'ص';
    const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${dh.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  // Get sorted events for mobile timeline active day
  const mobileEvents = useMemo(() => {
    const list = [];
    groups.forEach(g => {
      const { days, hour, mins } = parseGroupSchedule(g.schedule);
      if (days.includes(activeDayMobile)) {
        list.push({
          group: g,
          hour: hour !== null ? hour : 0,
          mins: mins || 0,
          timeStr: formatTimeStr(hour, mins)
        });
      }
    });
    return list.sort((a, b) => {
      if (a.hour !== b.hour) return a.hour - b.hour;
      return a.mins - b.mins;
    });
  }, [groups, activeDayMobile]);

  return (
    <div className="animate-fade">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">التقويم الأسبوعي</h1>
          <p className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ display: 'inline-flex', color: 'var(--primary)' }}>{Icon.calendar}</span>
            {new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setActiveView('groups')}>
          {Icon.plus} مجموعة جديدة
        </button>
      </div>

      {/* Calendar Grid Container */}
      <div className="calendar-container">
        {groups.length === 0 ? (
          <div className="calendar-empty">
            <svg style={{ width: '64px', height: '64px', color: 'var(--primary)', marginBottom: '1rem', opacity: 0.8 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            <h3>لا توجد مجموعات بعد</h3>
            <p>أنشئ أول مجموعة وشاهدها تظهر هنا في التقويم</p>
            <button className="btn btn-primary" style={{ marginTop: '0.5rem' }} onClick={() => setActiveView('groups')}>
              {Icon.plus} إنشاء مجموعة
            </button>
          </div>
        ) : (
          <>
            {/* Desktop View (Full Timetable) */}
            <div className="calendar-desktop-view">
              <div className="calendar-scroll">
                <div className="calendar-grid" style={{ gridTemplateColumns: `90px repeat(${DAYS.length}, minmax(130px, 1fr))` }}>
                  <div className="cal-corner">الوقت</div>
                  {DAYS.map(day => (
                    <div key={day} className={`cal-day-header ${day === todayName ? 'cal-today-header' : ''}`}>
                      <span className="cal-day-name">{day}</span>
                      {day === todayName && <span className="cal-today-badge">اليوم</span>}
                    </div>
                  ))}
                  {HOURS.map(hour => (
                    <React.Fragment key={hour}>
                      <div className={`cal-time-cell ${hour === currentHour ? 'cal-current-hour-cell' : ''}`}>
                        <span className="cal-time-text">{formatHour(hour)}</span>
                      </div>
                      {DAYS.map(day => {
                        const events = scheduleMap[day]?.[hour] || [];
                        const isToday = day === todayName;
                        const isCurrent = isToday && hour === currentHour;
                        return (
                          <div
                            key={`${day}-${hour}`}
                            className={`cal-cell ${isToday ? 'cal-cell-today' : ''} ${isCurrent ? 'cal-cell-now' : ''}`}
                          >
                            {isCurrent && events.length === 0 && <div className="cal-now-line" />}
                            {events.map(({ group: g, color }) => {
                              const stCount = allStudents.filter(s => s.group_id === g.id).length;
                              return (
                                <div
                                  key={g.id}
                                  className="cal-event-card"
                                  style={{ background: color.light, borderRight: `3px solid ${color.bg}`, color: color.text }}
                                  onClick={() => setActiveView('groups')}
                                  title={g.schedule}
                                >
                                  <div className="cal-event-title">{g.name}</div>
                                  <div className="cal-event-sub">{g.subject} · {g.type === 'center' ? 'سنتر' : 'خصوصي'}</div>
                                  <div className="cal-event-count" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
                                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                      <circle cx="9" cy="7" r="4" />
                                    </svg>
                                    <span>{stCount} طالب</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>

            {/* Mobile View (Google Calendar-style) */}
            <div className="calendar-mobile-view">
              {/* Day-picker strip */}
              <div className="cal-mobile-tabs-container">
                <div className="cal-mobile-tabs">
                  {DAYS.map((day, idx) => {
                    // Short 2-char abbreviation
                    const short = day.slice(0, 2);
                    // Day-of-week number (visual index from 1)
                    const num = idx + 1;
                    const isActive = activeDayMobile === day;
                    const isToday = day === todayName;
                    return (
                      <button
                        key={day}
                        className={`cal-mobile-tab-btn ${
                          isActive ? 'active' : ''
                        } ${isToday ? 'is-today' : ''}`}
                        onClick={() => setActiveDayMobile(day)}
                      >
                        <div className="cal-mobile-tab-day-label">{short}</div>
                        <div className="cal-mobile-tab-day-circle">{num}</div>
                        {isToday && <span className="cal-mobile-tab-today-dot" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active day banner */}
              <div className="cal-mobile-day-banner">
                <span className="cal-mobile-day-title">
                  {activeDayMobile === todayName ? `اليوم · ${activeDayMobile}` : activeDayMobile}
                </span>
                <span className="cal-mobile-day-count">
                  {mobileEvents.length === 0
                    ? 'لا توجد حصص'
                    : `${mobileEvents.length} ${mobileEvents.length === 1 ? 'حصة' : 'حصص'}`}
                </span>
              </div>

              {/* Timeline */}
              <div className="cal-mobile-timeline">
                {mobileEvents.length === 0 ? (
                  <div className="cal-mobile-empty">
                    <svg style={{ width: '48px', height: '48px', marginBottom: '0.75rem' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <h4>لا توجد حصص اليوم</h4>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>يوم مريح! 🎉</p>
                  </div>
                ) : (
                  <div className="cal-timeline-list">
                    {mobileEvents.map(({ group: g, timeStr }, i) => {
                      const color = getGroupColor(g.id);
                      const stCount = allStudents.filter(s => s.group_id === g.id).length;
                      const isLast = i === mobileEvents.length - 1;
                      return (
                        <div key={g.id} className="cal-timeline-item">
                          {/* Time gutter */}
                          <div className="cal-tl-time">
                            <span className="cal-tl-time-label">{timeStr}</span>
                            <div className="cal-tl-time-dot" style={{ background: color.bg, boxShadow: `0 0 0 3px ${color.light}` }} />
                            {!isLast && <div className="cal-tl-time-line" style={{ background: `linear-gradient(180deg, ${color.light}, transparent)` }} />}
                          </div>

                          {/* Card */}
                          <div
                            className="cal-timeline-card"
                            style={{ borderRight: `4px solid ${color.bg}` }}
                            onClick={() => setActiveView('groups')}
                          >
                            <div className="cal-timeline-card-body">
                              <div className="cal-timeline-card-time" style={{ color: color.text }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10" />
                                  <polyline points="12 6 12 12 16 14" />
                                </svg>
                                {timeStr}
                              </div>
                              <div className="cal-timeline-card-content">
                                <h4 className="cal-timeline-card-title">{g.name}</h4>
                                <div className="cal-timeline-card-sub">
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                                    </svg>
                                    {g.subject}
                                  </span>
                                  <span className={`badge badge-${g.type === 'center' ? 'center' : 'private'}`} style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem' }}>
                                    {g.type === 'center' ? 'سنتر' : 'خصوصي'}
                                  </span>
                                </div>
                                <div className="cal-timeline-card-students">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                    <circle cx="9" cy="7" r="4" />
                                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                  </svg>
                                  {stCount} طالب منتسب
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Legend */}
      {groups.length > 0 && (
        <div className="cal-legend">
          <span className="cal-legend-title">المجموعات:</span>
          {groups.map(g => {
            const color = getGroupColor(g.id);
            return (
              <div key={g.id} className="cal-legend-item">
                <div className="cal-legend-dot" style={{ background: color.bg }} />
                <span>{g.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// GROUP FORM MODAL
// ============================================================
function GroupFormModal({ group, allGroups = [], onSave, onClose }) {
  const [form, setForm] = useState({
    name: group?.name || '',
    type: group?.type || 'center',
    subject: group?.subject || 'English',
    price: group?.price || '',
  });
  const toast = useToast();

  const daysOfWeek = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

  // Parse days from existing schedule
  const [selectedDays, setSelectedDays] = useState(
    group?.schedule
      ? daysOfWeek.filter(day => group.schedule.includes(day))
      : []
  );

  // Helper to parse time from schedule string
  const parseTimeFromSchedule = (scheduleStr) => {
    if (!scheduleStr) return '16:00';
    const match = scheduleStr.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      let hrs = parseInt(match[1]);
      const mins = match[2];
      if (scheduleStr.includes('م') && hrs < 12) hrs += 12;
      if (scheduleStr.includes('ص') && hrs === 12) hrs = 0;
      return `${hrs.toString().padStart(2, '0')}:${mins}`;
    }
    const matchSingle = scheduleStr.match(/\b(\d{1,2})\b/);
    if (matchSingle) {
      let hrs = parseInt(matchSingle[1]);
      if (scheduleStr.includes('م') && hrs < 12) hrs += 12;
      if (scheduleStr.includes('ص') && hrs === 12) hrs = 0;
      return `${hrs.toString().padStart(2, '0')}:00`;
    }
    return '16:00';
  };

  const [classTime, setClassTime] = useState(parseTimeFromSchedule(group?.schedule));

  const toggleDay = (day) => {
    setSelectedDays(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  };

  const selectBundleUTK = () => {
    setSelectedDays(['الأحد', 'الثلاثاء', 'الخميس']);
  };

  const selectBundleSMA = () => {
    setSelectedDays(['السبت', 'الاثنين', 'الأربعاء']);
  };

  const isBundleActive = (bundle) => {
    return bundle.every(day => selectedDays.includes(day)) && selectedDays.length === bundle.length;
  };

  const formatTimeArabic = (timeStr) => {
    if (!timeStr) return '';
    const [hrsStr, minsStr] = timeStr.split(':');
    let hrs = parseInt(hrsStr);
    const mins = minsStr;
    const ampm = hrs >= 12 ? 'م' : 'ص';
    hrs = hrs % 12;
    hrs = hrs ? hrs : 12;
    return `${hrs.toString().padStart(2, '0')}:${mins} ${ampm}`;
  };

  // Conflict detection
  const conflicts = useMemo(() => {
    if (selectedDays.length === 0 || !classTime) return [];
    const [classHourStr, classMinStr] = classTime.split(':');
    const classHour = parseInt(classHourStr);
    const classMin = parseInt(classMinStr);

    const list = [];
    allGroups.forEach(g => {
      if (group && g.id === group.id) return; // skip self
      const parsed = parseGroupSchedule(g.schedule);
      if (parsed.hour === null) return;
      
      const commonDays = selectedDays.filter(d => parsed.days.includes(d));
      if (commonDays.length > 0) {
        // Class duration is about 2 hours
        const diffMins = Math.abs((classHour * 60 + classMin) - (parsed.hour * 60 + parsed.mins));
        if (diffMins < 120) {
          list.push({
            group: g,
            days: commonDays,
            time: formatTimeArabic(`${parsed.hour.toString().padStart(2, '0')}:${parsed.mins.toString().padStart(2, '0')}`),
          });
        }
      }
    });
    return list;
  }, [selectedDays, classTime, allGroups, group]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast('يرجى إدخال اسم المجموعة', 'error'); return; }
    if (selectedDays.length === 0) { toast('يرجى اختيار يوم واحد على الأقل للحصص', 'error'); return; }

    const daysStr = selectedDays.join(' - ');
    const timeStrFormatted = formatTimeArabic(classTime);
    const constructedSchedule = `${daysStr} (الساعة ${timeStrFormatted})`;

    const data = { 
      ...group, 
      ...form, 
      id: group?.id || genId(), 
      price: Number(form.price) || 0,
      schedule: constructedSchedule
    };
    await saveGroup(data);
    toast(group ? 'تم تعديل المجموعة بنجاح' : 'تم إنشاء المجموعة بنجاح', 'success');
    onSave(data);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {group ? (
              <>
                <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginLeft: '0.4rem', color: 'var(--primary)' }}>{Icon.edit}</span> تعديل المجموعة
              </>
            ) : (
              <>
                <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginLeft: '0.4rem', color: 'var(--primary)' }}>{Icon.plus}</span> إنشاء مجموعة جديدة
              </>
            )}
          </h3>
          <button className="btn-icon" onClick={onClose}>{Icon.close}</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">اسم المجموعة *</label>
              <input className="form-control" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="مثال: Group A" />
            </div>
            <div className="form-group">
              <label className="form-label">نوع المجموعة</label>
              <select className="form-control" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                <option value="center">سنتر</option>
                <option value="private">خصوصي</option>
              </select>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">سعر الشهر (ج.م)</label>
                <input className="form-control" type="number" value={form.price} onChange={e => setForm({...form, price: e.target.value})} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">المادة</label>
                <input className="form-control" value={form.subject} onChange={e => setForm({...form, subject: e.target.value})} placeholder="English" />
              </div>
            </div>
            
            {/* Schedule Days Selector */}
            <div className="form-group">
              <label className="form-label">أيام الحصص *</label>
              
              {/* Quick Select Buttons */}
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{
                    flex: 1,
                    borderColor: isBundleActive(['الأحد', 'الثلاثاء', 'الخميس']) ? 'var(--primary)' : 'var(--border-glass)',
                    background: isBundleActive(['الأحد', 'الثلاثاء', 'الخميس']) ? 'var(--primary-light)' : '#ffffff',
                    color: isBundleActive(['الأحد', 'الثلاثاء', 'الخميس']) ? 'var(--primary)' : 'var(--text-muted)',
                    fontWeight: 700,
                    borderRadius: '12px',
                    transition: 'var(--transition-smooth)'
                  }}
                  onClick={selectBundleUTK}
                >
                  📅 الأحد / الثلاثاء / الخميس
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{
                    flex: 1,
                    borderColor: isBundleActive(['السبت', 'الاثنين', 'الأربعاء']) ? 'var(--primary)' : 'var(--border-glass)',
                    background: isBundleActive(['السبت', 'الاثنين', 'الأربعاء']) ? 'var(--primary-light)' : '#ffffff',
                    color: isBundleActive(['السبت', 'الاثنين', 'الأربعاء']) ? 'var(--primary)' : 'var(--text-muted)',
                    fontWeight: 700,
                    borderRadius: '12px',
                    transition: 'var(--transition-smooth)'
                  }}
                  onClick={selectBundleSMA}
                >
                  📅 السبت / الاثنين / الأربعاء
                </button>
              </div>

              <div className="days-selector">
                {daysOfWeek.map(day => (
                  <div
                    key={day}
                    type="button"
                    className={`day-chip ${selectedDays.includes(day) ? 'active' : ''}`}
                    onClick={() => toggleDay(day)}
                  >
                    {day}
                  </div>
                ))}
              </div>
            </div>

            {/* Class Time Input */}
            <div className="form-group">
              <label className="form-label">ساعة الحصة *</label>
              <input
                type="time"
                className="form-control"
                value={classTime}
                onChange={e => setClassTime(e.target.value)}
              />
            </div>

            {/* Read-only preview of constructed schedule */}
            {selectedDays.length > 0 && (
              <div style={{ padding: '0.85rem 1.1rem', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '10px', fontSize: '0.88rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
                <span style={{ display: 'inline-flex' }}>{Icon.calendar}</span>
                <span>
                  جدول الحصص: {selectedDays.join(' - ')} (الساعة {formatTimeArabic(classTime)})
                </span>
              </div>
            )}

            {/* Conflicts Warning List */}
            {conflicts.length > 0 && (
              <div style={{
                padding: '0.85rem 1.1rem',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#dc2626',
                borderRadius: '10px',
                fontSize: '0.88rem',
                fontWeight: 600,
                marginTop: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ display: 'inline-flex', fontSize: '1.1rem' }}>⚠</span>
                  <span>تنبيه: يوجد تعارض في المواعيد!</span>
                </div>
                <ul style={{ margin: 0, paddingRight: '1.25rem', listStyleType: 'disc' }}>
                  {conflicts.map((c, idx) => (
                    <li key={idx} style={{ marginBottom: '0.25rem' }}>
                      مجموعة <strong>{c.group.name}</strong> لديها حصة يوم {c.days.join(' و')} الساعة {c.time} (تعارض مع موعدك المقترح)
                    </li>
                  ))}
                </ul>
              </div>
            )}

          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>إلغاء</button>
            <button type="submit" className="btn btn-primary">{Icon.plus} {group ? 'حفظ التعديلات' : 'إنشاء المجموعة'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// GROUP DETAIL SUB-VIEW
// ============================================================
function GroupDetailSubView({ groupId, groups, allStudents, onRefresh, onBack }) {
  const group = groups.find(g => g.id === groupId);
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentPhone, setNewStudentPhone] = useState('');
  const [newStudentParentPhone, setNewStudentParentPhone] = useState('');
  const [quickAddLoading, setQuickAddLoading] = useState(false);

  if (!group) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h3>المجموعة غير موجودة</h3>
        <button className="btn btn-primary" onClick={onBack}>العودة للمجموعات</button>
      </div>
    );
  }

  const groupStudents = allStudents.filter(s => s.group_id === groupId);
  const filteredStudents = groupStudents.filter(s => 
    s.name.includes(search) || (s.phone || '').includes(search)
  );

  const currentMonth = new Date().toISOString().slice(0, 7);

  // Format month in Arabic e.g., "مايو 2026"
  const formatMonthArabic = (monthStr) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
  };

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    if (!newStudentName.trim()) {
      toast('يرجى إدخال اسم الطالب', 'error');
      return;
    }
    setQuickAddLoading(true);
    try {
      const newStudent = {
        id: genId(),
        name: newStudentName.trim(),
        group_id: groupId,
        phone: newStudentPhone.trim(),
        parent_phone: newStudentParentPhone.trim(),
        status: 'active',
        notes: '',
        payments: [],
        grades: [],
        attendance: []
      };
      await saveStudent(newStudent);
      toast(`تم إضافة الطالب "${newStudent.name}" بنجاح`, 'success');
      setNewStudentName('');
      setNewStudentPhone('');
      setNewStudentParentPhone('');
      onRefresh();
    } catch (err) {
      toast('فشل إضافة الطالب: ' + err.message, 'error');
    } finally {
      setQuickAddLoading(false);
    }
  };

  const handleTogglePayment = async (student) => {
    const isPaid = (student.payments || []).some(p => p.month === currentMonth && p.status === 'paid');
    let updatedPayments;
    if (isPaid) {
      // Remove payment for current month
      updatedPayments = (student.payments || []).filter(p => !(p.month === currentMonth && p.status === 'paid'));
      toast(`تم إلغاء دفع ${student.name} لهذا الشهر`, 'info');
    } else {
      // Add payment for current month
      const newPayment = {
        id: genId(),
        month: currentMonth,
        amount: group.price || 0,
        status: 'paid',
        note: 'دفع شهري سريع (من المجموعة)'
      };
      // Filter out any other payment record for the same month to prevent duplicate entries
      updatedPayments = [...(student.payments || []).filter(p => p.month !== currentMonth), newPayment];
      toast(`تم تسجيل دفع ${student.name} لهذا الشهر بنجاح`, 'success');
    }
    await saveStudent({ ...student, payments: updatedPayments });
    onRefresh();
  };

  return (
    <div className="animate-fade">
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <button className="btn btn-secondary btn-sm" onClick={onBack} style={{ marginBottom: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            ← العودة للمجموعات
          </button>
          <h1 className="page-title">{group.name}</h1>
          <p className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span className={`badge badge-${group.type === 'center' ? 'center' : 'private'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.15rem 0.5rem' }}>
              {group.type === 'center' ? (
                <>
                  <span style={{ display: 'inline-flex' }}>{Icon.center}</span> سنتر
                </>
              ) : (
                <>
                  <span style={{ display: 'inline-flex' }}>{Icon.private}</span> خصوصي
                </>
              )}
            </span>
            <span>·</span>
            <span>فلوس الشهر: {formatCurrency(group.price)}</span>
            {group.schedule && (
              <>
                <span>·</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span style={{ display: 'inline-flex', color: 'var(--primary)' }}>{Icon.calendar}</span> {group.schedule}
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="detail-grid">
        {/* Left side: Students list */}
        <div>
          <div className="search-bar" style={{ marginBottom: '1rem' }}>
            <div className="search-input-wrap" style={{ margin: 0 }}>
              {Icon.search}
              <input 
                className="search-input" 
                placeholder="بحث عن طالب في المجموعة..." 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
              />
            </div>
            <div style={{ marginRight: 'auto', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              إجمالي الطلاب: {groupStudents.length}
            </div>
          </div>

          {filteredStudents.length === 0 ? (
            <div className="empty-state" style={{ padding: '3rem 1rem' }}>
              <div className="empty-state-icon" style={{ color: 'var(--primary)', display: 'flex', justifyContent: 'center' }}>{Icon.student}</div>
              <h3>لا يوجد طلاب تطابق البحث</h3>
              <p>سجل طلاب جدد في المجموعة للبدء</p>
            </div>
          ) : (
            <div className="table-wrapper group-detail-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>الهاتف</th>
                    <th style={{ width: 180, textAlign: 'center' }}>فلوس الشهر {formatMonthArabic(currentMonth)}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map(s => {
                    const isPaid = (s.payments || []).some(p => p.month === currentMonth && p.status === 'paid');
                    return (
                      <tr key={s.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div className="student-avatar">{getInitials(s.name)}</div>
                            <span style={{ fontWeight: 600 }}>{s.name}</span>
                          </div>
                        </td>
                        <td>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>{s.phone || '—'}</span>
                        </td>
                        <td>
                          <div 
                            className={`ios-switch-container ${isPaid ? 'paid' : 'unpaid'}`} 
                            onClick={() => handleTogglePayment(s)}
                            title={isPaid ? "إلغاء تسجيل الدفع" : "تسجيل الدفع للشهر الحالي"}
                            style={{ justifyContent: 'center', width: '100%' }}
                          >
                            <div className="ios-switch-track">
                              <div className="ios-switch-handle" />
                            </div>
                            <span className={`ios-switch-label-badge ${isPaid ? 'paid' : 'unpaid'}`}>
                              {isPaid ? 'تم الدفع' : 'لم يدفع'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right side: Add student form */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ display: 'inline-flex', color: 'var(--primary)' }}>{Icon.plus}</span> تسجيل طالب جديد بالمجموعة
          </h3>
          <form onSubmit={handleQuickAdd}>
            <div className="form-group">
              <label className="form-label">اسم الطالب *</label>
              <input 
                className="form-control" 
                value={newStudentName} 
                onChange={e => setNewStudentName(e.target.value)} 
                placeholder="الاسم الكامل للطالب" 
                required 
              />
            </div>
            <div className="form-group">
              <label className="form-label">رقم هاتف الطالب (اختياري)</label>
              <input 
                className="form-control" 
                value={newStudentPhone} 
                onChange={e => setNewStudentPhone(e.target.value)} 
                placeholder="01xxxxxxxxx" 
              />
            </div>
            <div className="form-group">
              <label className="form-label">رقم هاتف ولي الأمر (اختياري)</label>
              <input 
                className="form-control" 
                value={newStudentParentPhone} 
                onChange={e => setNewStudentParentPhone(e.target.value)} 
                placeholder="01xxxxxxxxx" 
              />
            </div>
            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ width: '100%', marginTop: '0.5rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
              disabled={quickAddLoading}
            >
              {quickAddLoading ? 'جاري الحفظ...' : (
                <>
                  <span style={{ display: 'inline-flex' }}>{Icon.check}</span> إضافة وتسجيل الطالب
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// GROUPS VIEW
// ============================================================
function GroupsView({ groups, allStudents, onRefresh }) {
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const toast = useToast();

  const handleDelete = async (g) => {
    setConfirm({
      message: `هل أنت متأكد من حذف المجموعة "${g.name}"؟ سيتم حذف جميع الطلاب المنتسبين إليها أيضاً.`,
      onConfirm: async () => {
        await deleteGroup(g.id);
        toast('تم حذف المجموعة والطلاب المرتبطين بها', 'error');
        setConfirm(null);
        onRefresh();
      }
    });
  };

  const handleCardClick = (e, groupId) => {
    // Prevent navigating to details when clicking action buttons
    if (e.target.closest('.btn-icon') || e.target.closest('button')) {
      return;
    }
    setSelectedGroupId(groupId);
  };

  if (selectedGroupId) {
    return (
      <GroupDetailSubView
        groupId={selectedGroupId}
        groups={groups}
        allStudents={allStudents}
        onRefresh={onRefresh}
        onBack={() => setSelectedGroupId(null)}
      />
    );
  }

  const currentMonth = new Date().toISOString().slice(0, 7);

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title">المجموعات</h1>
          <p className="page-subtitle">إدارة مجموعات المراكز والخصوصي</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingGroup(null); setShowModal(true); }}>
          {Icon.plus} مجموعة جديدة
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon" style={{ color: 'var(--primary)', display: 'flex', justifyContent: 'center' }}>{Icon.group}</div>
          <h3>لا توجد مجموعات بعد</h3>
          <p>ابدأ بإنشاء أول مجموعة لك</p>
          <button className="btn btn-primary" onClick={() => { setEditingGroup(null); setShowModal(true); }}>
            {Icon.plus} إنشاء مجموعة
          </button>
        </div>
      ) : (
        <div className="cards-grid">
          {groups.map(g => {
            const students = allStudents.filter(s => s.group_id === g.id);
            const paidStudents = students.filter(s => 
              (s.payments || []).some(p => p.month === currentMonth && p.status === 'paid')
            );
            const collectionPct = students.length ? ((paidStudents.length / students.length) * 100).toFixed(0) : 0;

            return (
              <div key={g.id} className="group-card" onClick={(e) => handleCardClick(e, g.id)}>
                <div className="group-card-header">
                  <div className={`group-card-avatar ${g.type === 'center' ? 'center-type' : 'private-type'}`} style={{ color: g.type === 'center' ? 'var(--success)' : 'var(--primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {g.type === 'center' ? Icon.center : Icon.private}
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button className="btn-icon" onClick={() => { setEditingGroup(g); setShowModal(true); }} title="تعديل">
                      {Icon.edit}
                    </button>
                    <button className="btn-icon" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(g)} title="حذف">
                      {Icon.trash}
                    </button>
                  </div>
                </div>
                <div className="group-card-title">{g.name}</div>
                <div className="group-card-meta">
                  <span className={`badge badge-${g.type === 'center' ? 'center' : 'private'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    {g.type === 'center' ? (
                      <>
                        <span style={{ display: 'inline-flex' }}>{Icon.center}</span> سنتر
                      </>
                    ) : (
                      <>
                        <span style={{ display: 'inline-flex' }}>{Icon.private}</span> خصوصي
                      </>
                    )}
                  </span>
                </div>
                {g.schedule && (
                  <div style={{ marginTop: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ display: 'inline-flex', color: 'var(--primary)' }}>{Icon.calendar}</span> {g.schedule}
                  </div>
                )}
                <div className="group-stats">
                  <div className="group-stat">
                    <div className="group-stat-value" style={{ color: 'var(--primary)' }}>{students.length}</div>
                    <div className="group-stat-label">طالب</div>
                  </div>
                  <div className="group-stat">
                    <div className="group-stat-value" style={{ color: 'var(--success)' }}>{formatCurrency(g.price)}</div>
                    <div className="group-stat-label">فلوس الشهر</div>
                  </div>
                </div>
                {students.length > 0 && (
                  <div style={{ marginTop: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 600 }}>
                      <span>تم تحصيل فلوس الشهر</span>
                      <span style={{ color: 'var(--success)' }}>{collectionPct}%</span>
                    </div>
                    <div className="progress-bar-track" style={{ height: '4px' }}>
                      <div className="progress-bar-fill" style={{ width: `${collectionPct}%`, background: 'var(--success)' }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <GroupFormModal
          group={editingGroup}
          allGroups={groups}
          onSave={() => { setShowModal(false); onRefresh(); }}
          onClose={() => setShowModal(false)}
        />
      )}
      {confirm && <ConfirmDialog message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}
    </div>
  );
}

// ============================================================
// STUDENT FORM MODAL
// ============================================================
function StudentFormModal({ student, groups, onSave, onClose }) {
  const [form, setForm] = useState({
    name: student?.name || '',
    group_id: student?.group_id || groups[0]?.id || '',
    phone: student?.phone || '',
    parent_phone: student?.parent_phone || '',
    status: student?.status || 'active',
    notes: student?.notes || '',
  });
  const toast = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast('يرجى إدخال اسم الطالب', 'error'); return; }
    if (!form.group_id) { toast('يرجى اختيار المجموعة', 'error'); return; }
    const data = {
      ...student,
      ...form,
      id: student?.id || genId(),
      payments: student?.payments || [],
      grades: student?.grades || [],
      attendance: student?.attendance || [],
    };
    await saveStudent(data);
    toast(student ? 'تم تعديل بيانات الطالب' : 'تم إضافة الطالب بنجاح', 'success');
    onSave(data);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {student ? (
              <>
                <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginLeft: '0.4rem', color: 'var(--primary)' }}>{Icon.edit}</span> تعديل بيانات الطالب
              </>
            ) : (
              <>
                <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginLeft: '0.4rem', color: 'var(--primary)' }}>{Icon.plus}</span> إضافة طالب جديد
              </>
            )}
          </h3>
          <button className="btn-icon" onClick={onClose}>{Icon.close}</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">اسم الطالب *</label>
              <input className="form-control" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="الاسم الكامل" />
            </div>
            <div className="form-group">
              <label className="form-label">المجموعة *</label>
              <select className="form-control" value={form.group_id} onChange={e => setForm({...form, group_id: e.target.value})}>
                <option value="">-- اختر المجموعة --</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">رقم الهاتف</label>
                <input className="form-control" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="01x xxxxxxx" />
              </div>
              <div className="form-group">
                <label className="form-label">هاتف ولي الأمر</label>
                <input className="form-control" value={form.parent_phone} onChange={e => setForm({...form, parent_phone: e.target.value})} placeholder="01x xxxxxxx" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">ملاحظات</label>
              <textarea className="form-control" rows={3} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="أي ملاحظات إضافية..." />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>إلغاء</button>
            <button type="submit" className="btn btn-primary">{student ? 'حفظ التعديلات' : 'إضافة الطالب'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// STUDENT DETAIL MODAL
// ============================================================
function StudentDetailModal({ student, groups, onUpdate, onClose }) {
  const [tab, setTab] = useState('info');
  const [st, setSt] = useState(student);
  const [payForm, setPayForm] = useState({ month: today().slice(0, 7), amount: '', status: 'paid', note: '' });
  const toast = useToast();
  const group = groups.find(g => g.id === st.group_id);

  const save = async (updated) => {
    setSt(updated);
    await saveStudent(updated);
    onUpdate(updated);
  };

  const addPayment = async () => {
    if (!payForm.amount) { toast('أدخل المبلغ', 'error'); return; }
    const updated = { ...st, payments: [...(st.payments || []), { ...payForm, id: genId(), amount: Number(payForm.amount) }] };
    await save(updated);
    setPayForm({ month: today().slice(0, 7), amount: '', status: 'paid', note: '' });
    toast('تم تسجيل الدفعة', 'success');
  };

  const deletePayment = async (id) => {
    const updated = { ...st, payments: (st.payments || []).filter(p => p.id !== id) };
    await save(updated);
    toast('تم حذف الدفعة', 'info');
  };



  const totalPaid = (st.payments || []).filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="student-avatar" style={{ width: 48, height: 48, fontSize: '1.1rem' }}>{getInitials(st.name)}</div>
            <div>
              <h3 style={{ fontSize: '1.1rem' }}>{st.name}</h3>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {group?.name || '—'} · {st.phone || 'لا يوجد هاتف'}
              </span>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}>{Icon.close}</button>
        </div>

        <div style={{ padding: '1rem 1.5rem 0' }}>
          <div className="tabs">
            {[['info','معلومات'], ['payments','المدفوعات']].map(([id, label]) => (
              <button key={id} className={`tab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
        </div>

        <div className="modal-body">
          {tab === 'info' && (
            <div>
              <div className="info-grid">
                <div className="info-item"><label>الاسم</label><p>{st.name}</p></div>
                <div className="info-item"><label>المجموعة</label><p>{group?.name || '—'}</p></div>
                <div className="info-item"><label>الهاتف</label><p>{st.phone || '—'}</p></div>
                <div className="info-item"><label>هاتف ولي الأمر</label><p>{st.parent_phone || '—'}</p></div>
                <div className="info-item"><label>إجمالي المدفوع</label><p style={{ color: 'var(--success)' }}>{formatCurrency(totalPaid)}</p></div>
              </div>
              {st.notes && (
                <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: 8, color: 'var(--text-muted)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ display: 'inline-flex', color: 'var(--primary)' }}>{Icon.notes}</span> {st.notes}
                </div>
              )}
            </div>
          )}

          {tab === 'payments' && (
            <div>
              <div className="detail-section">
                <div className="detail-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ display: 'inline-flex', color: 'var(--primary)' }}>{Icon.payments}</span> تسجيل دفعة جديدة
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">الشهر</label>
                    <input type="month" className="form-control" value={payForm.month} onChange={e => setPayForm({...payForm, month: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">المبلغ (ج.م)</label>
                    <input type="number" className="form-control" value={payForm.amount} onChange={e => setPayForm({...payForm, amount: e.target.value})} placeholder={group?.price || 0} />
                  </div>
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">الحالة</label>
                    <select className="form-control" value={payForm.status} onChange={e => setPayForm({...payForm, status: e.target.value})}>
                      <option value="paid">مدفوع</option>
                      <option value="partial">جزئي</option>
                      <option value="unpaid">لم يدفع</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">ملاحظة</label>
                    <input className="form-control" value={payForm.note} onChange={e => setPayForm({...payForm, note: e.target.value})} placeholder="اختياري" />
                  </div>
                </div>
                <button className="btn btn-success btn-sm" onClick={addPayment} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ display: 'inline-flex' }}>{Icon.check}</span> تسجيل الدفعة
                </button>
              </div>

              {(st.payments || []).length === 0 ? (
                <p className="text-muted" style={{ textAlign: 'center', padding: '1.5rem' }}>لا توجد مدفوعات مسجلة</p>
              ) : (
                [...(st.payments || [])].reverse().map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: 8, marginBottom: '0.5rem', border: '1px solid var(--border-glass)' }}>
                    <div>
                      <span style={{ fontWeight: 700 }}>{p.month}</span>
                      {p.note && <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginRight: '0.5rem' }}>· {p.note}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontWeight: 700, color: 'var(--success)' }}>{formatCurrency(p.amount)}</span>
                      <span className={`payment-status ${p.status}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span style={{ display: 'inline-flex' }}>
                          {p.status === 'paid' ? Icon.check : p.status === 'partial' ? Icon.partial : Icon.cross}
                        </span>
                        {p.status === 'paid' ? 'مدفوع' : p.status === 'partial' ? 'جزئي' : 'لم يدفع'}
                      </span>
                      <button className="btn-icon" style={{ width: 28, height: 28, color: 'var(--danger)' }} onClick={() => deletePayment(p.id)}>{Icon.trash}</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}


        </div>
      </div>
    </div>
  );
}

// ============================================================
// STUDENTS VIEW
// ============================================================
function StudentsView({ groups, allStudents, onRefresh }) {
  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editSt, setEditSt] = useState(null);
  const [detailSt, setDetailSt] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const toast = useToast();

  const filtered = allStudents.filter(s => {
    const matchSearch = s.name.includes(search) || (s.phone || '').includes(search);
    const matchGroup = !filterGroup || s.group_id === filterGroup;
    return matchSearch && matchGroup;
  });

  const handleDelete = (s) => {
    setConfirm({
      message: `هل أنت متأكد من حذف الطالب "${s.name}"؟`,
      onConfirm: async () => {
        await deleteStudent(s.id);
        toast('تم حذف الطالب', 'error');
        setConfirm(null);
        onRefresh();
      }
    });
  };

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title">الطلاب</h1>
          <p className="page-subtitle">إجمالي {allStudents.length} طالب</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditSt(null); setShowAdd(true); }}>
          {Icon.plus} إضافة طالب
        </button>
      </div>

      <div className="search-bar">
        <div className="search-input-wrap">
          {Icon.search}
          <input className="search-input" placeholder="بحث بالاسم أو الهاتف..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-control" style={{ width: 'auto', minWidth: 160 }} value={filterGroup} onChange={e => setFilterGroup(e.target.value)}>
          <option value="">كل المجموعات</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon" style={{ color: 'var(--primary)', display: 'flex', justifyContent: 'center' }}>{Icon.student}</div>
          <h3>{search || filterGroup ? 'لا توجد نتائج' : 'لا يوجد طلاب بعد'}</h3>
          <p>{search ? 'جرب كلمة بحث أخرى' : 'أضف أول طالب لبدء التتبع'}</p>
          {!search && <button className="btn btn-primary" onClick={() => { setEditSt(null); setShowAdd(true); }}>{Icon.plus} إضافة طالب</button>}
        </div>
      ) : (
        <div className="table-wrapper students-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>الطالب</th>
                <th>المجموعة</th>
                <th>الهاتف</th>
                <th>المدفوع</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const group = groups.find(g => g.id === s.group_id);
                const totalPaid = (s.payments || []).filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);

                return (
                  <tr key={s.id}>
                    <td data-label="الطالب">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div className="student-avatar">{getInitials(s.name)}</div>
                        <span style={{ fontWeight: 600 }}>{s.name}</span>
                      </div>
                    </td>
                    <td data-label="المجموعة"><span style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>{group?.name || '—'}</span></td>
                    <td data-label="الهاتف"><span style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>{s.phone || '—'}</span></td>
                    <td data-label="المدفوع" style={{ color: 'var(--success)', fontWeight: 700, fontSize: '0.9rem' }}>{formatCurrency(totalPaid)}</td>
                    <td data-label="إجراءات">
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button className="btn-icon" style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setDetailSt(s)} title="التفاصيل">{Icon.eye}</button>
                        <button className="btn-icon" style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { setEditSt(s); setShowAdd(true); }} title="تعديل">{Icon.edit}</button>
                        <button className="btn-icon" style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)' }} onClick={() => handleDelete(s)} title="حذف">{Icon.trash}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <StudentFormModal
          student={editSt}
          groups={groups}
          onSave={() => { setShowAdd(false); onRefresh(); }}
          onClose={() => setShowAdd(false)}
        />
      )}
      {detailSt && (
        <StudentDetailModal
          student={detailSt}
          groups={groups}
          onUpdate={(updated) => { setDetailSt(updated); onRefresh(); }}
          onClose={() => setDetailSt(null)}
        />
      )}
      {confirm && <ConfirmDialog message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}
    </div>
  );
}

// ============================================================
// GRADES VIEW
// ============================================================
// eslint-disable-next-line no-unused-vars
function GradesView({ groups, allStudents, onRefresh }) {
  const [selectedGroup, setSelectedGroup] = useState(groups[0]?.id || '');
  const [examName, setExamName] = useState('');
  const [examDate, setExamDate] = useState(today());
  const [totalMark, setTotalMark] = useState('100');
  const [scores, setScores] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const groupStudents = allStudents.filter(s => s.group_id === selectedGroup);

  const handleSave = async () => {
    if (!examName.trim()) { toast('أدخل اسم الامتحان', 'error'); return; }
    if (!selectedGroup) { toast('اختر مجموعة', 'error'); return; }
    const entries = Object.entries(scores).filter(([, v]) => v !== '');
    if (entries.length === 0) { toast('لم تدخل أي درجات', 'warning'); return; }

    setSaving(true);
    for (const [studentId, score] of entries) {
      const s = allStudents.find(st => st.id === studentId);
      if (!s) continue;
      const grade = { id: genId(), exam: examName, score: Number(score), total: Number(totalMark), date: examDate };
      const updated = { ...s, grades: [...(s.grades || []), grade] };
      await saveStudent(updated);
    }
    toast(`تم حفظ درجات ${entries.length} طالب`, 'success');
    setSaving(false);
    setScores({});
    setExamName('');
    onRefresh();
  };

  const allGradesForGroup = groupStudents.flatMap(s =>
    (s.grades || []).map(g => ({ ...g, studentName: s.name }))
  );

  const exams = [...new Set(allGradesForGroup.map(g => g.exam))];

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title">الدرجات والامتحانات</h1>
          <p className="page-subtitle">تسجيل وتتبع نتائج الامتحانات</p>
        </div>
      </div>

      {/* Batch entry form */}
      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1.25rem', fontSize: '1rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ display: 'inline-flex', color: 'var(--primary)' }}>{Icon.exam}</span> إدخال درجات امتحان كامل
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">المجموعة</label>
            <select className="form-control" value={selectedGroup} onChange={e => { setSelectedGroup(e.target.value); setScores({}); }}>
              <option value="">-- اختر --</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">اسم الامتحان</label>
            <input className="form-control" value={examName} onChange={e => setExamName(e.target.value)} placeholder="مثال: Midterm Exam" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">الدرجة الكاملة</label>
            <input type="number" className="form-control" value={totalMark} onChange={e => setTotalMark(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">تاريخ الامتحان</label>
            <input type="date" className="form-control" value={examDate} onChange={e => setExamDate(e.target.value)} />
          </div>
        </div>

        {groupStudents.length > 0 ? (
          <>
            <div className="table-wrapper" style={{ marginBottom: '1rem' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>اسم الطالب</th>
                    <th style={{ width: 160 }}>الدرجة / {totalMark}</th>
                    <th>التقدير</th>
                  </tr>
                </thead>
                <tbody>
                  {groupStudents.map((s, i) => {
                    const val = scores[s.id] ?? '';
                    const pct = val !== '' ? ((Number(val) / Number(totalMark)) * 100) : null;
                    return (
                      <tr key={s.id}>
                        <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <div className="student-avatar" style={{ width: 30, height: 30, fontSize: '0.75rem' }}>{getInitials(s.name)}</div>
                            {s.name}
                          </div>
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max={totalMark}
                            className="form-control"
                            style={{ width: 120, padding: '0.4rem 0.75rem' }}
                            placeholder="—"
                            value={val}
                            onChange={e => setScores({ ...scores, [s.id]: e.target.value })}
                          />
                        </td>
                        <td>
                          {pct !== null
                            ? <span className={`grade-badge ${gradeClass(pct, 100)}`}>{gradeLabel(pct, 100)} · {pct.toFixed(0)}%</span>
                            : <span className="text-muted">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              {saving ? 'جاري الحفظ...' : (
                <>
                  <span style={{ display: 'inline-flex' }}>{Icon.check}</span> حفظ درجات {Object.values(scores).filter(v => v !== '').length} طالب
                </>
              )}
            </button>
          </>
        ) : selectedGroup ? (
          <p className="text-muted">لا يوجد طلاب في هذه المجموعة</p>
        ) : null}
      </div>

      {/* Previous exams results */}
      {exams.length > 0 && (
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ display: 'inline-flex', color: 'var(--primary)' }}>{Icon.chart}</span> نتائج الامتحانات السابقة
          </h3>
          {exams.map(exam => {
            const examGrades = allGradesForGroup.filter(g => g.exam === exam);
            const avg = examGrades.reduce((s, g) => s + (g.score / g.total) * 100, 0) / examGrades.length;
            const maxG = Math.max(...examGrades.map(g => (g.score / g.total) * 100));
            const minG = Math.min(...examGrades.map(g => (g.score / g.total) * 100));
            const failCount = examGrades.filter(g => (g.score / g.total) * 100 < 50).length;
            return (
              <div key={exam} className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ display: 'inline-flex', color: 'var(--primary)' }}>{Icon.exam}</span> {exam}
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--success)' }}>متوسط: {avg.toFixed(0)}%</span>
                    <span style={{ color: 'var(--primary)' }}>أعلى: {maxG.toFixed(0)}%</span>
                    <span style={{ color: 'var(--warning)' }}>أدنى: {minG.toFixed(0)}%</span>
                    {failCount > 0 && <span style={{ color: 'var(--danger)' }}>راسب: {failCount}</span>}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                  {examGrades.map(g => (
                    <div key={g.id + g.studentName} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid var(--border-glass)' }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>{g.studentName}</span>
                      <span className={`grade-badge ${gradeClass(g.score, g.total)}`} style={{ fontSize: '0.82rem' }}>{g.score}/{g.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// PAYMENTS VIEW
// ============================================================
function PaymentsView({ groups, allStudents, onRefresh }) {
  const [filterMonth, setFilterMonth] = useState(today().slice(0, 7));
  const [filterGroup, setFilterGroup] = useState('');

  const filteredStudents = allStudents.filter(s => !filterGroup || s.group_id === filterGroup);

  const monthPayments = filteredStudents.map(s => {
    const group = groups.find(g => g.id === s.group_id);
    const monthPay = (s.payments || []).find(p => p.month === filterMonth);
    return { student: s, group, payment: monthPay, expected: group?.price || 0 };
  });

  const totalExpected = monthPayments.reduce((sum, r) => sum + r.expected, 0);
  const totalPaid = monthPayments.reduce((sum, r) => sum + (r.payment?.status === 'paid' ? r.payment.amount : r.payment?.status === 'partial' ? r.payment.amount : 0), 0);
  const paidCount = monthPayments.filter(r => r.payment?.status === 'paid').length;
  const unpaidCount = monthPayments.filter(r => !r.payment || r.payment.status === 'unpaid').length;
  const paidPct = totalExpected > 0 ? (totalPaid / totalExpected) * 100 : 0;

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title">المالية والمدفوعات</h1>
          <p className="page-subtitle">تتبع المدفوعات الشهرية</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="payments-filters">
        <div className="form-group">
          <label className="form-label">الشهر</label>
          <input type="month" className="form-control" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">المجموعة</label>
          <select className="form-control" value={filterGroup} onChange={e => setFilterGroup(e.target.value)}>
            <option value="">كل المجموعات</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card green">
          <div className="stat-icon green" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.check}</div>
          <div className="stat-value" style={{ color: 'var(--success)', fontSize: '1.5rem' }}>{formatCurrency(totalPaid)}</div>
          <div className="stat-label">تم التحصيل</div>
          <div className="stat-meta"><span>{paidCount} طالب دفع ({paidPct.toFixed(0)}%)</span></div>
        </div>
        <div className="stat-card amber">
          <div className="stat-icon amber" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.cross}</div>
          <div className="stat-value" style={{ color: 'var(--danger)', fontSize: '1.5rem' }}>{formatCurrency(totalExpected - totalPaid)}</div>
          <div className="stat-label">المتبقي</div>
          <div className="stat-meta"><span>{unpaidCount} طالب لم يدفع</span></div>
        </div>
      </div>

      {monthPayments.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon" style={{ color: 'var(--primary)', display: 'flex', justifyContent: 'center' }}>{Icon.payments}</div>
          <h3>لا يوجد طلاب</h3>
        </div>
      ) : (
        <div className="table-wrapper payments-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>الطالب</th>
                <th>المجموعة</th>
                <th>المستحق</th>
                <th>المدفوع</th>
                <th>الحالة</th>
                <th>ملاحظة</th>
              </tr>
            </thead>
            <tbody>
              {monthPayments.map(({ student: s, group, payment, expected }) => (
                <tr key={s.id}>
                  <td data-label="الطالب">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <div className="student-avatar" style={{ width: 32, height: 32, fontSize: '0.8rem' }}>{getInitials(s.name)}</div>
                      <span style={{ fontWeight: 600 }}>{s.name}</span>
                    </div>
                  </td>
                  <td data-label="المجموعة"><span style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>{group?.name || '—'}</span></td>
                  <td data-label="المستحق" style={{ fontWeight: 600 }}>{formatCurrency(expected)}</td>
                  <td data-label="المدفوع" style={{ color: 'var(--success)', fontWeight: 700 }}>
                    {payment ? formatCurrency(payment.amount) : '—'}
                  </td>
                  <td data-label="الحالة">
                    {payment ? (
                      <span className={`payment-status ${payment.status}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span style={{ display: 'inline-flex' }}>
                          {payment.status === 'paid' ? Icon.check : payment.status === 'partial' ? Icon.partial : Icon.cross}
                        </span>
                        {payment.status === 'paid' ? 'مدفوع' : payment.status === 'partial' ? 'جزئي' : 'لم يدفع'}
                      </span>
                    ) : (
                      <span className="payment-status unpaid" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span style={{ display: 'inline-flex' }}>{Icon.cross}</span> لم يدفع
                      </span>
                    )}
                  </td>
                  <td data-label="ملاحظة"><span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{payment?.note || '—'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SETTINGS VIEW
// ============================================================
// eslint-disable-next-line no-unused-vars
function SettingsView({ cloudMode, onCloudChange }) {
  const [fbConfig, setFbConfig] = useState({ apiKey:'', authDomain:'', projectId:'', storageBucket:'', messagingSenderId:'', appId:'' });
  const [syncLoading, setSyncLoading] = useState(false);
  const toast = useToast();

  const handleSync = async () => {
    if (!fbConfig.apiKey || !fbConfig.projectId) { toast('يرجى ملء حقل API Key وProject ID على الأقل', 'error'); return; }
    setSyncLoading(true);
    try {
      await syncLocalToCloud(fbConfig);
      onCloudChange(true);
      toast('تم الاتصال بالسحابة ونقل البيانات بنجاح! ☁️', 'success');
    } catch (e) {
      toast('فشل الاتصال: ' + e.message, 'error');
    }
    setSyncLoading(false);
  };

  const handleDisconnect = () => {
    disconnectCloud();
    onCloudChange(false);
    toast('تم قطع الاتصال بالسحابة، البيانات محفوظة محلياً', 'info');
  };

  const handleExport = async () => {
    try {
      const data = await exportBackupData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `teacher-backup-${today()}.json`; a.click();
      URL.revokeObjectURL(url);
      toast('تم تصدير النسخة الاحتياطية بنجاح', 'success');
    } catch (e) { toast('فشل التصدير', 'error'); }
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const json = JSON.parse(ev.target.result);
        const result = await importBackupData(json);
        toast(`تم الاستيراد: ${result.groupsCount} مجموعة، ${result.studentsCount} طالب`, 'success');
        window.location.reload();
      } catch (e) { toast('ملف غير صالح: ' + e.message, 'error'); }
    };
    reader.readAsText(file);
  };

  const fields = [
    { key: 'apiKey', label: 'API Key', placeholder: 'AIza...' },
    { key: 'authDomain', label: 'Auth Domain', placeholder: 'project.firebaseapp.com' },
    { key: 'projectId', label: 'Project ID', placeholder: 'my-project' },
    { key: 'storageBucket', label: 'Storage Bucket', placeholder: 'project.appspot.com' },
    { key: 'messagingSenderId', label: 'Messaging Sender ID', placeholder: '123456789' },
    { key: 'appId', label: 'App ID', placeholder: '1:123:web:abc' },
  ];

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title">الإعدادات</h1>
          <p className="page-subtitle">إدارة البيانات والمزامنة السحابية</p>
        </div>
      </div>

      {/* Cloud Sync */}
      <div className="settings-section">
        <div className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ display: 'inline-flex', color: 'var(--primary)' }}>{Icon.cloud}</span> المزامنة السحابية (Firebase)
          {cloudMode && <span className="badge badge-center" style={{ marginRight: '0.5rem' }}>متصل</span>}
        </div>

        {cloudMode ? (
          <div>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', fontSize: '0.93rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ display: 'inline-flex', color: 'var(--success)' }}>{Icon.check}</span> أنت متصل بالسحابة. بياناتك تُحفظ تلقائياً في Firestore.
            </p>
            <button className="btn btn-danger" onClick={handleDisconnect}>قطع الاتصال والرجوع للتخزين المحلي</button>
          </div>
        ) : (
          <div>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.7, fontSize: '0.93rem' }}>
              أدخل بيانات مشروع Firebase الخاص بك لتفعيل المزامنة السحابية. سيتم نقل كل بياناتك المحلية تلقائياً.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              {fields.map(f => (
                <div key={f.key} className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">{f.label}</label>
                  <input className="form-control" placeholder={f.placeholder} value={fbConfig[f.key]} onChange={e => setFbConfig({ ...fbConfig, [f.key]: e.target.value })} />
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={handleSync} disabled={syncLoading} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              {syncLoading ? 'جاري الاتصال والمزامنة...' : (
                <>
                  <span style={{ display: 'inline-flex' }}>{Icon.cloud}</span> اتصل بالسحابة وانقل البيانات
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Backup */}
      <div className="settings-section">
        <div className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ display: 'inline-flex', color: 'var(--primary)' }}>{Icon.download}</span> النسخ الاحتياطي والاستيراد
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleExport} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ display: 'inline-flex' }}>{Icon.download}</span> تصدير نسخة احتياطية (JSON)
          </button>
          <label className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ display: 'inline-flex' }}>{Icon.upload}</span> استيراد نسخة احتياطية
            <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
          </label>
        </div>
        <p style={{ color: 'var(--text-muted)', marginTop: '0.75rem', fontSize: '0.85rem' }}>
          يمكنك تصدير كل بياناتك كملف JSON للحفاظ عليها، ثم استيرادها في أي وقت.
        </p>
      </div>

      {/* About */}
      <div className="settings-section">
        <div className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ display: 'inline-flex', color: 'var(--primary)' }}>{Icon.info}</span> عن النظام
        </div>
        <div style={{ color: 'var(--text-muted)', lineHeight: 2.2, fontSize: '0.93rem' }}>
          <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ display: 'inline-flex', color: 'var(--primary)' }}>{Icon.student}</span> 
            <strong style={{ color: 'var(--text-main)' }}>سيستم مس الاء رمضان</strong> — لوحة تحكم ذكية لإدارة الطلاب والمجموعات
          </p>
          <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ display: 'inline-flex', color: 'var(--primary)' }}>{Icon.download}</span> 
            <span>التخزين: IndexedDB (محلي) + Firebase Firestore (سحابي اختياري)</span>
          </p>
          <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ display: 'inline-flex', color: 'var(--primary)' }}>{Icon.flash}</span> 
            <span>بُني بـ React.js مع دعم كامل للغة العربية</span>
          </p>
          <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ display: 'inline-flex', color: 'var(--primary)' }}>{Icon.lock}</span> 
            <span>لا يوجد تسجيل دخول — بياناتك خاصة بك فقط</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// FOOTER
// ============================================================
function AppFooter() {
  return (
    <footer className="app-footer">
      <div className="footer-content">
        <span>Developed by <strong className="developer-name">Mohamed Moaaz</strong></span>
        <span className="footer-separator">|</span>
        <span className="developer-phone">Phone: 01025707335</span>
      </div>
    </footer>
  );
}

// ============================================================
// MAIN APP
// ============================================================
function AppInner() {
  const [activeView, setActiveView] = useState('groups');
  const [groups, setGroups] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line no-unused-vars
  const [cloudMode, setCloudMode] = useState(isCloudMode());

  const loadData = useCallback(async () => {
    try {
      const grps = await getGroups();
      const students = [];
      for (const g of grps) {
        const sts = await getStudents(g.id);
        students.push(...sts);
      }
      setGroups(grps);
      setAllStudents(students);
    } catch (e) {
      console.error('Failed to load data', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ width: 48, height: 48, border: '3px solid var(--primary-light)', borderTop: '3px solid var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: 'var(--text-muted)' }}>جاري تحميل البيانات...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const views = {
    dashboard: <CalendarView groups={groups} allStudents={allStudents} setActiveView={setActiveView} />,
    groups: <GroupsView groups={groups} allStudents={allStudents} onRefresh={loadData} />,
    students: <StudentsView groups={groups} allStudents={allStudents} onRefresh={loadData} />,
    payments: <PaymentsView groups={groups} allStudents={allStudents} onRefresh={loadData} />,
  };

  return (
    <div className="app-container">
      <Sidebar activeView={activeView} setActiveView={setActiveView} cloudMode={cloudMode} />
      <main className="main-content">
        {views[activeView]}
        <AppFooter />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
