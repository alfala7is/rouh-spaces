"use client";
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { Button, Card } from '@rouh/ui';
import AiChat from '../../../../components/AiChat';
import ChatButton from '../../../../components/ChatButton';
import io from 'socket.io-client';

const socket = io(process.env.NEXT_PUBLIC_API_WS || 'http://localhost:3001');

interface ActionStatus {
  actionId: string;
  status: string;
  message: string;
  timestamp: string;
}

interface ActionResult {
  actionId: string;
  status: string;
  receiptData?: any;
  externalReference?: string;
}

export default function DemoSpaces() {
  const params = useParams<{ spaceId: string }>();
  const spaceId = params.spaceId;
  const [notifications, setNotifications] = useState<string[]>([]);
  const [actionStatuses, setActionStatuses] = useState<Map<string, ActionStatus>>(new Map());
  const [actionResults, setActionResults] = useState<Map<string, ActionResult>>(new Map());
  const [currentSpace, setCurrentSpace] = useState<string>('cafe');
  const [isChatOpen, setIsChatOpen] = useState(false);

  useEffect(() => {
    // Real-time action status updates
    socket.on('action.status', (data: ActionStatus) => {
      console.log('Action status update:', data);
      setActionStatuses(prev => new Map(prev.set(data.actionId, data)));
      addNotification(`📊 ${data.message}`);
    });

    socket.on('action.completed', (data: ActionResult) => {
      console.log('Action completed:', data);
      setActionResults(prev => new Map(prev.set(data.actionId, data)));

      if (data.receiptData?.order_number) {
        addNotification(`🎉 Order ${data.receiptData.order_number} confirmed!`);
      } else {
        addNotification(`✅ Action completed successfully!`);
      }
    });

    socket.on('action.created', (data: any) => {
      console.log('Action created:', data);
      addNotification('⏳ Action queued for execution...');
    });

    return () => {
      socket.off('action.status');
      socket.off('action.completed');
      socket.off('action.created');
    };
  }, []);

  const addNotification = (message: string) => {
    setNotifications(prev => [...prev.slice(-4), message]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n !== message));
    }, 5000);
  };

  const executeAction = async (actionType: string, parameters: any, mockItemData: any) => {
    try {
      // For demo purposes, we'll create a mock item and action
      const response = await apiFetch(`/actions`, {
        spaceId,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          itemId: `demo-${mockItemData.type}-${Date.now()}`,
          type: actionType,
          parameters: {
            ...parameters,
            mock_item_data: mockItemData // Pass mock data for handler to use
          }
        }),
      });

      console.log('Demo action created:', response);
    } catch (error) {
      console.error('Demo action failed:', error);
      addNotification('❌ Action failed to start');
    }
  };

  const demoSpaces = {
    cafe: {
      title: '☕ Downtown Café',
      subtitle: 'Smart Menu Demo',
      description: 'Order coffee with Square POS integration, email fallback, or manual processing',
      color: 'from-orange-50 to-red-50',
      borderColor: 'border-orange-200',
      mockItem: {
        type: 'cafe',
        name: 'Downtown Café',
        email: 'orders@downtowncafe.com',
        phone: '+1-555-CAFE',
        address: '123 Main St, Downtown',
        order_system: 'square',
        square_application_id: 'sq_app_123',
        square_access_token: 'sq_token_456'
      },
      actions: [
        {
          title: '🍵 Order Latte & Croissant',
          type: 'order',
          params: {
            items: [
              { name: 'Latte', price: 5.50, quantity: 1, modifications: ['oat milk', 'extra shot'] },
              { name: 'Almond Croissant', price: 4.25, quantity: 1 }
            ],
            pickup_time: '15 minutes',
            customer_name: 'Demo User',
            customer_phone: '+1234567890',
            special_instructions: 'Extra hot please'
          },
          color: 'bg-orange-600 hover:bg-orange-700'
        },
        {
          title: '📞 Contact Café',
          type: 'contact',
          params: {
            message: 'Hi, I have a question about your catering options.',
            customer_name: 'Demo User',
            customer_phone: '+1234567890'
          },
          color: 'bg-blue-600 hover:bg-blue-700'
        }
      ]
    },

    school: {
      title: '🏫 Greenwood Elementary',
      subtitle: 'Parent Portal Demo',
      description: 'Schedule meetings, ask questions, and coordinate with teachers',
      color: 'from-blue-50 to-indigo-50',
      borderColor: 'border-blue-200',
      mockItem: {
        type: 'school',
        name: 'Greenwood Elementary School',
        email: 'admin@greenwood.edu',
        phone: '+1-555-SCHOOL',
        address: '456 Education Blvd',
        staff: 'Ms. Johnson - Grade 3 Teacher'
      },
      actions: [
        {
          title: '📅 Schedule Parent-Teacher Meeting',
          type: 'schedule',
          params: {
            meeting_topic: 'Discuss Ahmad\'s math progress',
            preferred_date: 'Next Tuesday',
            preferred_time: '3:30 PM',
            duration: '30 minutes',
            user_name: 'Parent User',
            teacher_name: 'Ms. Johnson'
          },
          color: 'bg-blue-600 hover:bg-blue-700'
        },
        {
          title: '❓ Ask About Homework',
          type: 'inquiry',
          params: {
            inquiry_message: 'Could you provide some tips for helping Ahmad with math homework?',
            user_name: 'Parent User',
            child_name: 'Ahmad'
          },
          color: 'bg-green-600 hover:bg-green-700'
        }
      ]
    },

    car: {
      title: '🚗 AutoMax Dealership',
      subtitle: 'Car Marketplace Demo',
      description: 'Book test drives, get quotes, and connect with dealers',
      color: 'from-green-50 to-emerald-50',
      borderColor: 'border-green-200',
      mockItem: {
        type: 'car',
        name: 'AutoMax Dealership',
        email: 'sales@automax.com',
        phone: '+1-555-AUTO',
        address: '789 Car Lot Ave',
        vehicle: '2019 Honda Civic',
        price: '$18,500',
        crm_system: 'salesforce'
      },
      actions: [
        {
          title: '🚗 Book Test Drive',
          type: 'book',
          params: {
            vehicle: '2019 Honda Civic',
            preferred_date: 'This weekend',
            preferred_time: 'Saturday morning',
            special_requirements: 'Interested in financing options',
            user_name: 'Demo Buyer',
            user_phone: '+1234567890'
          },
          color: 'bg-green-600 hover:bg-green-700'
        },
        {
          title: '💰 Get Best Price Quote',
          type: 'inquiry',
          params: {
            inquiry_message: 'What is your best cash price for the 2019 Honda Civic? Any current promotions?',
            vehicle_interest: '2019 Honda Civic',
            user_name: 'Demo Buyer'
          },
          color: 'bg-blue-600 hover:bg-blue-700'
        }
      ]
    },

    expert: {
      title: '👨‍💼 Dr. Jasem - Medical Expert',
      subtitle: 'Expert Consultation Demo',
      description: 'Book consultations and get expert advice',
      color: 'from-purple-50 to-violet-50',
      borderColor: 'border-purple-200',
      mockItem: {
        type: 'expert',
        name: 'Dr. Jasem',
        profession: 'Cardiologist',
        email: 'consult@drjasem.com',
        phone: '+1-555-HEART',
        expertise: 'Cardiology, Heart Disease Prevention',
        booking_system: 'calendly'
      },
      actions: [
        {
          title: '📞 Book Urgent Consultation',
          type: 'book',
          params: {
            consultation_type: 'Urgent - Chest Pain After Exercise',
            preferred_date: 'Today',
            preferred_time: '6:00 PM',
            duration: '45 minutes',
            background: 'Experiencing chest pain during exercise, need professional evaluation',
            user_name: 'Demo Patient',
            user_phone: '+1234567890'
          },
          color: 'bg-red-600 hover:bg-red-700'
        },
        {
          title: '💬 Ask Expert Question',
          type: 'inquiry',
          params: {
            inquiry_message: 'What are the warning signs of heart disease I should watch for?',
            medical_topic: 'Heart Disease Prevention',
            user_name: 'Demo Patient'
          },
          color: 'bg-purple-600 hover:bg-purple-700'
        }
      ]
    }
  };

  const currentSpaceData = demoSpaces[currentSpace as keyof typeof demoSpaces];

  return (
    <main className="max-w-6xl mx-auto p-6 grid gap-6">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">🤖 AI-Powered Action Demo</h1>
        <Button
          onClick={() => {
            console.log('Opening AI Chat');
            setIsChatOpen(true);
          }}
          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
        >
          💬 Try AI Chat
        </Button>
        <div className="ml-auto flex gap-2">
          <a className="text-sm underline text-blue-600" href={`/s/${spaceId}`}>
            ← Back to Space
          </a>
          <a className="text-sm underline text-blue-600" href={`/s/${spaceId}/operator`}>
            Operator Console
          </a>
        </div>
      </div>

      {/* Real-time Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {notifications.map((notification, i) => (
          <div key={i} className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg max-w-sm animate-in slide-in-from-right">
            {notification}
          </div>
        ))}
      </div>

      {/* Info Banner */}
      <Card className="p-6 bg-gradient-to-r from-blue-50 to-purple-50">
        <h2 className="text-xl font-semibold mb-2">AI-Powered Interactive Demonstrations</h2>
        <p className="text-gray-600 mb-3">
          Experience natural language actions! Try the AI chat or use the buttons below to see real execution with live status updates.
        </p>
        <div className="flex gap-3 flex-wrap">
          <Button
            onClick={() => setIsChatOpen(true)}
            size="sm"
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
          >
            🤖 Chat: "Order me coffee"
          </Button>
          <Button
            onClick={() => setIsChatOpen(true)}
            size="sm"
            className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white"
          >
            📅 Chat: "Schedule meeting"
          </Button>
          <span className="text-xs text-gray-500 self-center">or use demo buttons below</span>
        </div>
      </Card>

      {/* Space Selector */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(demoSpaces).map(([key, space]) => (
          <Button
            key={key}
            onClick={() => setCurrentSpace(key)}
            variant={currentSpace === key ? "default" : "outline"}
            className={currentSpace === key ? "bg-blue-600 text-white" : ""}
          >
            {space.title}
          </Button>
        ))}
      </div>

      {/* Current Space Demo */}
      <Card className={`p-6 bg-gradient-to-r ${currentSpaceData.color} border-2 ${currentSpaceData.borderColor}`}>
        <div className="grid gap-4">
          <div>
            <h3 className="text-2xl font-bold">{currentSpaceData.title}</h3>
            <p className="text-lg text-gray-600">{currentSpaceData.subtitle}</p>
            <p className="text-sm text-gray-500 mt-2">{currentSpaceData.description}</p>
          </div>

          {/* Provider Info */}
          <Card className="p-4 bg-white/50">
            <h4 className="font-semibold mb-2">Provider Information:</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {Object.entries(currentSpaceData.mockItem).map(([key, value]) => (
                <div key={key}>
                  <span className="font-medium">{key.replace('_', ' ')}:</span> {value}
                </div>
              ))}
            </div>
          </Card>

          {/* Action Buttons */}
          <div className="grid gap-3">
            <h4 className="font-semibold">Available Actions:</h4>
            <div className="grid gap-3 md:grid-cols-2">
              {currentSpaceData.actions.map((action, i) => (
                <Card key={i} className="p-4 bg-white/70">
                  <div className="grid gap-3">
                    <div>
                      <h5 className="font-semibold">{action.title}</h5>
                      <p className="text-xs text-gray-600">
                        {action.type} action - {Object.keys(action.params).length} parameters
                      </p>
                    </div>

                    <Button
                      onClick={() => executeAction(action.type, action.params, currentSpaceData.mockItem)}
                      className={action.color}
                    >
                      Execute {action.title}
                    </Button>

                    <details className="text-xs">
                      <summary className="cursor-pointer text-gray-600">Show parameters</summary>
                      <pre className="bg-gray-100 p-2 rounded mt-1 overflow-auto">
                        {JSON.stringify(action.params, null, 2)}
                      </pre>
                    </details>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Execution Flow Explanation */}
      <Card className="p-6">
        <h3 className="font-semibold mb-3">🔧 What Happens When You Click Execute?</h3>
        <div className="grid gap-3 text-sm">
          <div className="flex items-start gap-3">
            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">1</span>
            <div>
              <strong>Action Queued:</strong> Your request enters the execution queue
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">2</span>
            <div>
              <strong>Handler Selection:</strong> System picks the best integration method (API → Email → Manual)
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">3</span>
            <div>
              <strong>Execution:</strong> Action executed in provider's system with real-time status updates
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">4</span>
            <div>
              <strong>Completion:</strong> Receipt generated with confirmation details
            </div>
          </div>
        </div>
      </Card>

      {/* Status Display */}
      {(actionStatuses.size > 0 || actionResults.size > 0) && (
        <Card className="p-6">
          <h3 className="font-semibold mb-3">📊 Recent Action Status</h3>

          {Array.from(actionStatuses.entries()).slice(-3).map(([actionId, status]) => (
            <div key={actionId} className="bg-blue-50 p-3 rounded mb-2">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                <span className="font-medium">Action {actionId.slice(-6)}:</span>
                <span>{status.message}</span>
              </div>
            </div>
          ))}

          {Array.from(actionResults.entries()).slice(-3).map(([actionId, result]) => (
            <div key={actionId} className="bg-green-50 p-3 rounded mb-2">
              <div className="font-medium text-green-800">✅ Action {actionId.slice(-6)} Completed!</div>
              {result.receiptData && (
                <div className="text-sm mt-1">
                  {Object.entries(result.receiptData).slice(0, 3).map(([key, value]) => (
                    <div key={key}>{key}: {typeof value === 'object' ? JSON.stringify(value) : String(value)}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      {/* Floating Chat Button */}
      <ChatButton onClick={() => setIsChatOpen(true)} />

      {/* AI Chat Interface */}
      <AiChat
        spaceId={spaceId}
        items={Object.values(demoSpaces).map(space => ({ id: space.title, canonicalJson: space.mockItem }))}
        onExecuteAction={(itemId: string, actionType: string, parameters: any) => {
          // Find the mock item data based on itemId
          const matchedSpace = Object.values(demoSpaces).find(space => space.title === itemId);
          const mockItemData = matchedSpace?.mockItem || demoSpaces[currentSpace as keyof typeof demoSpaces].mockItem;
          return executeAction(actionType, parameters, mockItemData);
        }}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
      />
    </main>
  );
}
