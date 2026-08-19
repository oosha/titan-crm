/*
 * Persona data: Graham Northcutt (outside technical sales, San Diego)
 * Loaded only when a page is opened with ?u=graham.
 *
 * The companies, people, email addresses and order references below are
 * fictional demo data, shaped around Graham's interview workflow.
 */
window.TITAN_PERSONAS = window.TITAN_PERSONAS || {};
window.TITAN_PERSONAS.graham = {
  id: 'graham',

  account: {
    name: 'Graham Northcutt',
    email: 'graham@northcuttlubricants.com',
    brand: 'Northcutt Industrial Lubricants',
    title: 'Outside technical sales',
    website: 'northcuttlubricants.com',
    avatar: 'G',
    region: 'San Diego, CA',
    currency: { code: 'USD', symbol: '$' },
  },

  pipelines: [
    {
      id: 'field-sales',
      name: 'Field sales',
      entity: 'Opportunity',
      color: '#54759c',
      defaultOwner: { name: 'Graham Northcutt', email: 'graham@northcuttlubricants.com' },
      stages: ['Mapped', 'Visit planned', 'Assessment', 'Quote sent', 'First order', 'Active customer'],
      cards: [
        { id: 'graham-1', deal: 'Harbor Hauling: fleet assessment', company: 'Harbor Hauling', website: 'https://www.wm.com', contact: 'Maya Ortega', value: 0, stage: 'Mapped', leadSource: 'Google Maps', lastActivity: 'Today', activityType: 'Prospect mapped', nextActivity: { type: 'visit', label: 'Plan an introductory stop', date: 'Tomorrow' } },
        { id: 'graham-2', deal: 'North County Paving: paver fleet', company: 'North County Paving', website: 'https://www.graniteconstruction.com', contact: 'Derrick Shaw', value: 0, stage: 'Visit planned', leadSource: 'Referral', lastActivity: '1d ago', activityType: 'Call logged', nextActivity: { type: 'visit', label: 'Introductory yard visit', date: 'Thu 9:30am' } },
        { id: 'graham-3', deal: 'Mesa Concrete: hydraulic oil quote', company: 'Mesa Concrete', website: 'https://www.cemexusa.com', contact: 'Luis Moreno', value: 2840, stage: 'Assessment', leadSource: 'Drive-by', lastActivity: '2h ago', activityType: 'Site visit', threadRef: 'thread-mesa-quote' },
        { id: 'graham-4', deal: 'Coastal Water District: municipal fleet', company: 'Coastal Water District', website: 'https://www.acwa.com', contact: 'Anita Patel', value: 6150, stage: 'Quote sent', leadSource: 'LinkedIn', lastActivity: 'Yesterday', activityType: 'Email sent', threadRef: 'thread-coastal-quote' },
        { id: 'graham-5', deal: 'Canyon Equipment Rental: grease program', company: 'Canyon Equipment Rental', website: 'https://www.sunbeltrentals.com', contact: 'Naomi Brooks', value: 3920, stage: 'First order', leadSource: 'Referral', lastActivity: '3h ago', activityType: 'Order confirmed', threadRef: 'thread-canyon-order' },
        { id: 'graham-6', deal: 'Seaside Food Processing: food-grade lubricant program', company: 'Seaside Food Processing', website: 'https://www.hormelfoods.com', contact: 'Evan Cole', value: 1480, stage: 'Active customer', leadSource: 'Referral', lastActivity: '2d ago', activityType: 'Email received', threadRef: 'thread-seaside-reorder' },
        { id: 'graham-7', deal: 'Mission Recycling: bulk oil delivery', company: 'Mission Recycling', website: 'https://www.republicservices.com', contact: 'Chris Bennett', value: 5250, stage: 'Active customer', leadSource: 'Drive-by', lastActivity: '5d ago', activityType: 'Invoice paid', threadRef: 'thread-mission-checkin' },
      ],
    },
  ],

  mailbox: {
    threads: [
      {
        id: 'thread-mesa-quote', from: 'Luis Moreno', email: 'luis.moreno@cemexusa.com',
        subject: 'Re: Hydraulic oil recommendation for the loader fleet', date: 'Today', unread: true,
        pipelineRef: { pipeline: 'field-sales', stage: 'Assessment', cardId: 'graham-3' },
        messages: [
          { dir: 'sent', when: 'Yesterday', body: [
            'Hi Luis,',
            'Thanks for walking the yard with me. I noted the loader attachments, mixers and the two machines that are seeing the most hydraulic heat.',
            'I will send a compatible hydraulic oil recommendation and grease option for the loader pins today. If the volumes look right, I can turn it into a NetSuite estimate for you.',
            'Thanks,\nGraham',
          ] },
          { dir: 'received', when: 'Today', body: [
            'Hi Graham,',
            'That sounds good. Please include the 55-gallon option as well as drums. We have room for a delivery next week if the estimate works out.',
            'Luis',
          ] },
        ],
      },
      {
        id: 'thread-coastal-quote', from: 'Anita Patel', email: 'anita.patel@acwa.com',
        subject: 'Re: Seasonal fleet lubrication estimate', date: 'Yesterday', unread: false,
        pipelineRef: { pipeline: 'field-sales', stage: 'Quote sent', cardId: 'graham-4' },
        messages: [
          { dir: 'sent', when: 'Mon', body: [
            'Hi Anita,',
            'Attached is the estimate for the utility fleet, pumps and backup generators we reviewed. I separated the seasonal top-off items so your team can approve them against the correct budget.',
            'If you send the PO format you use, I will update the estimate before you route it internally.',
            'Regards,\nGraham',
          ] },
          { dir: 'received', when: 'Yesterday', body: [
            'Hi Graham,',
            'The product list looks right. Could you add our department PO line to the estimate? I can submit it as soon as that is updated.',
            'Thank you,\nAnita',
          ] },
        ],
      },
      {
        id: 'thread-canyon-order', from: 'Naomi Brooks', email: 'naomi.brooks@sunbeltrentals.com',
        subject: 'Re: First grease delivery: Canyon Equipment Rental', date: 'Today', unread: false,
        pipelineRef: { pipeline: 'field-sales', stage: 'First order', cardId: 'graham-5' },
        messages: [
          { dir: 'received', when: 'Yesterday', body: [
            'Hi Graham,',
            'The order is approved. We can receive the delivery at 8:00 tomorrow; I will have someone meet you at the service bay.',
            'Naomi',
          ] },
          { dir: 'sent', when: 'Today', body: [
            'Hi Naomi,',
            'Perfect. I have the sales order entered and will bring the first delivery tomorrow morning. I will also check the grease gun fittings and take a quick photo of the rack location for our next visit.',
            'Thanks,\nGraham',
          ] },
        ],
      },
      {
        id: 'thread-seaside-reorder', from: 'Evan Cole', email: 'evan.cole@hormelfoods.com',
        subject: 'September food-grade lubricant order', date: '2d ago', unread: true,
        pipelineRef: { pipeline: 'field-sales', stage: 'Active customer', cardId: 'graham-6' },
        messages: [
          { dir: 'received', when: '2d ago', body: [
            'Hi Graham,',
            'We are ready for the usual food-grade grease and chain lubricant order for September. Could you stop by during the first week to look at the packaging line bearings as well?',
            'Evan',
          ] },
          { dir: 'sent', when: 'Yesterday', body: [
            'Hi Evan,',
            'Absolutely. I will get the order started and put a floor check on my route for the first week of September. I will bring the same products as last month unless you tell me otherwise.',
            'Regards,\nGraham',
          ] },
        ],
      },
      {
        id: 'thread-mission-checkin', from: 'Chris Bennett', email: 'chris.bennett@republicservices.com',
        subject: 'Re: Invoice INV-48096 and next yard stop', date: '5d ago', unread: false,
        pipelineRef: { pipeline: 'field-sales', stage: 'Active customer', cardId: 'graham-7' },
        messages: [
          { dir: 'sent', when: '6d ago', body: [
            'Hi Chris,',
            'The invoice for the bulk oil delivery has been paid. I am planning my September yard route now. Should I include a quick check of the used-oil tank area and forklift grease schedule?',
            'Thanks,\nGraham',
          ] },
          { dir: 'received', when: '5d ago', body: [
            'Yes, please include us. The forklift interval may have changed with the new shift schedule, so it would be good to look at it together.',
            'Chris',
          ] },
        ],
      },
    ],
  },

  contacts: [
    { name: 'Maya Ortega', email: 'maya.ortega@wm.com', source: 'Google Maps' },
    { name: 'Derrick Shaw', email: 'derrick.shaw@graniteconstruction.com', source: 'Referral' },
    { name: 'Luis Moreno', email: 'luis.moreno@cemexusa.com', source: 'Field visit' },
    { name: 'Anita Patel', email: 'anita.patel@acwa.com', source: 'LinkedIn' },
    { name: 'Naomi Brooks', email: 'naomi.brooks@sunbeltrentals.com', source: 'Referral' },
    { name: 'Evan Cole', email: 'evan.cole@hormelfoods.com', source: 'Customer' },
    { name: 'Chris Bennett', email: 'chris.bennett@republicservices.com', source: 'Customer' },
  ],
};
