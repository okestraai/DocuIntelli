import React from 'react';
import { X, Bell, Calendar, AlertTriangle, CheckCircle } from 'lucide-react';
import type { Document } from '../App';
import { formatUTCDate } from '../lib/dateUtils';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  expiringDocuments: Document[];
  seenIds?: Set<string>;
  onNotificationRead?: (id: string) => void;
}

export function NotificationsModal({ isOpen, onClose, expiringDocuments, seenIds, onNotificationRead }: NotificationsModalProps) {
  if (!isOpen) return null;

  const getDaysUntilExpiration = (expirationDate: string) => {
    const today = new Date();
    const expDate = new Date(expirationDate);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getStatusColor = (daysUntil: number) => {
    if (daysUntil <= 0) return 'text-red-600 bg-red-50';
    if (daysUntil <= 7) return 'text-orange-600 bg-orange-50';
    if (daysUntil <= 30) return 'text-yellow-600 bg-yellow-50';
    return 'text-gray-600 bg-gray-50';
  };

  const getStatusText = (daysUntil: number) => {
    if (daysUntil <= 0) return 'Expired';
    if (daysUntil === 1) return '1 day left';
    return `${daysUntil} days left`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-2 rounded-lg">
              <Bell className="h-6 w-6 text-emerald-600" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Notifications</h2>
              <p className="text-sm text-gray-600">
                {expiringDocuments.length} document{expiringDocuments.length !== 1 ? 's' : ''} expiring soon
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {expiringDocuments.length === 0 ? (
            <div className="text-center py-12">
              <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">All Clear!</h3>
              <p className="text-gray-600">You have no documents expiring in the next 30 days.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {expiringDocuments.map((doc) => {
                const daysUntil = doc.expirationDate ? getDaysUntilExpiration(doc.expirationDate) : 0;
                const statusColor = getStatusColor(daysUntil);
                const isRead = seenIds?.has(doc.id) ?? false;

                return (
                  <div
                    key={doc.id}
                    onClick={() => onNotificationRead?.(doc.id)}
                    className={`rounded-lg p-4 border transition-colors cursor-pointer ${
                      isRead
                        ? 'bg-white border-gray-100 opacity-60'
                        : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3 flex-1">
                        <div className={`p-2 rounded-lg ${statusColor}`}>
                          <AlertTriangle className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 mb-1">{doc.name}</h3>
                          <div className="flex items-center space-x-4 text-sm text-gray-600">
                            <div className="flex items-center">
                              <Calendar className="h-4 w-4 mr-1" />
                              <span>Expires: {doc.expirationDate ? formatUTCDate(doc.expirationDate) : 'N/A'}</span>
                            </div>
                          </div>
                          <div className="mt-2">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
                              {getStatusText(daysUntil)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        doc.status === 'expired'
                          ? 'bg-red-100 text-red-800'
                          : doc.status === 'expiring'
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {doc.category}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
