import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const demoSpaces = [
  {
    name: 'Dr. Jasem Medical Consultation',
    description: 'Get expert medical advice and book consultations with Dr. Jasem, a board-certified family physician.',
    category: 'healthcare',
    tags: ['medical', 'consultation', 'family medicine'],
    isPublic: true,
    verified: true,
    templateId: null, // Will be set after finding the template
    providerProfile: {
      businessName: 'Dr. Jasem Family Clinic',
      contactName: 'Dr. Jasem Al-Rashid',
      email: 'info@drjasemclinic.com',
      phone: '+965 2222 3333',
      website: 'https://drjasemclinic.com',
      bio: 'Board-certified family physician with 15+ years of experience. Specializing in preventive care, chronic disease management, and family health.',
      rating: 4.8,
      reviewCount: 127,
      responseTime: 15,
    },
    rules: [
      {
        name: 'Medical Consultation Booking',
        description: 'Handle requests for medical consultations and appointments',
        category: 'appointment',
        conditions: {
          keywords: ['appointment', 'consultation', 'book', 'schedule', 'see doctor']
        },
        responses: {
          text: "I'd be happy to help you schedule a consultation with Dr. Jasem. What type of consultation do you need?",
          actions: ['Book Consultation', 'Check Availability', 'View Fees']
        },
        priority: 10,
        isActive: true,
      },
      {
        name: 'General Medical Questions',
        description: 'Provide general health information and guidance',
        category: 'faq',
        conditions: {
          keywords: ['symptoms', 'health', 'medical', 'advice', 'help']
        },
        responses: {
          text: "I can provide general health information, but for specific medical concerns, I recommend scheduling a consultation with Dr. Jasem for proper evaluation.",
          actions: ['Book Consultation', 'Emergency Info', 'Health Tips']
        },
        priority: 20,
        isActive: true,
      }
    ]
  },
  {
    name: 'Downtown Café Orders',
    description: 'Order your favorite coffee and pastries from Downtown Café. Fresh, locally roasted beans and homemade treats.',
    category: 'food',
    tags: ['coffee', 'cafe', 'food', 'delivery'],
    isPublic: true,
    verified: false,
    templateId: null, // Will be set after finding the template
    providerProfile: {
      businessName: 'Downtown Café',
      contactName: 'Sarah Johnson',
      email: 'hello@downtowncafe.com',
      phone: '+1 555 COFFEE',
      website: 'https://downtowncafe.com',
      bio: 'Locally owned café serving freshly roasted coffee and homemade pastries since 2018. We pride ourselves on quality ingredients and community connection.',
      rating: 4.6,
      reviewCount: 89,
      responseTime: 5,
    },
    rules: [
      {
        name: 'Menu and Ordering',
        description: 'Handle menu inquiries and food orders',
        category: 'order',
        conditions: {
          keywords: ['menu', 'order', 'coffee', 'food', 'drink', 'latte', 'cappuccino']
        },
        responses: {
          text: "Here's our menu! What can I get started for you today? Our specialty lattes and fresh pastries are customer favorites.",
          actions: ['View Full Menu', 'Place Order', 'Daily Specials']
        },
        priority: 10,
        isActive: true,
      },
      {
        name: 'Hours and Location',
        description: 'Provide information about operating hours and location',
        category: 'faq',
        conditions: {
          keywords: ['hours', 'open', 'closed', 'location', 'address', 'when']
        },
        responses: {
          text: "We're open Monday-Friday 6:30am-6pm, weekends 7am-4pm. Located at 123 Main Street downtown. Pickup usually ready in 10-15 minutes!",
          actions: ['Get Directions', 'Call Us', 'Place Order']
        },
        priority: 20,
        isActive: true,
      }
    ]
  },
  {
    name: 'Elite Auto Sales',
    description: 'Find your perfect car at Elite Auto Sales. Quality pre-owned vehicles with transparent pricing and full service support.',
    category: 'automotive',
    tags: ['cars', 'automotive', 'sales', 'financing'],
    isPublic: true,
    verified: true,
    templateId: null, // Will be set after finding the template
    providerProfile: {
      businessName: 'Elite Auto Sales',
      contactName: 'Mike Rodriguez',
      email: 'sales@eliteautosales.com',
      phone: '+1 555 AUTO-123',
      website: 'https://eliteautosales.com',
      bio: 'Family-owned dealership serving the community for 20+ years. We specialize in quality pre-owned vehicles with honest pricing and exceptional service.',
      rating: 4.7,
      reviewCount: 156,
      responseTime: 30,
    },
    rules: [
      {
        name: 'Vehicle Inventory',
        description: 'Help customers find vehicles that match their needs',
        category: 'inquiry',
        conditions: {
          keywords: ['car', 'vehicle', 'looking for', 'buy', 'sedan', 'suv', 'truck']
        },
        responses: {
          text: "I'd love to help you find the perfect vehicle! What type of car are you looking for and what's your budget range?",
          actions: ['Browse Inventory', 'Schedule Test Drive', 'Get Pre-Approved']
        },
        priority: 10,
        isActive: true,
      },
      {
        name: 'Financing and Trade-ins',
        description: 'Provide information about financing options and trade-in values',
        category: 'inquiry',
        conditions: {
          keywords: ['financing', 'loan', 'payment', 'trade', 'trade-in', 'credit']
        },
        responses: {
          text: "We offer competitive financing options and fair trade-in values. Would you like to get pre-approved or get a trade-in estimate?",
          actions: ['Apply for Financing', 'Trade-in Value', 'Payment Calculator']
        },
        priority: 15,
        isActive: true,
      }
    ]
  }
];

async function seedDemoSpaces() {
  console.log('Seeding demo Spaces...');

  // Get templates first
  const templates = await prisma.spaceTemplate.findMany({
    select: { id: true, domain: true }
  });

  const templateMap = templates.reduce((acc, template) => {
    acc[template.domain] = template.id;
    return acc;
  }, {} as Record<string, string>);

  for (const spaceData of demoSpaces) {
    try {
      // Set template ID based on category
      const templateId = templateMap[spaceData.category] || null;

      const space = await prisma.space.create({
        data: {
          name: spaceData.name,
          description: spaceData.description,
          category: spaceData.category,
          tags: spaceData.tags,
          isPublic: spaceData.isPublic,
          verified: spaceData.verified,
          templateId: templateId,
        }
      });

      // Create provider profile
      await prisma.providerProfile.create({
        data: {
          spaceId: space.id,
          ...spaceData.providerProfile,
        }
      });

      // Create space rules
      for (const rule of spaceData.rules) {
        await prisma.spaceRule.create({
          data: {
            spaceId: space.id,
            ...rule,
          }
        });
      }

      console.log(`✓ Created demo space: ${spaceData.name}`);

    } catch (error) {
      console.error(`✗ Failed to create ${spaceData.name}:`, error);
    }
  }

  console.log('✅ Demo spaces seeded successfully!');
}

seedDemoSpaces()
  .catch((e) => {
    console.error('Error seeding demo spaces:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });