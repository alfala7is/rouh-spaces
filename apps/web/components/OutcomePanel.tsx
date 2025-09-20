"use client";
import React from 'react';
import { Card } from '@rouh/ui';

export type OutcomeStatus = {
  actionId: string;
  status: string;
  message: string;
  timestamp: string | Date;
};

export type OutcomeResult = {
  actionId: string;
  status: string;
  receiptData?: any;
  externalReference?: string;
};

type OutcomePanelProps = {
  latestStatus?: OutcomeStatus | null;
  latestResult?: OutcomeResult | null;
};

export default function OutcomePanel({ latestStatus, latestResult }: OutcomePanelProps) {
  return (
    <Card className="p-4 grid gap-3">
      <div>
        <div className="font-semibold">Outcome</div>
        <div className="text-sm text-gray-600">Live status and receipt</div>
      </div>

      {latestStatus ? (
        <div className="bg-blue-50 p-2 rounded text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
            <span className="font-medium">{latestStatus.status}</span>
            <span className="text-gray-700">{latestStatus.message}</span>
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-500">No recent actions</div>
      )}

      {latestResult?.receiptData && (
        <div className="bg-green-50 p-3 rounded text-sm">
          <div className="font-medium text-green-800">Receipt</div>
          <div className="mt-1 grid gap-1">
            {latestResult.receiptData.order_number && (
              <div>Order: {latestResult.receiptData.order_number}</div>
            )}
            {latestResult.receiptData.total && (
              <div>Total: {latestResult.receiptData.total}</div>
            )}
            {latestResult.receiptData.pickup_time && (
              <div>When: {latestResult.receiptData.pickup_time}</div>
            )}
            {latestResult.receiptData.status && (
              <div>Status: {latestResult.receiptData.status}</div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

