"use client";
import React from 'react';
import { Card } from '@rouh/ui';

type ReceiptCardProps = {
  data: any;
};

export default function ReceiptCard({ data }: ReceiptCardProps) {
  return (
    <Card className="p-4 bg-green-50 border-green-200">
      <div className="font-medium text-green-900">Receipt</div>
      <div className="grid gap-1 text-sm mt-2">
        {data.provider && <div>Provider: {data.provider}</div>}
        {data.order_number && <div>Order: {data.order_number}</div>}
        {data.total && <div>Total: {data.total}</div>}
        {data.pickup_time && <div>When: {data.pickup_time}</div>}
        {data.status && <div>Status: {data.status}</div>}
      </div>
    </Card>
  );
}

