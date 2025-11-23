import React from 'react';
import { Shield, FileText, Calendar, LayoutDashboard, LogOut, User, Bell } from 'lucide-react';
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
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-3">
              <Shield className="h-10 w-10 text-blue-600" />
              <span className="text-3xl font-bold text-gray-900">LegalEase</span>
            </div>

            <nav className="hidden md:flex space-x-2">
              {navItems.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => onNavigate(id)}
                  className={`group relative flex items-center justify-center p-3 rounded-lg transition-all ${
                    currentPage === id
                      ? 'bg-blue-100 text-blue-600'
                      : 'text-gray-600 hover:text-blue-600 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  <span className="absolute top-full mt-2 px-3 py-1.5 bg-blue-600 text-white text-base font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                    {label}
                  </span>
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center space-x-2">
            <div className="h-8 w-px bg-gray-300 mx-2"></div>

            <button
              onClick={onOpenNotifications}
              className="group relative flex items-center justify-center p-3 text-gray-600 hover:text-blue-600 hover:bg-gray-100 rounded-lg transition-all"
            >
              <Bell className="h-6 w-6" />
              {notificationCount && notificationCount > 0 && (
                <span className="absolute top-1.5 right-1.5 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
              <span className="absolute top-full mt-2 right-0 px-3 py-1.5 bg-blue-600 text-white text-base font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                Notifications
              </span>
            </button>

            <button
              onClick={onOpenProfile}
              className="group relative flex items-center justify-center p-3 text-gray-600 hover:text-blue-600 hover:bg-gray-100 rounded-lg transition-all"
            >
              <User className="h-6 w-6" />
              <span className="absolute top-full mt-2 right-0 px-3 py-1.5 bg-blue-600 text-white text-base font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                Profile
              </span>
            </button>

            <button
              onClick={onSignOut}
              className="group relative flex items-center justify-center p-3 text-gray-600 hover:text-blue-600 hover:bg-gray-100 rounded-lg transition-all"
            >
              <LogOut className="h-6 w-6" />
              <span className="absolute top-full mt-2 right-0 px-3 py-1.5 bg-blue-600 text-white text-base font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                Sign Out
              </span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}