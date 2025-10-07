"use client";
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Input } from '@rouh/ui';
import { API_URL } from '@/lib/api';
import { animate, stagger } from 'animejs';

export default function HomePage() {
  const [spaceId, setSpaceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeSection, setActiveSection] = useState<'individual' | 'family' | 'corporate'>('individual');
  const [activeScenario, setActiveScenario] = useState<'home' | 'health' | 'vehicle' | 'subscriptions'>('home');
  const [activeFamilyScenario, setActiveFamilyScenario] = useState<'emergency' | 'vacation' | 'dinner'>('emergency');
  const [animationPhase, setAnimationPhase] = useState(0);
  const [familyAnimationPhase, setFamilyAnimationPhase] = useState(0);
  const [familyLogIndex, setFamilyLogIndex] = useState(0);
  const [familyIsPaused, setFamilyIsPaused] = useState(false);
  const [familySpeed, setFamilySpeed] = useState(1800); // Default 1.8s (slower)
  const [showFamilyCustomInput, setShowFamilyCustomInput] = useState(false);
  const [familyCustomPrompt, setFamilyCustomPrompt] = useState("");
  const [isGeneratingFamily, setIsGeneratingFamily] = useState(false);
  const [customFamilyScenario, setCustomFamilyScenario] = useState<any>(null);
  const [activeComm, setActiveComm] = useState<{from: string, to: string, messages: {sender: string, text: string}[]} | null>(null);
  const [isCommFadingOut, setIsCommFadingOut] = useState(false);
  const [isFamilySectionVisible, setIsFamilySectionVisible] = useState(false);
  const commTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const familySectionRef = React.useRef<HTMLDivElement>(null);

  // Animation refs
  const heroRef = useRef<HTMLDivElement>(null);
  const individualCardRef = useRef<HTMLDivElement>(null);
  const corporateCardRef = useRef<HTMLDivElement>(null);
  const ctaSectionRef = useRef<HTMLDivElement>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [customScenario, setCustomScenario] = useState<any>(null);
  const [logIndex, setLogIndex] = useState(0);
  const [isCrashing, setIsCrashing] = useState(false);
  const [crashPhase, setCrashPhase] = useState<'idle' | 'panic' | 'shutdown' | 'reboot'>('idle');
  const router = useRouter();

  // Larger pool of mental burdens
  const allBurdens = [
    "Remember to fix garage door",
    "Did I pay that bill?",
    "Follow up with the contractor",
    "Schedule dentist appointment",
    "Renew car insurance before it expires",
    "Check if package was delivered",
    "Call plumber about the leak",
    "Send those documents to accountant",
    "Update emergency contacts",
    "Order replacement air filters",
    "Schedule annual health checkup",
    "Reply to that important email",
    "Pick up prescription refill",
    "Book flight for next month",
    "Pay property tax before deadline",
    "Schedule car service appointment",
    "Renew gym membership",
    "Update software licenses",
    "Check credit card statement",
    "File expense reports",
  ];

  // Select 5 random burdens on mount
  const [mentalBurdens] = React.useState(() => {
    const shuffled = [...allBurdens].sort(() => Math.random() - 0.5);
    const positions = [
      { left: "10%", top: "70%", animation: "animate-float-1" },
      { left: "65%", top: "75%", animation: "animate-float-2" },
      { left: "20%", top: "65%", animation: "animate-float-3" },
      { left: "75%", top: "68%", animation: "animate-float-4" },
      { left: "40%", top: "72%", animation: "animate-float-5" },
    ];
    return shuffled.slice(0, 5).map((text, idx) => ({
      text,
      ...positions[idx],
    }));
  });

  const scenarios = {
    home: {
      title: "Home Repair",
      trigger: "Garage door broke",
      lastRun: "3 days ago",
      nextRun: "in 87 days",
      cinematicSteps: [
        {
          userMessage: { type: "notification", icon: "🔔", text: "Garage door needs repair", time: "9:42 AM" },
          backgroundLogs: [
            { text: "🔴 SENSOR: Garage door malfunction detected" },
            { text: "🤖 AI: Analyzing issue pattern..." },
            { text: "🤖 AI: Match found - same as incident #2847" },
            { text: "📊 DATA: Fetching repair history..." },
            { text: "📊 DATA: Last repair by John's Garage (4.8★)" },
            { text: "⚙️ SYSTEM: Creating structured task #4821" },
            { text: "📱 NOTIFY: Pushing notification to device..." },
          ]
        },
        {
          userMessage: { type: "action", icon: "👆", text: "Tap to approve contractor", time: "9:42 AM" },
          backgroundLogs: [
            { text: "⏳ WAIT: Awaiting user approval..." },
            { text: "✓ USER: Approved at 9:42:35 AM" },
          ]
        },
        {
          userMessage: { type: "confirmation", icon: "✓", text: "Scheduled for tomorrow 2pm", time: "9:43 AM" },
          backgroundLogs: [
            { text: "📧 VENDOR: Contacting John's Garage..." },
            { text: "📧 VENDOR: Checking availability..." },
            { text: "✓ VENDOR: Confirmed - Tomorrow 2pm slot" },
            { text: "📅 SCHEDULE: Booking slot reserved" },
            { text: "📆 CALENDAR: Added to your schedule" },
            { text: "⏰ REMIND: Set reminder for 1:30pm tomorrow" },
          ]
        },
        {
          userMessage: { type: "complete", icon: "✅", text: "Repair completed!", time: "Next day" },
          backgroundLogs: [
            { text: "✓ VENDOR: Work completed & verified" },
            { text: "💰 PAYMENT: Processing payment to vendor" },
            { text: "📝 LOG: Storing repair details & receipt" },
            { text: "🧠 LEARN: Updating automation confidence +15%" },
          ]
        },
      ],
      steps: [
        { icon: "🏠", label: "Issue Detected", detail: "Garage door sensor triggered" },
        { icon: "📋", label: "Task Created", detail: "Rouh structures the request" },
        { icon: "🔔", label: "You Approve", detail: "Quick notification review" },
        { icon: "👷", label: "Vendor Assigned", detail: "Rouh finds previous contractor" },
        { icon: "✅", label: "Completed", detail: "Work done, payment processed" },
        { icon: "💾", label: "Stored", detail: "Details logged for future" },
        { icon: "🧠", label: "Learns", detail: "Pattern recognized for automation" },
      ],
    },
    health: {
      title: "Health Management",
      trigger: "Prescription refill due",
      lastRun: "28 days ago",
      nextRun: "in 2 days",
      cinematicSteps: [
        {
          userMessage: { type: "notification", icon: "💊", text: "Prescription refill reminder", time: "8:00 AM" },
          backgroundLogs: [
            { text: "⏰ TIMER: 30-day refill cycle triggered" },
            { text: "🤖 AI: Checking prescription status..." },
            { text: "📊 DATA: Last refill was 28 days ago" },
            { text: "💊 PHARMACY: Querying CVS inventory..." },
            { text: "💊 PHARMACY: Medication in stock at CVS" },
            { text: "📱 NOTIFY: Sending reminder to device..." },
          ]
        },
        {
          userMessage: { type: "action", icon: "👆", text: "Confirm pharmacy details", time: "8:01 AM" },
          backgroundLogs: [
            { text: "⏳ WAIT: User confirmation pending..." },
            { text: "✓ USER: Confirmed at 8:01:12 AM" },
          ]
        },
        {
          userMessage: { type: "confirmation", icon: "✓", text: "Ready for pickup at CVS", time: "8:05 AM" },
          backgroundLogs: [
            { text: "📦 ORDER: Sending refill request to CVS" },
            { text: "✓ CVS: Order confirmed & processing" },
            { text: "📆 CALENDAR: Adding pickup reminder" },
            { text: "🧠 LEARN: User prefers 8am reminders" },
          ]
        },
        {
          userMessage: { type: "complete", icon: "✅", text: "Picked up & logged", time: "Later" },
          backgroundLogs: [
            { text: "✓ PICKUP: Confirmed at CVS" },
            { text: "📝 LOG: Updated medication history" },
            { text: "📅 SCHEDULE: Next refill in 30 days" },
          ]
        },
      ],
      steps: [
        { icon: "💊", label: "Reminder Set", detail: "Prescription tracker notices date" },
        { icon: "📋", label: "Task Created", detail: "Rouh structures the refill" },
        { icon: "🔔", label: "You Confirm", detail: "Verify prescription details" },
        { icon: "🏥", label: "Pharmacy Notified", detail: "Auto-sent to your pharmacy" },
        { icon: "✅", label: "Ready", detail: "Pickup notification sent" },
        { icon: "💾", label: "Logged", detail: "Refill history updated" },
        { icon: "🧠", label: "Learns", detail: "Adjusts future reminder timing" },
      ],
    },
    vehicle: {
      title: "Vehicle Maintenance",
      trigger: "Oil change due",
      lastRun: "90 days ago",
      nextRun: "in 7 days",
      cinematicSteps: [
        {
          userMessage: { type: "notification", icon: "🚗", text: "Oil change recommended", time: "7:30 AM" },
          backgroundLogs: [
            { text: "🚗 MILEAGE: 5,000 miles since last service" },
            { text: "🤖 AI: Analyzing maintenance schedule..." },
            { text: "🤖 AI: Oil change recommended based on usage" },
            { text: "📊 DATA: Fetching service history..." },
            { text: "📊 DATA: Last service by Quick Lube Plus" },
            { text: "🔧 VENDOR: Checking availability..." },
            { text: "🔧 VENDOR: 3 slots available this week" },
            { text: "📱 NOTIFY: Sending options to device..." },
          ]
        },
        {
          userMessage: { type: "action", icon: "👆", text: "Select appointment time", time: "7:31 AM" },
          backgroundLogs: [
            { text: "⏳ WAIT: User selecting time slot..." },
            { text: "✓ USER: Selected Friday 10am" },
          ]
        },
        {
          userMessage: { type: "confirmation", icon: "✓", text: "Booked: Friday 10am", time: "7:32 AM" },
          backgroundLogs: [
            { text: "📅 BOOK: Reserving appointment slot..." },
            { text: "✓ SHOP: Appointment confirmed" },
            { text: "📆 CALENDAR: Event created in calendar" },
            { text: "⏰ REMIND: Reminder set for Thursday 8pm" },
            { text: "🧠 LEARN: User prefers Friday mornings" },
          ]
        },
        {
          userMessage: { type: "complete", icon: "✅", text: "Service complete!", time: "Friday" },
          backgroundLogs: [
            { text: "✓ SHOP: Service completed & verified" },
            { text: "💰 PAYMENT: Processing payment" },
            { text: "📝 LOG: Updated maintenance records" },
            { text: "📅 SCHEDULE: Next service in 90 days" },
          ]
        },
      ],
      steps: [
        { icon: "🚗", label: "Mileage Tracked", detail: "Hit 5000 mile threshold" },
        { icon: "📋", label: "Task Created", detail: "Rouh schedules maintenance" },
        { icon: "🔔", label: "You Choose", detail: "Pick from available slots" },
        { icon: "🔧", label: "Shop Booked", detail: "Appointment confirmed" },
        { icon: "✅", label: "Completed", detail: "Service done, receipt saved" },
        { icon: "💾", label: "Recorded", detail: "Maintenance log updated" },
        { icon: "🧠", label: "Learns", detail: "Optimizes scheduling preference" },
      ],
    },
    subscriptions: {
      title: "Subscription Review",
      trigger: "Renewal coming up",
      lastRun: "15 days ago",
      nextRun: "in 15 days",
      cinematicSteps: [
        {
          userMessage: { type: "notification", icon: "💳", text: "Netflix renewing in 3 days - worth it?", time: "6:00 PM" },
          backgroundLogs: [
            { text: "💳 TRACKER: Renewal date approaching..." },
            { text: "🤖 AI: Analyzing usage patterns..." },
            { text: "📊 USAGE: 47 hours watched last month" },
            { text: "📊 DATA: $15.99/mo for 8 months" },
            { text: "🔍 COMPARE: Checking competitor pricing..." },
            { text: "💡 INSIGHT: High usage - recommend keep" },
            { text: "📱 NOTIFY: Sending renewal reminder..." },
          ]
        },
        {
          userMessage: { type: "action", icon: "👆", text: "Keep subscription", time: "6:01 PM" },
          backgroundLogs: [
            { text: "⏳ WAIT: User decision pending..." },
            { text: "✓ USER: Decided to keep subscription" },
          ]
        },
        {
          userMessage: { type: "confirmation", icon: "✓", text: "Kept - saved to budget", time: "6:02 PM" },
          backgroundLogs: [
            { text: "💰 BUDGET: Updating monthly spending" },
            { text: "📆 CALENDAR: Next review scheduled" },
            { text: "🧠 LEARN: High usage = keep pattern" },
          ]
        },
        {
          userMessage: { type: "complete", icon: "✅", text: "Renewed successfully", time: "3 days later" },
          backgroundLogs: [
            { text: "✓ RENEWAL: Subscription renewed" },
            { text: "💰 PAYMENT: Payment processed" },
            { text: "📝 LOG: Updated subscription history" },
          ]
        },
      ],
      steps: [
        { icon: "💳", label: "Renewal Detected", detail: "Annual subscription due" },
        { icon: "📋", label: "Task Created", detail: "Rouh flags for review" },
        { icon: "🔔", label: "You Decide", detail: "Keep, cancel, or negotiate" },
        { icon: "📧", label: "Action Taken", detail: "Rouh executes your choice" },
        { icon: "✅", label: "Confirmed", detail: "Updated in your records" },
        { icon: "💾", label: "Tracked", detail: "Spending patterns logged" },
        { icon: "🧠", label: "Learns", detail: "Suggests similar reviews" },
      ],
    },
  };

  // Family coordination scenarios - multi-person orchestration
  const familyScenarios = {
    emergency: {
      title: "School Pickup Emergency",
      description: "Child is sick - coordinate multi-person response",
      orchestrationSteps: [
        {
          groupChat: [
            { from: "School", text: "Emma has a fever - needs pickup", time: "2:15 PM", type: "alert" },
            { from: "Rouh", text: "Checking parent availability...", time: "2:15 PM", type: "system" },
          ],
          orchestrationLogs: [
            { text: "🚨 ALERT: School nurse notification received" },
            { text: "📍 LOCATE: Dad @ Office (25 min), Mom @ Airport (60 min)" },
            { text: "📅 CALENDAR: Dad has meeting until 3pm" },
            { text: "📅 CALENDAR: Mom has flight at 4pm" },
            { text: "🔍 SEARCH: Finding backup contacts..." },
            { text: "✓ FOUND: Grandma is 10 min away, available" },
          ],
          communications: [
            {
              trigger: "📅 CALENDAR: Dad has meeting until 3pm",
              from: "Rouh",
              to: "Dad",
              messages: [
                { sender: "Rouh", text: "Checking your availability - Emma needs pickup" },
                { sender: "Dad", text: "In meeting until 3pm, can't make it" }
              ]
            },
            {
              trigger: "📅 CALENDAR: Mom has flight at 4pm",
              from: "Rouh",
              to: "Mom",
              messages: [
                { sender: "Rouh", text: "Emma sick at school - can you pickup?" },
                { sender: "Mom", text: "At airport, flight in 2 hours. Can't make it 😞" }
              ]
            },
            {
              trigger: "✓ FOUND: Grandma is 10 min away, available",
              from: "Rouh",
              to: "Grandma",
              messages: [
                { sender: "Rouh", text: "Hi! Emma has a fever at school. Are you available to pick her up?" },
                { sender: "Grandma", text: "Oh my! Yes, I'm free. I can be there in 10 minutes." }
              ]
            }
          ]
        },
        {
          groupChat: [
            { from: "Rouh", text: "Grandma can pickup in 10 min. Approve?", time: "2:16 PM", type: "suggestion" },
            { from: "Dad", text: "Yes please!", time: "2:16 PM", type: "user" },
          ],
          orchestrationLogs: [
            { text: "⏳ WAIT: Awaiting parent approval..." },
            { text: "✓ APPROVED: Dad confirmed at 2:16:05 PM" },
            { text: "📞 CALL: Connecting with Grandma..." },
            { text: "✓ CONFIRMED: Grandma accepted pickup" },
          ],
          communications: [
            {
              trigger: "📞 CALL: Connecting with Grandma...",
              from: "Rouh",
              to: "Grandma",
              messages: [
                { sender: "Rouh", text: "Dad approved! Can you pick up Emma from school?" },
                { sender: "Grandma", text: "Absolutely! Leaving now." }
              ]
            }
          ]
        },
        {
          groupChat: [
            { from: "Rouh", text: "Grandma is on the way. ETA 2:25 PM", time: "2:17 PM", type: "system" },
            { from: "Rouh", text: "Ordering children's Tylenol delivery", time: "2:17 PM", type: "system" },
          ],
          orchestrationLogs: [
            { text: "🚗 DISPATCH: Grandma en route to school" },
            { text: "📱 NOTIFY: Updating school & family" },
            { text: "💊 PHARMACY: Ordering fever medication" },
            { text: "🏠 HOME: Medicine delivery by 3:30 PM" },
            { text: "📆 RESCHEDULE: Moving Dad's 6pm dinner" },
            { text: "🍽️ DINNER: Ordering family meal delivery" },
          ],
          communications: [
            {
              trigger: "📱 NOTIFY: Updating school & family",
              from: "Rouh",
              to: "School",
              messages: [
                { sender: "Rouh", text: "Grandma will pick up Emma. ETA 10 minutes." },
                { sender: "School", text: "Confirmed. We'll have Emma ready at the front office." }
              ]
            },
            {
              trigger: "💊 PHARMACY: Ordering fever medication",
              from: "Rouh",
              to: "Pharmacy",
              messages: [
                { sender: "Rouh", text: "Need children's Tylenol delivered to home by 3:30 PM" },
                { sender: "Pharmacy", text: "Order confirmed. Delivery by 3:30 PM." }
              ]
            },
            {
              trigger: "🍽️ DINNER: Ordering family meal delivery",
              from: "Rouh",
              to: "Restaurant",
              messages: [
                { sender: "Rouh", text: "Family meal for 4, deliver at 6:30 PM?" },
                { sender: "Restaurant", text: "Confirmed! Comfort food package on the way." }
              ]
            }
          ]
        },
        {
          groupChat: [
            { from: "Grandma", text: "Got Emma, heading home 💙", time: "2:28 PM", type: "user" },
            { from: "Rouh", text: "All coordinated! Medicine arrives 3:30 PM", time: "2:28 PM", type: "complete" },
          ],
          orchestrationLogs: [
            { text: "✓ PICKUP: Emma safely with Grandma" },
            { text: "✓ MEDS: Delivery confirmed for 3:30 PM" },
            { text: "✓ DINNER: Family meal ordered (6:30 PM)" },
            { text: "📱 STATUS: All family members notified" },
            { text: "🧠 LEARN: Emergency response pattern saved" },
          ]
        },
      ],
    },
    vacation: {
      title: "Family Vacation Planning",
      description: "Coordinate preferences, budget, and schedules for 4 people",
      orchestrationSteps: [
        {
          groupChat: [
            { from: "Mom", text: "Should we plan summer vacation?", time: "7:30 PM", type: "user" },
            { from: "Rouh", text: "Analyzing family preferences & schedules...", time: "7:30 PM", type: "system" },
          ],
          orchestrationLogs: [
            { text: "👨‍👩‍👧‍👦 FAMILY: Gathering 4 member profiles" },
            { text: "📅 CALENDARS: Scanning for common availability" },
            { text: "✓ FOUND: July 15-22 works for everyone" },
            { text: "💰 BUDGET: Family vacation fund $3,500" },
            { text: "📊 PREFERENCES: Kids want beach, Dad wants hiking" },
            { text: "🔍 SEARCH: Finding beach+hiking destinations..." },
          ]
        },
        {
          groupChat: [
            { from: "Rouh", text: "Found 3 options balancing everyone's preferences", time: "7:31 PM", type: "suggestion" },
            { from: "Rouh", text: "San Diego: Beach + hiking, $3,200", time: "7:31 PM", type: "suggestion" },
          ],
          orchestrationLogs: [
            { text: "🌊 OPTION 1: San Diego (beach+trails) $3,200" },
            { text: "🏔️ OPTION 2: Lake Tahoe (water+mountains) $3,400" },
            { text: "🌴 OPTION 3: Florida Keys (beach+nature) $3,600" },
            { text: "⭐ RECOMMEND: San Diego (best match)" },
          ]
        },
        {
          groupChat: [
            { from: "Dad", text: "San Diego sounds perfect!", time: "7:32 PM", type: "user" },
            { from: "Kids", text: "🏖️ Yes!!", time: "7:32 PM", type: "user" },
          ],
          orchestrationLogs: [
            { text: "✓ CONSENSUS: San Diego selected" },
            { text: "✈️ FLIGHTS: Booking 4 tickets (July 15)" },
            { text: "🏨 HOTEL: Booking family suite (7 nights)" },
            { text: "🚗 RENTAL: Booking SUV for family" },
            { text: "📅 ACTIVITIES: Beach day, Zoo, hiking trails" },
            { text: "💳 PAYMENT: Charged family card $3,187" },
          ]
        },
        {
          groupChat: [
            { from: "Rouh", text: "Trip booked! Added to everyone's calendars 🎉", time: "7:33 PM", type: "complete" },
          ],
          orchestrationLogs: [
            { text: "✓ BOOKED: Flights, hotel, car reserved" },
            { text: "📆 CALENDAR: Added to all 4 calendars" },
            { text: "📱 SHARED: Itinerary sent to family" },
            { text: "⏰ REMINDERS: Set pre-trip checklist" },
            { text: "🧠 LEARN: Family travel preferences updated" },
          ]
        },
      ],
    },
    dinner: {
      title: "Weekly Dinner Coordination",
      description: "Balance dietary needs, schedules, and grocery shopping for family",
      orchestrationSteps: [
        {
          groupChat: [
            { from: "Rouh", text: "Planning this week's dinners", time: "Sun 10:00 AM", type: "system" },
          ],
          orchestrationLogs: [
            { text: "👨‍👩‍👧‍👦 ANALYZE: Checking family schedules..." },
            { text: "🍽️ DIETARY: Mom vegetarian, Dad low-carb, Kids no restrictions" },
            { text: "📅 SCHEDULE: Mon-Fri dinner at 6:30 PM" },
            { text: "📅 SCHEDULE: Sat dinner out, Sun late lunch" },
            { text: "🔍 RECIPES: Finding balanced meal plans..." },
            { text: "✓ PLAN: 5 dinners meeting all requirements" },
          ]
        },
        {
          groupChat: [
            { from: "Rouh", text: "Meal plan ready - need these groceries", time: "Sun 10:01 AM", type: "suggestion" },
          ],
          orchestrationLogs: [
            { text: "🛒 GROCERY: Building shopping list..." },
            { text: "🏠 PANTRY: Checking existing inventory" },
            { text: "✓ LIST: 23 items needed ($87 estimated)" },
            { text: "📍 STORES: Checking local availability" },
            { text: "🚗 ROUTE: Optimizing pickup locations" },
          ]
        },
        {
          groupChat: [
            { from: "Mom", text: "Approve grocery order", time: "Sun 10:02 AM", type: "user" },
          ],
          orchestrationLogs: [
            { text: "✓ APPROVED: Grocery order confirmed" },
            { text: "🛒 ORDER: Whole Foods pickup 2 PM today" },
            { text: "💳 PAYMENT: Charged $91.43 to family card" },
            { text: "📱 NOTIFY: Pickup reminder set" },
          ]
        },
        {
          groupChat: [
            { from: "Rouh", text: "Groceries ready for pickup! Recipes sent 👨‍🍳", time: "Sun 1:45 PM", type: "complete" },
          ],
          orchestrationLogs: [
            { text: "✓ READY: Groceries available for pickup" },
            { text: "📧 RECIPES: Sent weekly meal instructions" },
            { text: "⏰ PREP: Set daily cooking reminders" },
            { text: "🧠 LEARN: Family meal preferences tracked" },
          ]
        },
      ],
    },
  };

  // Get current scenario (custom or pre-built)
  const currentScenario = customScenario || scenarios[activeScenario];
  const currentFamilyScenario = customFamilyScenario || familyScenarios[activeFamilyScenario];

  // Generate custom family scenario
  const generateFamilyScenario = async () => {
    if (!familyCustomPrompt.trim()) return;

    setIsGeneratingFamily(true);
    try {
      const response = await fetch('/api/generate-family-scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: familyCustomPrompt }),
      });

      if (!response.ok) throw new Error('Failed to generate');

      const data = await response.json();
      setCustomFamilyScenario(data.scenario);
      setShowFamilyCustomInput(false);
      setFamilyAnimationPhase(0);
      setFamilyLogIndex(-1);
    } catch (error) {
      console.error('Error generating family scenario:', error);
      alert('Failed to generate scenario. Please try again.');
    } finally {
      setIsGeneratingFamily(false);
    }
  };

  // Jump to specific step
  const jumpToFamilyStep = (stepIndex: number) => {
    setFamilyAnimationPhase(stepIndex);
    setFamilyLogIndex(-1);
    setFamilyIsPaused(true); // Pause when manually navigating
  };

  // Synchronized cinematic animation
  React.useEffect(() => {
    const steps = currentScenario.cinematicSteps || [];
    if (steps.length === 0) return;

    let currentStepIndex = 0;
    let currentLogIndex = -1;
    let isPaused = false;
    let pauseCounter = 0;

    const interval = setInterval(() => {
      // Pause between steps
      if (isPaused) {
        pauseCounter++;
        if (pauseCounter >= 3) { // Pause for 3 ticks (2.4 seconds)
          isPaused = false;
          pauseCounter = 0;
          // Move to next step
          currentStepIndex = (currentStepIndex + 1) % steps.length;
          currentLogIndex = -1;
          setAnimationPhase(currentStepIndex);
          setLogIndex(-1);
        }
        return;
      }

      const currentStep = steps[currentStepIndex];
      const totalLogs = currentStep.backgroundLogs.length;

      if (currentLogIndex < totalLogs - 1) {
        // Still streaming logs for current step
        currentLogIndex++;
        setLogIndex(currentLogIndex);
      } else {
        // Finished current step's logs, pause before next step
        isPaused = true;
      }
    }, 800); // Slower: 800ms per log

    return () => clearInterval(interval);
  }, [activeScenario, customScenario]);

  // Intersection Observer to detect when family section is visible
  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsFamilySectionVisible(entry.isIntersecting);
        });
      },
      { threshold: 0.3 } // Trigger when 30% visible
    );

    if (familySectionRef.current) {
      observer.observe(familySectionRef.current);
    }

    return () => {
      if (familySectionRef.current) {
        observer.unobserve(familySectionRef.current);
      }
    };
  }, []);

  // Family orchestration animation - with pause and speed control
  React.useEffect(() => {
    const scenario = customFamilyScenario || familyScenarios[activeFamilyScenario];
    const steps = scenario.orchestrationSteps || [];
    if (steps.length === 0) return;
    if (familyIsPaused) return; // Respect pause state
    if (!isFamilySectionVisible) return; // Only animate when visible

    let currentStepIndex = familyAnimationPhase;
    let currentLogIndex = familyLogIndex;
    let isPaused = false;
    let pauseCounter = 0;

    const interval = setInterval(() => {
      if (isPaused) {
        pauseCounter++;
        if (pauseCounter >= 3) { // Pause: 3 ticks = 5.4s at default speed
          isPaused = false;
          pauseCounter = 0;
          currentStepIndex = (currentStepIndex + 1) % steps.length;
          currentLogIndex = -1;
          setFamilyAnimationPhase(currentStepIndex);
          setFamilyLogIndex(-1);
        }
        return;
      }

      const currentStep = steps[currentStepIndex];
      const totalLogs = currentStep.orchestrationLogs.length;

      if (currentLogIndex < totalLogs - 1) {
        currentLogIndex++;
        setFamilyLogIndex(currentLogIndex);
      } else {
        isPaused = true;
      }
    }, familySpeed);

    return () => clearInterval(interval);
  }, [activeFamilyScenario, customFamilyScenario, familyIsPaused, familySpeed, familyAnimationPhase, familyLogIndex, isFamilySectionVisible]);

  // Trigger communication windows based on current log
  React.useEffect(() => {
    const scenario = customFamilyScenario || familyScenarios[activeFamilyScenario];
    const currentStep = scenario.orchestrationSteps?.[familyAnimationPhase];

    if (!currentStep || familyLogIndex < 0) return;

    const currentLog = currentStep.orchestrationLogs[familyLogIndex]?.text;
    const communications = currentStep.communications || [];

    // Find matching communication
    const matchedComm = communications.find(comm => comm.trigger === currentLog);

    if (matchedComm) {
      setActiveComm(matchedComm);
      setIsCommFadingOut(false);

      // Clear any existing timeout
      if (commTimeoutRef.current) {
        clearTimeout(commTimeoutRef.current);
      }

      // Auto-hide after showing all messages (1200ms per message + 2s buffer)
      const duration = matchedComm.messages.length * 1200 + 2000;
      commTimeoutRef.current = setTimeout(() => {
        setIsCommFadingOut(true);
        // Actually remove after fade-out animation (800ms)
        setTimeout(() => setActiveComm(null), 800);
      }, duration);
    }
  }, [familyLogIndex, familyAnimationPhase, activeFamilyScenario, customFamilyScenario]);

  // Clear communication timeout when paused
  React.useEffect(() => {
    if (familyIsPaused && commTimeoutRef.current) {
      clearTimeout(commTimeoutRef.current);
      commTimeoutRef.current = null;
    }
  }, [familyIsPaused]);

  // Auto-scroll terminal and chat to latest content - smooth version
  React.useEffect(() => {
    const terminalElement = document.getElementById('terminal-logs');
    const chatElement = document.getElementById('chat-messages');
    const familyOrchestration = document.getElementById('family-orchestration');

    if (terminalElement) {
      terminalElement.scrollTo({
        top: terminalElement.scrollHeight,
        behavior: 'smooth'
      });
    }

    if (chatElement) {
      chatElement.scrollTo({
        top: chatElement.scrollHeight,
        behavior: 'smooth'
      });
    }

    if (familyOrchestration) {
      familyOrchestration.scrollTo({
        top: familyOrchestration.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [logIndex, animationPhase, familyLogIndex, familyAnimationPhase]);

  // System crash sequence
  const triggerSystemCrash = () => {
    if (isCrashing) return;

    setIsCrashing(true);

    // Phase 1: Panic (errors flood the terminal)
    setCrashPhase('panic');

    setTimeout(() => {
      // Phase 2: Shutdown
      setCrashPhase('shutdown');
    }, 2000);

    setTimeout(() => {
      // Phase 3: Reboot
      setCrashPhase('reboot');
    }, 3500);

    setTimeout(() => {
      // Phase 4: Back to normal
      setCrashPhase('idle');
      setIsCrashing(false);
      setAnimationPhase(0);
      setLogIndex(-1);
    }, 6000);
  };

  const generateCustomScenario = async () => {
    if (!customPrompt.trim() || isGenerating) return;

    setIsGenerating(true);
    try {
      const response = await fetch('/api/generate-scenario', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: customPrompt,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('API error:', errorData);
        throw new Error(errorData.error || 'Failed to generate scenario');
      }

      const data = await response.json();

      setCustomScenario(data.scenario);
      setAnimationPhase(0);
      setLogIndex(0);
    } catch (error) {
      console.error('Failed to generate scenario:', error);
      alert(`Failed to generate scenario: ${error instanceof Error ? error.message : 'Please try again.'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const createDemoSpace = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/spaces`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Demo Space' }),
      });
      if (!res.ok) throw new Error('Failed to create space');
      const json = await res.json();
      router.push(`/s/${json.id}`);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const offset = 100; // Account for sticky header
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  React.useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: '-20% 0px -70% 0px',
      threshold: 0
    };

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const sectionId = entry.target.id as 'individual' | 'family' | 'corporate';
          setActiveSection(sectionId);
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);

    const sections = ['individual', 'family', 'corporate'];
    sections.forEach((id) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  // Anime.js animations
  useEffect(() => {
    // Hero section entrance animation on mount
    if (heroRef.current) {
      animate(heroRef.current.querySelectorAll('h1, p'), {
        opacity: [0, 1],
        translateY: [30, 0],
        duration: 1200,
        delay: stagger(150),
        easing: 'out(3)'
      });

      animate(heroRef.current.querySelectorAll('button'), {
        opacity: [0, 1],
        scale: [0.9, 1],
        duration: 800,
        delay: 600,
        easing: 'outElastic(1, .6)'
      });
    }

    // Setup intersection observer for scroll-triggered animations
    const animationObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !entry.target.classList.contains('animated')) {
            entry.target.classList.add('animated');

            // Animate card sections with stagger effect
            animate(entry.target, {
              opacity: [0, 1],
              translateY: [60, 0],
              duration: 1000,
              easing: 'out(3)'
            });

            // Animate children elements with stagger
            const children = entry.target.querySelectorAll('.animate-on-scroll');
            if (children.length > 0) {
              animate(children, {
                opacity: [0, 1],
                translateY: [40, 0],
                duration: 800,
                delay: stagger(100),
                easing: 'out(3)'
              });
            }
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
      }
    );

    // Observe card sections
    const cardRefs = [individualCardRef, familySectionRef, corporateCardRef, ctaSectionRef];
    cardRefs.forEach(ref => {
      if (ref.current) {
        animationObserver.observe(ref.current);
      }
    });

    return () => animationObserver.disconnect();
  }, []);

  return (
    <main className="min-h-screen bg-[#F5F3F0]">
      {/* Hero Section with Animated Gradient */}
      <div className="relative overflow-hidden pb-20">
        {/* Animated Gradient Background */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-[#FFF9F5] to-[#F5F3F0]"></div>

          {/* Animated Blobs */}
          <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-gradient-to-br from-[#FFD4C4]/40 to-[#FFA07A]/30 rounded-full blur-3xl animate-blob"></div>
          <div className="absolute top-[10%] right-[-5%] w-[500px] h-[500px] bg-gradient-to-br from-[#CC785C]/30 to-[#D68A6D]/25 rounded-full blur-3xl animate-blob animation-delay-2000"></div>
          <div className="absolute bottom-[-10%] left-[20%] w-[550px] h-[550px] bg-gradient-to-br from-[#FFE8D6]/35 to-[#FFDDC1]/30 rounded-full blur-3xl animate-blob animation-delay-4000"></div>

          {/* Pulsing Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#CC785C]/5 via-transparent to-[#D68A6D]/5 animate-pulse-slow"></div>
        </div>

        {/* Mental burdens floating away */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          {mentalBurdens.map((item, idx) => (
            <div
              key={idx}
              className={`absolute bg-gradient-to-br from-[#CC785C]/20 to-[#D68A6D]/15 backdrop-blur-md px-4 py-2.5 rounded-2xl text-xs text-[#2B1E16] font-medium whitespace-nowrap shadow-lg border border-[#CC785C]/30 ${item.animation}`}
              style={{
                left: item.left,
                top: item.top,
                filter: 'blur(0.5px)',
              }}
            >
              {item.text}
            </div>
          ))}
        </div>

        {/* Content */}
        <div ref={heroRef} className="relative z-10 max-w-6xl mx-auto px-6 pt-32 pb-24">
          <div className="text-center space-y-8">
            <h1 className="text-7xl font-bold leading-tight tracking-tight animate-shake-intense">
              <span className="block text-[#2B1E16]">You're Wasting</span>
              <span className="block bg-gradient-to-r from-[#CC785C] to-[#D68A6D] bg-clip-text text-transparent">
                80% of Your Energy
              </span>
            </h1>
            <p className="text-xl text-[#5A4A40] max-w-2xl mx-auto leading-relaxed">
              On coordination. Not achievement. Build structure once, create accountability forever.
            </p>
            <div className="flex gap-4 justify-center pt-4">
              <Link href="/create-space">
                <button className="bg-[#CC785C] hover:bg-[#B86A4D] text-white px-8 py-4 text-lg rounded-full shadow-lg hover:shadow-xl transition-all font-semibold">
                  Create Space
                </button>
              </Link>
              <Link href="/explore">
                <button className="bg-white hover:bg-[#FFF9F5] text-[#2B1E16] px-8 py-4 text-lg rounded-full border-2 border-[#E8D5CC] transition-all font-semibold">
                  Explore
                </button>
              </Link>
            </div>
          </div>
        </div>

        {/* Wave transition at bottom */}
        <div className="absolute bottom-0 left-0 right-0 z-10">
          <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
            <path
              d="M0,64 C240,100 480,100 720,64 C960,28 1200,28 1440,64 L1440,120 L0,120 Z"
              fill="#F5F3F0"
            />
          </svg>
        </div>
      </div>

      {/* Sticky Tab Navigation - Elevated Drawer */}
      <div className="sticky top-0 z-40 -mt-20 bg-gradient-to-b from-[#FFF9F5]/95 via-[#FFF9F5]/90 to-transparent backdrop-blur-md shadow-lg rounded-t-3xl border-t border-[#E8D5CC]/50">
        <div className="max-w-4xl mx-auto px-6 py-3">
          <div className="flex gap-8 justify-center items-center">
            <button
              onClick={() => scrollToSection('individual')}
              className={`text-sm font-medium transition-all relative pb-2 ${
                activeSection === 'individual'
                  ? 'text-[#CC785C]'
                  : 'text-[#5A4A40] hover:text-[#CC785C]'
              }`}
            >
              For You
              {activeSection === 'individual' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#CC785C] to-[#D68A6D] rounded-full"></span>
              )}
            </button>
            <span className="text-[#E8D5CC]">•</span>
            <button
              onClick={() => scrollToSection('family')}
              className={`text-sm font-medium transition-all relative pb-2 ${
                activeSection === 'family'
                  ? 'text-[#CC785C]'
                  : 'text-[#5A4A40] hover:text-[#CC785C]'
              }`}
            >
              For Family
              {activeSection === 'family' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#CC785C] to-[#D68A6D] rounded-full"></span>
              )}
            </button>
            <span className="text-[#E8D5CC]">•</span>
            <button
              onClick={() => scrollToSection('corporate')}
              className={`text-sm font-medium transition-all relative pb-2 ${
                activeSection === 'corporate'
                  ? 'text-[#CC785C]'
                  : 'text-[#5A4A40] hover:text-[#CC785C]'
              }`}
            >
              For Business
              {activeSection === 'corporate' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#CC785C] to-[#D68A6D] rounded-full"></span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Coordination Examples - Redesigned */}
      <div className="max-w-7xl mx-auto px-6 py-20">
        <div className="space-y-32">
          {/* Individual Section */}
          <div ref={individualCardRef} id="individual" className="scroll-mt-24 opacity-0">
            <div className="grid lg:grid-cols-2 gap-16 items-center animate-on-scroll">
              {/* Left: Cinema Side-by-Side View */}
              <div className={`relative h-[520px] bg-gradient-to-br from-[#2B1E16] to-[#1a1410] rounded-3xl overflow-hidden border-2 border-[#CC785C]/20 ${
                crashPhase === 'panic' ? 'animate-shake-intense' : ''
              }`}>
                {/* Header */}
                <div className="bg-gradient-to-r from-[#CC785C]/20 to-[#D68A6D]/20 px-4 py-2 border-b border-[#CC785C]/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1.5">
                        <button
                          onClick={triggerSystemCrash}
                          className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 cursor-pointer transition-all hover:scale-110 active:scale-95"
                          title="Close (Easter Egg!)"
                        ></button>
                        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                      </div>
                      <span className="text-xs font-mono text-[#CC785C] ml-2">{currentScenario.title} • live_execution.rouh</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        isCrashing ? 'bg-red-500' : 'bg-green-500'
                      } animate-pulse`}></div>
                      <span className="text-xs text-[#5A4A40]">
                        {isCrashing ? 'ERROR' : 'RUNNING'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex h-[478px]">
                  {/* LEFT: Behind The Scenes (Terminal) */}
                  <div className="w-1/2 bg-[#1a1410] p-4 overflow-hidden border-r border-[#CC785C]/20">
                    <div className="h-full flex flex-col font-mono">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-[#CC785C] uppercase tracking-wide">System Activity</p>
                        <div className="text-[10px] text-[#5A4A40]">
                          Step {animationPhase + 1}/{currentScenario.cinematicSteps?.length || 0}
                        </div>
                      </div>

                      <div className="flex-1 overflow-hidden relative">
                        {crashPhase === 'idle' ? (
                          <div className="absolute inset-0 overflow-y-auto space-y-1.5 pt-3 pb-4" id="terminal-logs">
                            {currentScenario.cinematicSteps?.map((step, stepIdx) => {
                              const isCurrentStep = stepIdx === animationPhase;
                              const isPastStep = stepIdx < animationPhase;

                              return (
                                <div key={stepIdx}>
                                  {step.backgroundLogs.map((log, logIdx) => {
                                    const isVisible = isPastStep || (isCurrentStep && logIdx <= logIndex);
                                    const isCurrent = isCurrentStep && logIdx === logIndex;

                                    if (!isVisible) return null;

                                    return (
                                      <div
                                        key={`${stepIdx}-${logIdx}`}
                                        className={`text-[10px] transition-all duration-500 ${
                                          isPastStep ? 'text-[#5A4A40]/70' : isCurrent ? 'text-[#CC785C] font-semibold' : 'text-[#5A4A40]'
                                        }`}
                                      >
                                        <span className={`${isPastStep ? 'text-[#5A4A40]/50' : 'text-[#5A4A40]/60'}`}>
                                          [{String(stepIdx * 10 + logIdx).padStart(2, '0')}]
                                        </span>{' '}
                                        {log.text}
                                        {isCurrent && <span className="animate-pulse ml-0.5">_</span>}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        ) : crashPhase === 'panic' ? (
                          <div className="absolute inset-0 overflow-hidden space-y-0.5 animate-pulse">
                            {Array.from({ length: 40 }).map((_, idx) => (
                              <div key={idx} className="text-[10px] text-red-500 font-mono">
                                ❌ CRITICAL ERROR: Memory allocation failed at 0x{Math.random().toString(16).slice(2, 10)}
                              </div>
                            ))}
                          </div>
                        ) : crashPhase === 'shutdown' ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#000000]">
                            <div className="text-2xl text-red-500 font-mono mb-4">⚠️</div>
                            <div className="text-sm text-red-400 font-mono mb-2">SYSTEM OFFLINE</div>
                            <div className="text-[10px] text-[#5A4A40] font-mono">Kernel panic - not syncing</div>
                          </div>
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <div className="text-[#CC785C] font-mono mb-4">
                              <div className="text-sm mb-2">⟳ REBOOTING SYSTEM...</div>
                              <div className="w-48 h-1.5 bg-[#2B1E16] rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-[#CC785C] to-[#D68A6D] animate-pulse" style={{width: '70%'}}></div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Terminal fade at top and bottom */}
                        {crashPhase === 'idle' && (
                          <>
                            <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-[#1a1410] to-transparent pointer-events-none"></div>
                            <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[#1a1410] to-transparent pointer-events-none"></div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* RIGHT: Your Experience (Chat Interface) */}
                  <div className={`w-1/2 bg-gradient-to-br from-[#FFF9F5] to-[#FFF4E6] flex flex-col relative ${
                    isCrashing ? 'opacity-50 pointer-events-none' : ''
                  }`}>
                    {isCrashing && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm z-50">
                        <div className="text-[#CC785C] font-mono text-xs">Connection lost...</div>
                      </div>
                    )}

                    {/* Chat Header */}
                    <div className="px-3 py-2 border-b border-[#E8D5CC]/50">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold text-xs ${
                          isCrashing ? 'from-gray-400 to-gray-500' : 'from-[#CC785C] to-[#D68A6D]'
                        }`}>
                          R
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-[#2B1E16]">Rouh</p>
                          <p className="text-[9px] text-[#5A4A40]">
                            {isCrashing ? 'Disconnected' : 'Your coordination assistant'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Chat Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-2" id="chat-messages">
                      {currentScenario.cinematicSteps?.slice(0, animationPhase + 1).map((step, idx) => {
                        const msg = step.userMessage;
                        const isFromUser = msg.type === 'action';
                        const isLatest = idx === animationPhase;

                        return (
                          <div
                            key={idx}
                            className={`flex ${
                              isFromUser ? 'justify-end' : 'justify-start'
                            } transition-all duration-700 ease-out ${
                              isLatest ? 'animate-fade-in' : 'opacity-100'
                            }`}
                          >
                            {/* Message bubble */}
                            <div className={`max-w-[70%] ${
                              isFromUser
                                ? 'bg-gradient-to-r from-[#CC785C] to-[#D68A6D]'
                                : 'bg-white/90 backdrop-blur-sm'
                            } rounded-xl px-3 py-2 shadow-sm`}>
                              <p className={`text-xs leading-relaxed ${
                                isFromUser ? 'text-white' : 'text-[#2B1E16]'
                              }`}>
                                {msg.text}
                              </p>
                              <p className={`text-[9px] mt-1 ${
                                isFromUser ? 'text-white/60' : 'text-[#5A4A40]/70'
                              }`}>
                                {msg.time}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Chat Input */}
                    <div className="px-3 py-2 border-t border-[#E8D5CC]/50">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Type your response..."
                          className="flex-1 bg-white/80 border border-[#E8D5CC] rounded-lg px-3 py-1.5 text-xs text-[#2B1E16] placeholder:text-[#5A4A40]/50 focus:outline-none focus:border-[#CC785C] transition-colors"
                          disabled
                        />
                        <button className="w-8 h-8 rounded-lg bg-gradient-to-r from-[#CC785C] to-[#D68A6D] flex items-center justify-center text-white shadow-sm">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Content & Chat Input */}
              <div className="space-y-6">
                <div className="inline-block px-5 py-2 bg-gradient-to-r from-[#CC785C]/10 to-[#D68A6D]/10 rounded-full">
                  <span className="text-sm font-bold text-[#CC785C] tracking-wide">FOR YOU</span>
                </div>
                <h3 className="text-4xl font-bold text-[#2B1E16]">Mental Load to Auto-Pilot</h3>
                <p className="text-lg text-[#5A4A40] leading-relaxed">
                  Stop remembering, scheduling, following up. Give your tasks structure and they'll run themselves.
                </p>

                {/* Pre-built Scenarios */}
                <div className="pt-4">
                  <p className="text-sm font-semibold text-[#2B1E16] mb-3">Explore examples:</p>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(scenarios) as Array<keyof typeof scenarios>).map((key) => (
                      <button
                        key={key}
                        onClick={() => {
                          setActiveScenario(key);
                          setCustomScenario(null);
                          setAnimationPhase(0);
                          setLogIndex(0);
                        }}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                          activeScenario === key && !customScenario
                            ? 'bg-gradient-to-r from-[#CC785C] to-[#D68A6D] text-white shadow-md'
                            : 'bg-white text-[#5A4A40] hover:bg-[#FFF9F5] border border-[#E8D5CC]'
                        }`}
                      >
                        {scenarios[key].title}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Input */}
                <div className="pt-4 border-t border-[#E8D5CC]">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-[#2B1E16]">Or try your own:</p>
                    {customScenario && (
                      <span className="px-3 py-1 bg-gradient-to-r from-[#CC785C] to-[#D68A6D] text-white text-xs font-semibold rounded-full">
                        Custom Active
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && generateCustomScenario()}
                      placeholder="I keep forgetting to..."
                      className={`flex-1 bg-white border-2 focus:outline-none text-[#2B1E16] placeholder:text-[#5A4A40]/50 rounded-xl px-4 py-3 transition-colors ${
                        customScenario
                          ? 'border-[#CC785C] shadow-md'
                          : 'border-[#E8D5CC] focus:border-[#CC785C]'
                      }`}
                      disabled={isGenerating}
                    />
                    <button
                      onClick={generateCustomScenario}
                      disabled={isGenerating || !customPrompt.trim()}
                      className="bg-gradient-to-r from-[#CC785C] to-[#D68A6D] hover:from-[#B86A4D] hover:to-[#C57D5E] text-white px-6 py-3 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isGenerating ? 'Generating...' : 'Generate'}
                    </button>
                  </div>
                  <p className="text-xs text-[#5A4A40] mt-2">
                    Describe any recurring task and see how Rouh would automate it
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Family Section */}
          <div id="family" className="scroll-mt-24 opacity-0" ref={familySectionRef}>
            <div className="grid lg:grid-cols-2 gap-16 items-center animate-on-scroll">
              {/* Content - Left side this time */}
              <div className="space-y-6 lg:order-1">
                <div className="inline-block px-5 py-2 bg-gradient-to-r from-[#CC785C]/10 to-[#D68A6D]/10 rounded-full">
                  <span className="text-sm font-bold text-[#CC785C] tracking-wide">FAMILY</span>
                </div>
                <h3 className="text-4xl font-bold text-[#2B1E16]">Multi-Identity Coordination</h3>
                <p className="text-lg text-[#5A4A40] leading-relaxed">
                  Multiple identities with roles, shared policies, and collective decision-making. Each family member participates in coordinated flows.
                </p>

                <div className="space-y-4 pt-4">
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#CC785C] mt-2"></div>
                    <div>
                      <h5 className="font-semibold text-[#2B1E16] mb-1">Daily Routines</h5>
                      <p className="text-sm text-[#5A4A40]">Schedules, meals, activities—identities for each member</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#CC785C] mt-2"></div>
                    <div>
                      <h5 className="font-semibold text-[#2B1E16] mb-1">Education Coordination</h5>
                      <p className="text-sm text-[#5A4A40]">Parent-teacher, homework, roles for students & educators</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#CC785C] mt-2"></div>
                    <div>
                      <h5 className="font-semibold text-[#2B1E16] mb-1">Trip Planning</h5>
                      <p className="text-sm text-[#5A4A40]">Vacation coordination with preferences per member</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Family Command Center - Split Screen Cinema */}
              <div className="group relative h-[600px] bg-gradient-to-br from-[#FFF9F5] to-[#FFF4E6] rounded-3xl border-2 border-[#E8D5CC] overflow-hidden lg:order-2">

                {/* Floating Live Communication Window */}
                {activeComm && (
                  <div className={`absolute bottom-6 right-6 z-30 ${isCommFadingOut ? 'animate-fade-out' : 'animate-fade-in'}`}>
                    <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-[#CC785C]/30 overflow-hidden w-72">
                      {/* Header */}
                      <div className="bg-gradient-to-r from-[#CC785C]/20 to-[#D68A6D]/20 px-4 py-2 border-b border-[#E8D5CC] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-[#CC785C] rounded-full animate-pulse"></div>
                          <span className="text-[10px] font-bold text-[#2B1E16] tracking-wide">
                            LIVE: {activeComm.from} → {activeComm.to}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            setIsCommFadingOut(true);
                            setTimeout(() => setActiveComm(null), 800);
                          }}
                          className="text-[#5A4A40] hover:text-[#CC785C] transition-colors"
                        >
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>

                      {/* Messages */}
                      <div className="p-3 space-y-2 max-h-48 overflow-y-auto">
                        {activeComm.messages.map((msg, idx) => {
                          const isRouh = msg.sender === 'Rouh';
                          return (
                            <div
                              key={idx}
                              className={`flex ${isRouh ? 'justify-start' : 'justify-end'} animate-fade-in`}
                              style={{
                                animationDelay: `${idx * 1200}ms`,
                                opacity: 0,
                                animationFillMode: 'forwards'
                              }}
                            >
                              <div className={`max-w-[80%] ${
                                isRouh
                                  ? 'bg-gradient-to-br from-[#CC785C] to-[#D68A6D]'
                                  : 'bg-white/90 border border-[#E8D5CC]'
                              } rounded-xl px-3 py-2 shadow-sm`}>
                                <div className={`text-[9px] font-bold mb-0.5 ${
                                  isRouh ? 'text-white/80' : 'text-[#CC785C]'
                                }`}>
                                  {msg.sender}
                                </div>
                                <p className={`text-xs leading-relaxed ${
                                  isRouh ? 'text-white' : 'text-[#2B1E16]'
                                }`}>
                                  {msg.text}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Interactive Controls - Top Bar */}
                <div className="absolute top-4 left-4 right-4 z-20 space-y-3">
                  {/* Scenario Selector */}
                  <div className="flex gap-2 flex-wrap items-center">
                    <button
                      onClick={() => {
                        setActiveFamilyScenario('emergency');
                        setCustomFamilyScenario(null);
                        setFamilyAnimationPhase(0);
                        setFamilyLogIndex(-1);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        activeFamilyScenario === 'emergency' && !customFamilyScenario
                          ? 'bg-gradient-to-r from-[#CC785C] to-[#D68A6D] text-white shadow-lg'
                          : 'bg-white/60 text-[#5A4A40] hover:bg-white/80'
                      }`}
                    >
                      Emergency
                    </button>
                    <button
                      onClick={() => {
                        setActiveFamilyScenario('vacation');
                        setCustomFamilyScenario(null);
                        setFamilyAnimationPhase(0);
                        setFamilyLogIndex(-1);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        activeFamilyScenario === 'vacation' && !customFamilyScenario
                          ? 'bg-gradient-to-r from-[#CC785C] to-[#D68A6D] text-white shadow-lg'
                          : 'bg-white/60 text-[#5A4A40] hover:bg-white/80'
                      }`}
                    >
                      Vacation
                    </button>
                    <button
                      onClick={() => {
                        setActiveFamilyScenario('dinner');
                        setCustomFamilyScenario(null);
                        setFamilyAnimationPhase(0);
                        setFamilyLogIndex(-1);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        activeFamilyScenario === 'dinner' && !customFamilyScenario
                          ? 'bg-gradient-to-r from-[#CC785C] to-[#D68A6D] text-white shadow-lg'
                          : 'bg-white/60 text-[#5A4A40] hover:bg-white/80'
                      }`}
                    >
                      Dinner
                    </button>

                    <div className="h-4 w-px bg-[#E8D5CC]"></div>

                    <button
                      onClick={() => setShowFamilyCustomInput(!showFamilyCustomInput)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        customFamilyScenario
                          ? 'bg-gradient-to-r from-[#CC785C] to-[#D68A6D] text-white shadow-lg'
                          : 'bg-white/60 text-[#5A4A40] hover:bg-white/80'
                      }`}
                    >
                      ✨ Try Your Own
                    </button>
                  </div>

                  {/* Custom Input Field */}
                  {showFamilyCustomInput && (
                    <div className="flex gap-2 animate-fade-in">
                      <input
                        type="text"
                        value={familyCustomPrompt}
                        onChange={(e) => setFamilyCustomPrompt(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && generateFamilyScenario()}
                        placeholder="Describe your family coordination scenario..."
                        className="flex-1 px-3 py-2 rounded-lg text-xs bg-white/90 border border-[#E8D5CC] focus:outline-none focus:ring-2 focus:ring-[#CC785C]/50 text-[#2B1E16] placeholder:text-[#5A4A40]/50"
                        disabled={isGeneratingFamily}
                      />
                      <button
                        onClick={generateFamilyScenario}
                        disabled={isGeneratingFamily || !familyCustomPrompt.trim()}
                        className="px-4 py-2 rounded-lg text-xs font-medium bg-gradient-to-r from-[#CC785C] to-[#D68A6D] text-white hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isGeneratingFamily ? 'Generating...' : 'Generate'}
                      </button>
                    </div>
                  )}

                  {/* Playback Controls - Compact, hover-only */}
                  <div className="flex items-center gap-2 bg-white/70 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <button
                      onClick={() => setFamilyIsPaused(!familyIsPaused)}
                      className="px-2 py-1 rounded-md bg-gradient-to-r from-[#CC785C] to-[#D68A6D] text-white text-[10px] hover:shadow-md transition-all"
                    >
                      {familyIsPaused ? '▶' : '■'}
                    </button>

                    <div className="flex items-center gap-1.5 flex-1">
                      <input
                        type="range"
                        min="900"
                        max="3600"
                        step="450"
                        value={4500 - familySpeed}
                        onChange={(e) => setFamilySpeed(4500 - Number(e.target.value))}
                        className="flex-1 h-1 bg-[#E8D5CC] rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#CC785C]"
                      />
                      <span className="text-[9px] text-[#5A4A40] font-mono min-w-[32px]">
                        {familySpeed === 900 ? '2x' : familySpeed === 1350 ? '1.5x' : familySpeed === 1800 ? '1x' : familySpeed === 2700 ? '0.75x' : '0.5x'}
                      </span>
                    </div>

                    {/* Step Progress Dots */}
                    <div className="flex gap-1">
                      {currentFamilyScenario.orchestrationSteps?.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => jumpToFamilyStep(idx)}
                          className={`w-1.5 h-1.5 rounded-full transition-all ${
                            idx === familyAnimationPhase
                              ? 'bg-[#CC785C] scale-125'
                              : idx < familyAnimationPhase
                              ? 'bg-[#CC785C]/40'
                              : 'bg-[#E8D5CC]'
                          }`}
                          title={`Step ${idx + 1}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Unified step-by-step flow */}
                <div className="h-full pt-32 pb-4 px-4 overflow-y-auto space-y-4" id="family-orchestration">
                  {currentFamilyScenario.orchestrationSteps?.slice(0, familyAnimationPhase + 1).map((step, stepIdx) => {
                    const isCurrentStep = stepIdx === familyAnimationPhase;
                    const isPastStep = stepIdx < familyAnimationPhase;

                    return (
                      <div
                        key={stepIdx}
                        className={`transition-all duration-700 ${
                          isCurrentStep ? 'animate-fade-in' : isPastStep ? 'opacity-60' : ''
                        }`}
                      >
                        {/* Message Section */}
                        <div className="space-y-3 mb-4">
                          {step.groupChat.map((msg, msgIdx) => {
                            const isUser = msg.type === 'user';

                            return (
                              <div
                                key={msgIdx}
                                className={`flex ${isUser ? 'justify-end' : 'justify-start'} transition-all duration-1000 ease-out`}
                              >
                                <div className={`max-w-[75%] ${
                                  isUser
                                    ? 'bg-gradient-to-br from-[#CC785C] to-[#D68A6D] shadow-lg'
                                    : 'bg-white/95 backdrop-blur-sm border border-[#E8D5CC] shadow-md'
                                } rounded-2xl px-5 py-3 transform transition-all duration-700`}>
                                  <div className={`text-[10px] font-bold mb-1.5 ${
                                    isUser ? 'text-white/90' : 'text-[#CC785C]'
                                  }`}>
                                    {msg.from}
                                  </div>
                                  <p className={`text-sm leading-relaxed ${
                                    isUser ? 'text-white font-medium' : 'text-[#2B1E16] font-normal'
                                  }`}>
                                    {msg.text}
                                  </p>
                                  <p className={`text-[10px] mt-2 ${
                                    isUser ? 'text-white/60' : 'text-[#5A4A40]/70'
                                  }`}>
                                    {msg.time}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Visual Connector Arrow - More subtle */}
                        <div className="flex items-center gap-3 my-4 px-6">
                          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#CC785C]/20 to-transparent"></div>
                          <div className="text-[#CC785C]/50 text-sm font-light">↓</div>
                          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#CC785C]/20 to-transparent"></div>
                        </div>

                        {/* Orchestration Response - Smoother appearance */}
                        <div className={`bg-gradient-to-br from-[#1A1410] to-[#2B1E16] rounded-2xl border border-[#CC785C]/30 overflow-hidden shadow-2xl transition-all duration-1000 ${
                          isCurrentStep ? 'scale-100 opacity-100' : 'scale-98 opacity-90'
                        }`}>
                          <div className="bg-gradient-to-r from-[#2B1E16] to-[#1A1410] px-4 py-2.5 border-b border-[#CC785C]/20">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full transition-all duration-500 ${
                                  isCurrentStep ? 'bg-[#CC785C] animate-pulse shadow-lg shadow-[#CC785C]/50' : 'bg-[#5A4A40]/50'
                                }`}></div>
                                <span className="text-[10px] font-bold text-[#CC785C] tracking-wider font-mono">
                                  ROUH ORCHESTRATING
                                </span>
                              </div>

                              {/* Participants Bar - Shows who Rouh is communicating with */}
                              <div className="flex items-center gap-1.5">
                                {(() => {
                                  // Extract participants from current log
                                  const currentLog = isCurrentStep && familyLogIndex >= 0 ? step.orchestrationLogs[familyLogIndex]?.text : '';
                                  const participants = [
                                    { name: 'Dad', pattern: /dad/i, color: 'bg-blue-500' },
                                    { name: 'Mom', pattern: /mom/i, color: 'bg-pink-500' },
                                    { name: 'Kids', pattern: /kid|child|emma/i, color: 'bg-purple-500' },
                                    { name: 'Grandma', pattern: /grandma|grandmother/i, color: 'bg-orange-500' },
                                    { name: 'School', pattern: /school|nurse/i, color: 'bg-red-500' },
                                    { name: 'Vendor', pattern: /vendor|shop|pharmacy|hotel|restaurant|grocery/i, color: 'bg-green-500' },
                                  ];

                                  return participants.map((participant) => {
                                    const isActive = currentLog.match(participant.pattern);
                                    const isInvolved = step.orchestrationLogs.some(log => log.text.match(participant.pattern));

                                    if (!isInvolved) return null;

                                    return (
                                      <div
                                        key={participant.name}
                                        className={`relative flex items-center gap-1 px-2 py-0.5 rounded-full transition-all duration-500 ${
                                          isActive
                                            ? `${participant.color} shadow-lg scale-110`
                                            : 'bg-[#5A4A40]/20'
                                        }`}
                                      >
                                        <div className={`w-1 h-1 rounded-full transition-all duration-300 ${
                                          isActive ? 'bg-white animate-pulse' : 'bg-[#5A4A40]/50'
                                        }`}></div>
                                        <span className={`text-[9px] font-medium transition-colors duration-300 ${
                                          isActive ? 'text-white' : 'text-[#8A7A70]'
                                        }`}>
                                          {participant.name}
                                        </span>
                                        {isActive && (
                                          <div className="absolute inset-0 rounded-full animate-ping opacity-30 bg-white"></div>
                                        )}
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                          </div>

                          <div className="p-5 space-y-1.5">
                            {step.orchestrationLogs.map((log, logIdx) => {
                              const showLog = isPastStep || (isCurrentStep && logIdx <= familyLogIndex);
                              const isCurrent = isCurrentStep && logIdx === familyLogIndex;

                              if (!showLog) return null;

                              return (
                                <div
                                  key={logIdx}
                                  className={`text-[11px] transition-all duration-700 ease-in-out ${
                                    isCurrent
                                      ? 'text-[#CC785C] font-bold transform translate-x-0'
                                      : 'text-[#8A7A70] transform -translate-x-0'
                                  }`}
                                  style={{
                                    transitionDelay: `${logIdx * 50}ms`
                                  }}
                                >
                                  <span className="text-[#5A4A40]/50 font-mono text-[10px]">
                                    [{String(logIdx + 1).padStart(2, '0')}]
                                  </span>{' '}
                                  {log.text}
                                  {isCurrent && <span className="animate-pulse ml-1 text-[#CC785C]">▌</span>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Corporate Section */}
          <div ref={corporateCardRef} id="corporate" className="scroll-mt-24 opacity-0">
            <div className="grid lg:grid-cols-2 gap-16 items-center animate-on-scroll">
              {/* Visual representation - Dense Grid Matrix */}
              <div className="relative h-96 bg-gradient-to-br from-[#FFF9F5] to-[#FFF4E6] rounded-3xl p-12 flex items-center justify-center border-2 border-[#E8D5CC] overflow-hidden">
                {/* Complex grid pattern - Enterprise scale */}
                <div className="relative w-full h-full">
                  {/* Grid of cells showing organizational complexity */}
                  <div className="grid grid-cols-4 grid-rows-4 gap-3 w-full h-full">
                    {/* Row 1 */}
                    <div className="bg-gradient-to-br from-[#CC785C]/40 to-[#D68A6D]/30 rounded-lg shadow-md"></div>
                    <div className="bg-gradient-to-br from-[#CC785C]/30 to-[#D68A6D]/20 rounded-lg shadow-sm"></div>
                    <div className="bg-gradient-to-br from-[#CC785C] to-[#D68A6D] rounded-lg shadow-xl col-span-2 row-span-2">
                      <div className="absolute inset-2 bg-white/10 rounded-lg"></div>
                    </div>

                    {/* Row 2 */}
                    <div className="bg-gradient-to-br from-[#CC785C]/50 to-[#D68A6D]/40 rounded-lg shadow-lg"></div>
                    <div className="bg-gradient-to-br from-[#CC785C]/25 to-[#D68A6D]/20 rounded-lg shadow-sm"></div>

                    {/* Row 3 */}
                    <div className="bg-gradient-to-br from-[#CC785C]/35 to-[#D68A6D]/25 rounded-lg shadow-md"></div>
                    <div className="bg-gradient-to-br from-[#CC785C]/60 to-[#D68A6D]/50 rounded-lg shadow-lg col-span-2">
                      <div className="absolute inset-1 bg-white/5 rounded-lg"></div>
                    </div>
                    <div className="bg-gradient-to-br from-[#CC785C]/30 to-[#D68A6D]/20 rounded-lg shadow-sm"></div>

                    {/* Row 4 */}
                    <div className="bg-gradient-to-br from-[#CC785C]/45 to-[#D68A6D]/35 rounded-lg shadow-md"></div>
                    <div className="bg-gradient-to-br from-[#CC785C]/20 to-[#D68A6D]/15 rounded-lg shadow-sm"></div>
                    <div className="bg-gradient-to-br from-[#CC785C]/40 to-[#D68A6D]/30 rounded-lg shadow-md"></div>
                    <div className="bg-gradient-to-br from-[#CC785C]/55 to-[#D68A6D]/45 rounded-lg shadow-lg"></div>
                  </div>

                  {/* Overlay grid lines */}
                  <div className="absolute inset-0 pointer-events-none">
                    <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                      {/* Horizontal lines */}
                      <line x1="0" y1="25%" x2="100%" y2="25%" stroke="#CC785C" strokeWidth="0.5" opacity="0.1"/>
                      <line x1="0" y1="50%" x2="100%" y2="50%" stroke="#CC785C" strokeWidth="0.5" opacity="0.1"/>
                      <line x1="0" y1="75%" x2="100%" y2="75%" stroke="#CC785C" strokeWidth="0.5" opacity="0.1"/>

                      {/* Vertical lines */}
                      <line x1="25%" y1="0" x2="25%" y2="100%" stroke="#CC785C" strokeWidth="0.5" opacity="0.1"/>
                      <line x1="50%" y1="0" x2="50%" y2="100%" stroke="#CC785C" strokeWidth="0.5" opacity="0.1"/>
                      <line x1="75%" y1="0" x2="75%" y2="100%" stroke="#CC785C" strokeWidth="0.5" opacity="0.1"/>

                      {/* Diagonal accents */}
                      <line x1="20%" y1="20%" x2="40%" y2="40%" stroke="#CC785C" strokeWidth="1" opacity="0.15" strokeDasharray="2 2"/>
                      <line x1="60%" y1="30%" x2="80%" y2="50%" stroke="#CC785C" strokeWidth="1" opacity="0.15" strokeDasharray="2 2"/>
                    </svg>
                  </div>

                  {/* Floating accent elements */}
                  <div className="absolute top-4 right-4 w-3 h-3 bg-[#CC785C] rounded-full blur-sm opacity-40"></div>
                  <div className="absolute bottom-8 left-8 w-4 h-4 bg-[#D68A6D] rounded-full blur-sm opacity-30"></div>

                  {/* Complexity indicator */}
                  <div className="absolute bottom-4 right-4 px-3 py-1.5 bg-white/80 backdrop-blur-sm rounded-full text-xs font-mono text-[#CC785C] font-semibold z-20">
                    Complex
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="space-y-6">
                <div className="inline-block px-5 py-2 bg-gradient-to-r from-[#CC785C]/10 to-[#D68A6D]/10 rounded-full">
                  <span className="text-sm font-bold text-[#CC785C] tracking-wide">CORPORATE</span>
                </div>
                <h3 className="text-4xl font-bold text-[#2B1E16]">Enterprise Coordination</h3>
                <p className="text-lg text-[#5A4A40] leading-relaxed">
                  Organization-wide blueprints with hierarchical roles, compliance policies, audit trails, and multi-department workflows.
                </p>

                <div className="space-y-4 pt-4">
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#CC785C] mt-2"></div>
                    <div>
                      <h5 className="font-semibold text-[#2B1E16] mb-1">Service Operations</h5>
                      <p className="text-sm text-[#5A4A40]">Field service workflows with SLA tracking & routing</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#CC785C] mt-2"></div>
                    <div>
                      <h5 className="font-semibold text-[#2B1E16] mb-1">Procurement Process</h5>
                      <p className="text-sm text-[#5A4A40]">Multi-stage approvals with compliance checks</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#CC785C] mt-2"></div>
                    <div>
                      <h5 className="font-semibold text-[#2B1E16] mb-1">Employee Onboarding</h5>
                      <p className="text-sm text-[#5A4A40]">IT, HR, training—coordinated cross-department flows</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section - Redesigned */}
      <div ref={ctaSectionRef} className="relative py-32 overflow-hidden opacity-0">
        {/* Background with subtle gradient */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-[#F5F3F0] via-[#FFF9F5] to-[#F5F3F0]"></div>
          {/* Floating geometric elements */}
          <div className="absolute top-10 left-[10%] w-32 h-32 bg-[#CC785C]/5 rounded-2xl rotate-12 blur-sm"></div>
          <div className="absolute bottom-20 right-[15%] w-40 h-40 bg-[#D68A6D]/5 rounded-3xl -rotate-6 blur-sm"></div>
        </div>

        <div className="relative max-w-6xl mx-auto px-6">
          {/* Main CTA Card */}
          <div className="relative bg-white rounded-[2.5rem] border-2 border-[#E8D5CC] overflow-hidden shadow-xl">
            {/* Accent gradient bar */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#CC785C] via-[#D68A6D] to-[#CC785C]"></div>

            <div className="p-16">
              {/* Header */}
              <div className="text-center mb-12">
                <div className="inline-block px-5 py-2 bg-gradient-to-r from-[#CC785C]/10 to-[#D68A6D]/10 rounded-full mb-6">
                  <span className="text-sm font-bold text-[#CC785C] tracking-wide">GET STARTED</span>
                </div>
                <h2 className="text-5xl font-bold text-[#2B1E16] mb-4">
                  Start Coordinating Today
                </h2>
                <p className="text-xl text-[#5A4A40] max-w-2xl mx-auto">
                  Create your space, design a blueprint, watch it run
                </p>
              </div>

              {/* Action Grid */}
              <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-12 animate-on-scroll">
                {/* Launch Demo Card */}
                <div className="group relative bg-gradient-to-br from-[#FFF9F5] to-[#FFF4E6] rounded-2xl p-8 border-2 border-[#E8D5CC] hover:border-[#CC785C] transition-all cursor-pointer"
                     onClick={createDemoSpace}>
                  <div className="absolute top-4 right-4 w-12 h-12 bg-gradient-to-br from-[#CC785C] to-[#D68A6D] rounded-xl opacity-10 group-hover:opacity-20 transition-opacity"></div>
                  <div className="relative">
                    <div className="w-12 h-12 bg-gradient-to-br from-[#CC785C] to-[#D68A6D] rounded-xl flex items-center justify-center mb-4 shadow-lg">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-[#2B1E16] mb-2">Quick Start</h3>
                    <p className="text-sm text-[#5A4A40] mb-6">
                      Launch a demo space and explore coordination blueprints in action
                    </p>
                    <button
                      disabled={busy}
                      className="w-full bg-gradient-to-r from-[#CC785C] to-[#D68A6D] hover:from-[#B86A4D] hover:to-[#C57D5E] text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {busy ? 'Creating...' : 'Launch Demo'}
                    </button>
                  </div>
                </div>

                {/* Explore Library Card */}
                <Link href="/explore" className="block">
                  <div className="group relative bg-gradient-to-br from-[#FFF9F5] to-[#FFF4E6] rounded-2xl p-8 border-2 border-[#E8D5CC] hover:border-[#CC785C] transition-all h-full">
                    <div className="absolute top-4 right-4 w-12 h-12 bg-gradient-to-br from-[#CC785C] to-[#D68A6D] rounded-xl opacity-10 group-hover:opacity-20 transition-opacity"></div>
                    <div className="relative">
                      <div className="w-12 h-12 bg-gradient-to-br from-[#D68A6D] to-[#CC785C] rounded-xl flex items-center justify-center mb-4 shadow-lg">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                      </div>
                      <h3 className="text-xl font-bold text-[#2B1E16] mb-2">Blueprint Library</h3>
                      <p className="text-sm text-[#5A4A40] mb-6">
                        Browse ready-made blueprints for common coordination scenarios
                      </p>
                      <button
                        className="w-full bg-white hover:bg-[#FFF9F5] text-[#2B1E16] px-6 py-3 rounded-xl font-semibold border-2 border-[#E8D5CC] transition-all"
                      >
                        Explore Templates
                      </button>
                    </div>
                  </div>
                </Link>
              </div>

              {/* Space ID Input */}
              <div className="max-w-2xl mx-auto">
                <div className="bg-gradient-to-r from-[#FFF9F5] to-[#FFF4E6] rounded-2xl p-8 border border-[#E8D5CC]/50">
                  <p className="text-sm font-semibold text-[#5A4A40] mb-4 text-center">
                    Already have a space ID?
                  </p>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="Enter space ID..."
                      value={spaceId}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSpaceId(e.target.value)}
                      className="flex-1 bg-white border-2 border-[#E8D5CC] focus:border-[#CC785C] focus:outline-none text-[#2B1E16] placeholder:text-[#5A4A40]/50 rounded-xl px-6 py-3 transition-colors"
                    />
                    <Link href={spaceId ? `/s/${spaceId}` : '#'}>
                      <button
                        disabled={!spaceId}
                        className="bg-[#2B1E16] hover:bg-[#3D3027] text-white rounded-xl px-8 py-3 font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        Open
                      </button>
                    </Link>
                  </div>
                </div>
              </div>

              {/* Feature Highlights */}
              <div className="grid md:grid-cols-4 gap-6 mt-12 pt-12 border-t border-[#E8D5CC]">
                <div className="text-center">
                  <div className="w-8 h-8 mx-auto mb-3 text-[#CC785C]">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-[#2B1E16]">RLS-First</p>
                </div>
                <div className="text-center">
                  <div className="w-8 h-8 mx-auto mb-3 text-[#CC785C]">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-[#2B1E16]">Gradual Autonomy</p>
                </div>
                <div className="text-center">
                  <div className="w-8 h-8 mx-auto mb-3 text-[#CC785C]">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-[#2B1E16]">Human-Visible State</p>
                </div>
                <div className="text-center">
                  <div className="w-8 h-8 mx-auto mb-3 text-[#CC785C]">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-[#2B1E16]">Continuous Learning</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center px-6 py-12 space-y-3">
        <p className="text-lg font-semibold text-[#2B1E16]">
          Rouh
        </p>
        <p className="text-sm text-[#5A4A40] max-w-2xl mx-auto">
          RLS-first • Gradual autonomy • Human-visible state • Continuous learning
        </p>
      </div>
    </main>
  );
}
