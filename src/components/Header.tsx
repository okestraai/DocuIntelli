import React from 'react';
import { Scale, FileText, Calendar, LayoutDashboard, LogOut, User, Bell } from 'lucide-react';
import type { Page } from '../App';

interface HeaderProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onSignOut: () => void;
  onOpenProfile: () => void;
  onOpenNotifications: () => void;
  notificationCount?: number;
}

export function Header({ currentPage, onNavigate, onSignOut, onOpenProfile, onOpenNotifications, notificationCount }: HeaderProps) {
  const navItems = [
    { id: 'dashboard' as Page, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'vault' as Page, label: 'Document Vault', icon: FileText },
    { id: 'tracker' as Page, label: 'Expiration Tracker', icon: Calendar }
  ];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50 backdrop-blur-sm bg-white/95">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6">
        <div className="flex items-center justify-between h-16 sm:h-18">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex-shrink-0 bg-gradient-to-br from-emerald-600 to-teal-600 p-2 sm:p-2.5 rounded-lg shadow-sm">
              <Scale className="h-5 w-5 sm:h-6 sm:w-6 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight truncate">LegalEase</span>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => onNavigate(id)}
                  className={`group relative flex items-center justify-center p-2.5 rounded-lg transition-all duration-200 ${
                    currentPage === id
                      ? 'bg-emerald-50 text-emerald-700 shadow-sm'
                      : 'text-slate-600 hover:text-emerald-700 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="h-5 w-5" strokeWidth={2} />
                  <span className="absolute top-full mt-2 px-2.5 py-1.5 bg-slate-900 text-white text-sm font-medium rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                    {label}
                  </span>
                </button>
              ))}
            </nav>

            <div className="hidden md:block h-6 w-px bg-slate-200 mx-1"></div>

            <button
              onClick={onOpenNotifications}
              className="group relative flex items-center justify-center p-2.5 text-slate-600 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition-all duration-200"
            >
              <Bell className="h-5 w-5" strokeWidth={2} />
              {notificationCount && notificationCount > 0 && (
                <span className="absolute top-1 right-1 bg-red-500 text-white text-xs font-bold rounded-full h-4 w-4 flex items-center justify-center shadow-sm">
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
              <span className="absolute top-full mt-2 right-0 px-2.5 py-1.5 bg-slate-900 text-white text-sm font-medium rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                Notifications
              </span>
            </button>

            <button
              onClick={onOpenProfile}
              className="group relative flex items-center justify-center p-2.5 text-slate-600 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition-all duration-200"
            >
              <User className="h-5 w-5" strokeWidth={2} />
              <span className="absolute top-full mt-2 right-0 px-2.5 py-1.5 bg-slate-900 text-white text-sm font-medium rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                Profile
              </span>
            </button>

            <button
              onClick={onSignOut}
              className="group relative flex items-center justify-center p-2.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
            >
              <LogOut className="h-5 w-5" strokeWidth={2} />
              <span className="absolute top-full mt-2 right-0 px-2.5 py-1.5 bg-slate-900 text-white text-sm font-medium rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                Sign Out
              </span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}