import React, { Suspense } from 'react';
import { Shield, BarChart3, Users, Activity, Server, ScrollText, Ticket, Headset } from 'lucide-react';
import { useTabParam } from '../hooks/useTabParams';

const AdminDashboard = React.lazy(() => import('./admin/AdminDashboard'));
const AdminUsers = React.lazy(() => import('./admin/AdminUsers'));
const AdminActivity = React.lazy(() => import('./admin/AdminActivity'));
const AdminSystemHealth = React.lazy(() => import('./admin/AdminSystemHealth'));
const AdminAuditLog = React.lazy(() => import('./admin/AdminAuditLog'));
const AdminCoupons = React.lazy(() => import('./admin/AdminCoupons'));
const AdminSupportTickets = React.lazy(() => import('./admin/AdminSupportTickets'));

type AdminTab = 'overview' | 'users' | 'activity' | 'system' | 'audit' | 'coupons' | 'support';
const ADMIN_TABS = ['overview', 'users', 'activity', 'system', 'audit', 'coupons', 'support'] as const;

const tabs: { id: AdminTab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'system', label: 'System Health', icon: Server },
  { id: 'audit', label: 'Audit Log', icon: ScrollText },
  { id: 'coupons', label: 'Coupons', icon: Ticket },
  { id: 'support', label: 'Support', icon: Headset },
];

function TabSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-28 bg-white rounded-xl border border-slate-200" />
        ))}
      </div>
      <div className="h-64 bg-white rounded-xl border border-slate-200" />
    </div>
  );
}

export function AdminPage() {
  const [activeTab, setActiveTab] = useTabParam<AdminTab>('tab', 'overview', ADMIN_TABS);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-6 sm:py-8">
      {/* Page Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-gradient-to-br from-red-600 to-rose-600 p-2.5 rounded-xl shadow-md">
            <Shield className="h-6 w-6 text-white" strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Admin Console</h1>
            <p className="text-sm sm:text-base text-slate-600">System metrics, user management, and diagnostics</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto scrollbar-hide">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <Suspense fallback={<TabSkeleton />}>
        {activeTab === 'overview' && <AdminDashboard />}
        {activeTab === 'users' && <AdminUsers />}
        {activeTab === 'activity' && <AdminActivity />}
        {activeTab === 'system' && <AdminSystemHealth />}
        {activeTab === 'audit' && <AdminAuditLog />}
        {activeTab === 'coupons' && <AdminCoupons />}
        {activeTab === 'support' && <AdminSupportTickets />}
      </Suspense>
    </div>
  );
}

export default AdminPage;
