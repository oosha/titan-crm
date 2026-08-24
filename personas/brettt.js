/*
 * Persona data: Brett Telfer, Ingenium Consulting.
 * All counterparties, emails and deal details are fictional demo data shaped
 * around Brett's interview workflow.
 */
window.TITAN_PERSONAS = window.TITAN_PERSONAS || {};
window.TITAN_PERSONAS.brettt = {
  id: 'brettt',
  account: {
    name: 'Brett Telfer', email: 'brett@ingeniumconsulting.com', brand: 'Ingenium Consulting',
    title: 'Co-founder and technology consultant', website: 'ingeniumconsulting.com', avatar: 'B',
    region: 'Brisbane, Australia', currency: { code: 'AUD', symbol: 'A$' },
  },
  pipelines: [{
    id: 'technology-opportunities', name: 'Technology opportunities', entity: 'Opportunity', color: '#376f8b',
    defaultOwner: { name: 'Brett Telfer', email: 'brett@ingeniumconsulting.com' },
    stages: ['Signal identified', 'Qualified', 'Solution design', 'Demonstration or pilot', 'Commercial review', 'Closed'],
    cards: [
      { id: 'brett-1', deal: 'Banco BPI mobile wallet KYC programme', company: 'Banco BPI', website: 'https://www.bancobpi.pt', contact: 'Marta Silva', value: 185000, stage: 'Signal identified', leadSource: 'Partner network', lastActivity: '4d ago', activityType: 'Account researched', nextActivity: { type: 'task', label: 'Confirm digital identity priorities', date: 'Tomorrow' } },
      { id: 'brett-2', deal: 'SITA traveller identity pilot', company: 'SITA', website: 'https://www.sita.aero', contact: 'Daniel Wong', value: 420000, stage: 'Qualified', leadSource: 'Warm introduction', lastActivity: 'Today', activityType: 'Email received', threadRef: 'thread-sita-pilot' },
      { id: 'brett-3', deal: 'Aena border-flow assessment', company: 'Aena', website: 'https://www.aena.es', contact: 'Lucia Romero', value: 260000, stage: 'Solution design', leadSource: 'Industry research', lastActivity: '2d ago', activityType: 'Discovery call', threadRef: 'thread-aena-scope' },
      { id: 'brett-4', deal: 'IDEMIA regional partner agreement', company: 'IDEMIA', website: 'https://www.idemia.com', contact: 'Priya Nanduri', value: 150000, stage: 'Demonstration or pilot', leadSource: 'Technology partner', lastActivity: '1d ago', activityType: 'Pilot scope shared', nextActivity: { type: 'meeting', label: 'Pilot readiness review', date: 'Thursday, 2:00pm' } },
      { id: 'brett-5', deal: 'Entrust bank voice-validation rollout', company: 'Entrust', website: 'https://www.entrust.com', contact: 'Owen Carter', value: 310000, stage: 'Commercial review', leadSource: 'Partner referral', lastActivity: '3h ago', activityType: 'Proposal sent', threadRef: 'thread-entrust-proposal' },
      { id: 'brett-6', deal: 'Thales regional screening introduction', company: 'Thales', website: 'https://www.thalesgroup.com', contact: 'Amina Rahman', value: 275000, stage: 'Closed', won: true, leadSource: 'Partner network', lastActivity: '8d ago', activityType: 'Agreement signed', threadRef: 'thread-thales-agreement' },
      { id: 'brett-7', deal: 'Worldline fraud-prevention evaluation', company: 'Worldline', website: 'https://worldline.com', contact: 'Felix Hart', value: 120000, stage: 'Closed', won: false, leadSource: 'Outbound', lastActivity: '3w ago', activityType: 'Opportunity closed lost' },
    ],
  }],
  mailbox: { threads: [
    { id: 'thread-sita-pilot', from: 'Daniel Wong', email: 'daniel.wong@sita.aero', subject: 'Traveller identity pilot: technical discovery', date: 'Today', unread: true, pipelineRef: { pipeline: 'technology-opportunities', stage: 'Qualified', cardId: 'brett-2' }, messages: [
      { dir: 'sent', when: '20 Aug', body: ['Hi Daniel,', 'Thanks for the introduction. We have been looking at the practical hand-off between identity validation, passenger flow and the local integration team.', 'Could we spend an hour on the target airport, the pilot constraints and the stakeholders who would need to see a demonstration?', 'Regards,\nBrett'] },
      { dir: 'received', when: 'Today', body: ['Hi Brett,', 'That would be useful. Our team is most interested in a limited pilot first, with clear success measures before we discuss a wider rollout.', 'I have copied our solution architect, Mei, who can join a technical discovery next week.', 'Daniel'] },
    ] },
    { id: 'thread-entrust-proposal', from: 'Owen Carter', email: 'owen.carter@entrust.com', subject: 'Re: Voice validation proposal and regional delivery', date: 'Today', unread: false, pipelineRef: { pipeline: 'technology-opportunities', stage: 'Commercial review', cardId: 'brett-5' }, messages: [
      { dir: 'sent', when: 'Yesterday', body: ['Hi Owen,', 'Attached is the proposal for the initial bank rollout. It includes the commercial model, a local integration option and the delivery responsibilities we discussed.', 'Please let us know which terms you would like to review before the partner call.', 'Thanks,\nBrett'] },
      { dir: 'received', when: 'Today', body: ['Hi Brett,', 'The proposed model is workable. We are reviewing the revenue share and support boundaries, then will return a consolidated response.', 'Owen'] },
    ] },
    { id: 'thread-aena-scope', from: 'Lucia Romero', email: 'lucia.romero@aena.es', subject: 'Border-flow assessment: requested scope', date: '2d ago', unread: true, pipelineRef: { pipeline: 'technology-opportunities', stage: 'Solution design', cardId: 'brett-3' }, messages: [
      { dir: 'received', when: '2d ago', body: ['Hi Brett,', 'We are interested in understanding where passenger identity checks are creating avoidable friction. Please send a short outline of the assessment, expected inputs and relevant examples.', 'Best,\nLucia'] },
    ] },
    { id: 'thread-thales-agreement', from: 'Amina Rahman', email: 'amina.rahman@thalesgroup.com', subject: 'Regional collaboration agreement signed', date: '8d ago', unread: false, pipelineRef: { pipeline: 'technology-opportunities', stage: 'Closed', cardId: 'brett-6' }, messages: [
      { dir: 'received', when: '8d ago', body: ['Hi Brett,', 'The regional collaboration agreement is signed. We look forward to bringing the first relevant opportunities to the joint team.', 'Regards,\nAmina'] },
    ] },
    { id: 'thread-ops-meeting', from: 'Alex Morgan', email: 'alex.morgan@ingeniumconsulting.com', subject: 'Weekly opportunities review', date: 'Yesterday', unread: false, messages: [
      { dir: 'received', when: 'Yesterday', body: ['Hi Brett,', 'For our weekly review, can we cover SITA, the Banco BPI introduction and the Entrust commercial response? I have added the open questions from our last call to the agenda.', 'Alex'] },
    ] },
    { id: 'thread-titan-dkim', from: 'Usha Loutongbam', email: 'usha@titan.email', subject: 'DKIM setup for Ingenium Consulting', date: '5d ago', unread: false, messages: [
      { dir: 'received', when: '5d ago', body: ['Hi Brett,', 'As discussed, DKIM helps receiving mail services verify that messages sent from your Ingenium domain are legitimate. Completing the DNS setup should improve deliverability.', 'If you would like help, we can set up a short screen-share session with your domain administrator.', 'Best,\nUsha'] },
    ] },
  ] },
  contacts: [
    { name: 'Marta Silva', email: 'marta.silva@bancobpi.pt', source: 'Partner network' },
    { name: 'Daniel Wong', email: 'daniel.wong@sita.aero', source: 'Warm introduction' },
    { name: 'Lucia Romero', email: 'lucia.romero@aena.es', source: 'Industry research' },
    { name: 'Priya Nanduri', email: 'priya.nanduri@idemia.com', source: 'Technology partner' },
    { name: 'Owen Carter', email: 'owen.carter@entrust.com', source: 'Partner referral' },
    { name: 'Amina Rahman', email: 'amina.rahman@thalesgroup.com', source: 'Partner network' },
  ],
};
