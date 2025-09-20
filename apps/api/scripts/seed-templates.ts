import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const templates = [
  {
    name: 'Medical Practice',
    domain: 'healthcare',
    description: 'For doctors, clinics, and medical professionals to provide guidance and book consultations',
    schemaJson: {
      fields: [
        { name: 'specialty', type: 'string', required: true },
        { name: 'credentials', type: 'array', required: false },
        { name: 'consultation_fee', type: 'number', required: false },
        { name: 'availability', type: 'object', required: true },
      ],
    },
    configJson: {
      actions: ['consultation', 'inquiry', 'appointment'],
      integrations: ['calendly', 'square', 'email'],
      defaultRules: [
        {
          category: 'faq',
          conditions: { keywords: ['hours', 'when', 'open'] },
          responses: { text: 'I\'m available {hours}. Would you like to schedule a consultation?' }
        }
      ]
    },
    policyJson: {
      autonomy: 'L1',
      consent_required: true,
      price_disclosure: true,
    },
  },
  {
    name: 'Restaurant & Café',
    domain: 'food',
    description: 'For restaurants and cafés to take orders, answer questions, and manage reservations',
    schemaJson: {
      fields: [
        { name: 'menu', type: 'object', required: true },
        { name: 'hours', type: 'object', required: true },
        { name: 'pickup_time', type: 'number', required: true },
        { name: 'delivery_available', type: 'boolean', required: false },
      ],
    },
    configJson: {
      actions: ['order', 'reservation', 'inquiry'],
      integrations: ['square', 'toast', 'uber_eats', 'email'],
      defaultRules: [
        {
          category: 'menu',
          conditions: { keywords: ['menu', 'food', 'drink', 'coffee'] },
          responses: { text: 'Here\'s what we have available today...', actions: ['view_menu', 'place_order'] }
        }
      ]
    },
    policyJson: {
      autonomy: 'L2',
      auto_confirm_under: 50,
      require_phone: true,
    },
  },
  {
    name: 'Educational Institution',
    domain: 'education',
    description: 'For schools, tutors, and educational services to communicate and schedule',
    schemaJson: {
      fields: [
        { name: 'grade_levels', type: 'array', required: true },
        { name: 'subjects', type: 'array', required: true },
        { name: 'meeting_types', type: 'array', required: true },
        { name: 'staff', type: 'object', required: false },
      ],
    },
    configJson: {
      actions: ['schedule', 'inquiry', 'report'],
      integrations: ['zoom', 'google_calendar', 'email'],
      defaultRules: [
        {
          category: 'schedule',
          conditions: { keywords: ['meeting', 'conference', 'teacher'] },
          responses: { text: 'I can help schedule a parent-teacher meeting. When works best for you?' }
        }
      ]
    },
    policyJson: {
      autonomy: 'L1',
      parent_consent: true,
      privacy_compliant: true,
    },
  },
  {
    name: 'Professional Services',
    domain: 'consulting',
    description: 'For consultants, lawyers, accountants, and other professional service providers',
    schemaJson: {
      fields: [
        { name: 'services', type: 'array', required: true },
        { name: 'expertise', type: 'array', required: true },
        { name: 'rate', type: 'number', required: false },
        { name: 'consultation_types', type: 'array', required: true },
      ],
    },
    configJson: {
      actions: ['consultation', 'inquiry', 'quote'],
      integrations: ['calendly', 'stripe', 'zoom', 'email'],
      defaultRules: [
        {
          category: 'services',
          conditions: { keywords: ['help', 'service', 'consultation'] },
          responses: { text: 'I provide {services}. What specific challenge can I help you with?' }
        }
      ]
    },
    policyJson: {
      autonomy: 'L1',
      consultation_required: true,
      confidentiality: true,
    },
  },
  {
    name: 'Automotive Services',
    domain: 'automotive',
    description: 'For car dealerships, mechanics, and automotive service providers',
    schemaJson: {
      fields: [
        { name: 'services', type: 'array', required: true },
        { name: 'brands', type: 'array', required: false },
        { name: 'inventory', type: 'object', required: false },
        { name: 'booking_required', type: 'boolean', required: true },
      ],
    },
    configJson: {
      actions: ['appointment', 'inquiry', 'quote', 'test_drive'],
      integrations: ['salesforce', 'google_calendar', 'email'],
      defaultRules: [
        {
          category: 'inventory',
          conditions: { keywords: ['car', 'vehicle', 'available'] },
          responses: { text: 'Let me show you what we have available. What are you looking for?' }
        }
      ]
    },
    policyJson: {
      autonomy: 'L1',
      test_drive_verification: true,
      price_transparency: true,
    },
  },
];

async function seedTemplates() {
  console.log('Seeding Space templates...');

  for (const template of templates) {
    await prisma.spaceTemplate.upsert({
      where: { name: template.name },
      update: template,
      create: template,
    });
    console.log(`✓ ${template.name} template`);
  }

  console.log('✅ Space templates seeded successfully!');
}

seedTemplates()
  .catch((e) => {
    console.error('Error seeding templates:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });