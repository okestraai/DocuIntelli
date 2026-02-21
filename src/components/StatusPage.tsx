import { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle, Clock, XCircle, RefreshCw } from 'lucide-react';

interface StatusPageProps {
  onBack: () => void;
}

type ServiceState = 'operational' | 'degraded' | 'down' | 'loading';

interface ServiceStatus {
  name: string;
  description: string;
  status: ServiceState;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export function StatusPage({ onBack }: StatusPageProps) {
  const [services, setServices] = useState<ServiceStatus[]>([
    { name: 'Web Application', description: 'Frontend application and user interface', status: 'operational' },
    { name: 'API Server', description: 'Backend API for uploads, subscriptions, and data', status: 'loading' },
    { name: 'Redis Cache', description: 'Distributed caching and rate limiting', status: 'loading' },
    { name: 'Document Storage', description: 'Supabase file storage for uploaded documents', status: 'operational' },
    { name: 'Database', description: 'PostgreSQL database for metadata, subscriptions, and usage', status: 'operational' },
    { name: 'AI Chat & Analysis', description: 'vLLM-powered document Q&A and analysis', status: 'operational' },
    { name: 'Embedding Generation', description: 'Vector embedding pipeline for document search', status: 'operational' },
    { name: 'Authentication', description: 'Supabase Auth for sign-in and session management', status: 'operational' },
    { name: 'Payment Processing', description: 'Stripe billing, checkout, and subscription management', status: 'operational' },
    { name: 'Email Notifications', description: 'Mailjet-powered transactional emails and alerts', status: 'operational' },
    { name: 'Scheduled Jobs', description: 'Cron jobs for resets, cleanups, and automated tasks', status: 'operational' },
  ]);
  const [lastChecked, setLastChecked] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const checkHealth = async () => {
    setIsRefreshing(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${API_BASE}/api/health`, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        setServices(prev => prev.map(s => {
          if (s.name === 'API Server') return { ...s, status: 'operational' as ServiceState };
          if (s.name === 'Redis Cache') return { ...s, status: data.redis === 'connected' ? 'operational' as ServiceState : 'degraded' as ServiceState };
          return s;
        }));
      } else {
        setServices(prev => prev.map(s => {
          if (s.name === 'API Server') return { ...s, status: 'degraded' as ServiceState };
          if (s.name === 'Redis Cache') return { ...s, status: 'degraded' as ServiceState };
          return s;
        }));
      }
    } catch {
      setServices(prev => prev.map(s => {
        if (s.name === 'API Server') return { ...s, status: 'down' as ServiceState };
        if (s.name === 'Redis Cache') return { ...s, status: 'down' as ServiceState };
        return s;
      }));
    } finally {
      setLastChecked(new Date());
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  const allOperational = services.every(s => s.status === 'operational');
  const anyDown = services.some(s => s.status === 'down');

  function statusIndicator(status: ServiceState) {
    switch (status) {
      case 'operational':
        return (
          <>
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
            <span className="text-sm font-medium text-emerald-700">Operational</span>
          </>
        );
      case 'degraded':
        return (
          <>
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span>
            <span className="text-sm font-medium text-amber-700">Degraded</span>
          </>
        );
      case 'down':
        return (
          <>
            <span className="h-2.5 w-2.5 rounded-full bg-red-500"></span>
            <span className="text-sm font-medium text-red-700">Down</span>
          </>
        );
      case 'loading':
        return (
          <>
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300 animate-pulse"></span>
            <span className="text-sm font-medium text-slate-500">Checking...</span>
          </>
        );
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      <div className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-700 hover:text-emerald-600 font-medium transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Back</span>
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3">System Status</h1>
          <p className="text-lg text-slate-600">Current operational status of DocuIntelli AI services</p>
        </div>

        {/* Overall status banner */}
        <div className={`rounded-2xl p-6 mb-8 text-center ${
          allOperational
            ? 'bg-emerald-50 border border-emerald-200'
            : anyDown
              ? 'bg-red-50 border border-red-200'
              : 'bg-amber-50 border border-amber-200'
        }`}>
          <div className="flex items-center justify-center gap-2 mb-1">
            {allOperational ? (
              <CheckCircle className="h-6 w-6 text-emerald-600" />
            ) : anyDown ? (
              <XCircle className="h-6 w-6 text-red-600" />
            ) : (
              <Clock className="h-6 w-6 text-amber-600" />
            )}
            <span className={`text-xl font-bold ${
              allOperational ? 'text-emerald-800' : anyDown ? 'text-red-800' : 'text-amber-800'
            }`}>
              {allOperational ? 'All Systems Operational' : anyDown ? 'Service Outage Detected' : 'Some Services Degraded'}
            </span>
          </div>
          <div className="flex items-center justify-center gap-3 mt-2">
            <p className={`text-sm ${allOperational ? 'text-emerald-600' : anyDown ? 'text-red-600' : 'text-amber-600'}`}>
              Last checked: {lastChecked.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
            <button
              onClick={checkHealth}
              disabled={isRefreshing}
              className="text-sm text-slate-500 hover:text-emerald-600 transition-colors disabled:opacity-50"
              title="Refresh status"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Service list */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
          {services.map((service, idx) => (
            <div key={idx} className="flex items-center justify-between px-6 py-4">
              <div>
                <h3 className="font-medium text-slate-900">{service.name}</h3>
                <p className="text-sm text-slate-500">{service.description}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                {statusIndicator(service.status)}
              </div>
            </div>
          ))}
        </div>

        {/* Uptime note */}
        <div className="mt-8 text-center">
          <p className="text-sm text-slate-500">
            Having issues? Contact us at{' '}
            <a href="mailto:support@docuintelli.com" className="text-emerald-600 hover:text-emerald-700 underline">
              support@docuintelli.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
