import React, { useState } from 'react';
import { Calendar, AlertTriangle, Clock, CheckCircle, Filter, Bell } from 'lucide-react';
import type { Document } from '../App';
import { formatUTCDate } from '../lib/dateUtils';

interface ExpirationTrackerProps {
  documents: Document[];
}

export function ExpirationTracker({ documents }: ExpirationTrackerProps) {
  const [filter, setFilter] = useState<'all' | 'expiring' | 'expired'>('all');

  const today = new Date();
  const thirtyDaysFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));

  const getDocumentStatus = (doc: Document) => {
    if (!doc.expirationDate) return 'no-date';
    
    const expirationDate = new Date(doc.expirationDate);
    if (expirationDate < today) return 'expired';
    if (expirationDate <= thirtyDaysFromNow) return 'expiring';
    return 'active';
  };

  const documentsWithDates = documents.filter(doc => doc.expirationDate);
  
  const filteredDocuments = documentsWithDates.filter(doc => {
    const status = getDocumentStatus(doc);
    if (filter === 'all') return true;
    if (filter === 'expiring') return status === 'expiring';
    if (filter === 'expired') return status === 'expired';
    return false;
  }).sort((a, b) => {
    if (!a.expirationDate || !b.expirationDate) return 0;
    return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
  });

  const expiringCount = documentsWithDates.filter(doc => getDocumentStatus(doc) === 'expiring').length;
  const expiredCount = documentsWithDates.filter(doc => getDocumentStatus(doc) === 'expired').length;
  const activeCount = documentsWithDates.filter(doc => getDocumentStatus(doc) === 'active').length;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'expired':
        return <AlertTriangle className="h-5 w-5 text-red-600" />;
      case 'expiring':
        return <Clock className="h-5 w-5 text-orange-600" />;
      case 'active':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      default:
        return <Calendar className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'expired':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'expiring':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getDaysUntilExpiration = (expirationDate: string) => {
    const expDate = new Date(expirationDate);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Expiration Tracker</h1>
        <p className="text-gray-600">Stay on top of important dates and never miss a renewal or expiration.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-green-50 border border-green-200 p-6 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-600">Active Documents</p>
              <p className="text-3xl font-bold text-green-700">{activeCount}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
        </div>

        <div className="bg-orange-50 border border-orange-200 p-6 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-orange-600">Expiring Soon</p>
              <p className="text-3xl font-bold text-orange-700">{expiringCount}</p>
            </div>
            <Clock className="h-8 w-8 text-orange-600" />
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 p-6 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-600">Expired</p>
              <p className="text-3xl font-bold text-red-700">{expiredCount}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
        <div className="flex items-center space-x-4">
          <Filter className="h-5 w-5 text-gray-400" />
          <div className="flex space-x-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              All Documents
            </button>
            <button
              onClick={() => setFilter('expiring')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'expiring'
                  ? 'bg-orange-100 text-orange-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              Expiring Soon ({expiringCount})
            </button>
            <button
              onClick={() => setFilter('expired')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'expired'
                  ? 'bg-red-100 text-red-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              Expired ({expiredCount})
            </button>
          </div>
        </div>
      </div>

      {/* Documents List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Document Timeline</h2>
        </div>
        
        <div className="divide-y divide-gray-200">
          {filteredDocuments.map((doc) => {
            const status = getDocumentStatus(doc);
            const daysUntil = doc.expirationDate ? getDaysUntilExpiration(doc.expirationDate) : 0;
            
            return (
              <div key={doc.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      {getStatusIcon(status)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{doc.name}</h3>
                      <p className="text-sm text-gray-500 capitalize">
                        {doc.category}
                        {doc.fileCount && doc.fileCount > 1 && (
                          <span className="ml-2 text-blue-600 font-medium">
                            ({doc.fileCount} files)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {doc.expirationDate ? formatUTCDate(doc.expirationDate) : 'No date set'}
                      </p>
                      {doc.expirationDate && (
                        <p className="text-sm text-gray-500">
                          {daysUntil > 0 
                            ? `${daysUntil} days remaining`
                            : daysUntil === 0
                            ? 'Expires today'
                            : `Expired ${Math.abs(daysUntil)} days ago`
                          }
                        </p>
                      )}
                    </div>
                    
                    <div className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(status)}`}>
                      {status === 'expiring' ? 'Expires Soon' : 
                       status === 'expired' ? 'Expired' : 
                       status === 'active' ? 'Active' : 'No Date'}
                    </div>

                    {status === 'expiring' && (
                      <button className="text-blue-600 hover:text-blue-700 p-1">
                        <Bell className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredDocuments.length === 0 && (
          <div className="p-8 text-center">
            <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No documents found</h3>
            <p className="text-gray-600">
              {filter === 'all' 
                ? 'No documents with expiration dates found.'
                : `No ${filter} documents found.`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}