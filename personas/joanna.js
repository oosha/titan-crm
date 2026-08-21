window.TITAN_PERSONAS = window.TITAN_PERSONAS || {};
window.TITAN_PERSONAS.joanna = {
  id: 'joanna',
  account: { name: 'Joanna Hiu', email: 'hello@joannahiuartist.com', brand: 'Joanna Hiu', title: 'Bouquet preservation artist', website: 'joannahiuartist.com', avatar: 'J', region: 'Perth, WA', currency: { code: 'AUD', symbol: 'AU$' } },
  pipelines: [
    { id: 'inquiries', name: 'Bouquet preservation inquiries', entity: 'Inquiry', color: '#4f6d9e', stages: ['New inquiry', 'Replied', 'Nurturing', 'Quote sent', 'Booked', 'Lost'], cards: [
      { id: 'inq-1', deal: 'Mia Thompson wedding bouquet', company: 'Mia Thompson', contact: 'Mia Thompson', stage: 'New inquiry', leadSource: 'Website contact form', weddingDate: '2026-11-14', lastActivity: '3h ago', activityType: 'Email received', nextActivity: { type: 'task', label: 'Reply to Mia', date: 'Today' } },
      { id: 'inq-2', deal: 'Aisha Rahman memorial flowers', company: 'Aisha Rahman', contact: 'Aisha Rahman', stage: 'Replied', leadSource: 'Google search', lastActivity: '2d ago', activityType: 'Email sent', nextActivity: { type: 'followup', label: 'Send gentle follow-up', date: 'Tomorrow' } },
      { id: 'inq-3', deal: 'Lily McGregor wedding bouquet', company: 'Lily McGregor', contact: 'Lily McGregor', value: 480, stage: 'Nurturing', leadSource: 'Instagram', weddingDate: '2027-03-14', lastActivity: 'Today', activityType: 'Email received', threadRef: 'thread-lily' },
      { id: 'inq-4', deal: 'Chloe Watson wedding bouquet', company: 'Chloe Watson', contact: 'Chloe Watson', value: 520, stage: 'Quote sent', leadSource: 'Word of mouth', weddingDate: '2027-05-22', lastActivity: '4d ago', activityType: 'Email sent' },
      { id: 'inq-5', deal: 'Sarah Chen wedding bouquet', company: 'Sarah Chen', contact: 'Sarah Chen', value: 460, stage: 'Booked', leadSource: 'Website booking', weddingDate: '2026-08-07', lastActivity: '1d ago', activityType: 'Payment received', threadRef: 'thread-sarah-booking' },
      { id: 'inq-6', deal: 'Hannah Lee wedding bouquet', company: 'Hannah Lee', contact: 'Hannah Lee', stage: 'Lost', leadSource: 'Google search', lastActivity: '3w ago', activityType: 'Email sent' }
    ] },
    { id: 'projects', name: 'Preservation projects', entity: 'Project', color: '#3f8a7d', stages: ['Drop-off scheduled', 'Drying', 'Design preparation', 'Design choice', 'With framer', 'Ready for pickup', 'Completed'], cards: [
      { id: 'proj-1', deal: 'Sarah Chen wedding bouquet', company: 'Sarah Chen', contact: 'Sarah Chen', value: 460, stage: 'Ready for pickup', weddingDate: '2026-08-07', dropOffDate: '2026-08-10', lastActivity: 'Today', activityType: 'Email received', nextActivity: { type: 'meeting', label: 'Bouquet pickup', date: 'Sat 11am' }, threadRef: 'thread-sarah-pickup' },
      { id: 'proj-2', deal: 'Emma Sinclair wedding bouquet', company: 'Emma Sinclair', contact: 'Emma Sinclair', value: 420, stage: 'Drying', weddingDate: '2026-07-18', dropOffDate: '2026-07-21', lastActivity: '1w ago', activityType: 'Email sent', nextActivity: { type: 'task', label: 'Send four-week drying update', date: 'in 2d' } },
      { id: 'proj-3', deal: 'Olivia Brooks memorial flowers', company: 'Olivia Brooks', contact: 'Olivia Brooks', value: 540, stage: 'With framer', lastActivity: '2d ago', activityType: 'Phone call', overdue: true, nextActivity: { type: 'task', label: 'Confirm framing completion', date: 'Overdue' } },
      { id: 'proj-4', deal: 'Grace Miller wedding bouquet', company: 'Grace Miller', contact: 'Grace Miller', value: 390, stage: 'Design choice', lastActivity: '3d ago', activityType: 'Email sent', nextActivity: { type: 'followup', label: 'Confirm preferred design', date: 'Tomorrow' } },
      { id: 'proj-5', deal: 'Amelia Reid wedding bouquet', company: 'Amelia Reid', contact: 'Amelia Reid', value: 450, stage: 'Completed', lastActivity: '2w ago', activityType: 'Email sent' }
    ] }
  ],
  mailbox: { threads: [
    { id: 'thread-lily', from: 'Lily McGregor', email: 'lily.mcgregor@gmail.com', subject: 'Bouquet preservation for my March wedding', date: 'Today', unread: true, pipelineRef: { pipeline: 'inquiries', stage: 'Nurturing', cardId: 'inq-3' }, messages: [
      { dir: 'received', when: '18 Aug', body: ['Hi Joanna,', 'I found your work through Instagram and would love to preserve my bouquet after my March wedding. It will have garden roses, eucalyptus and ranunculus. Could a shadow box work for these flowers?', 'Thanks,\nLily'] },
      { dir: 'sent', when: '19 Aug', body: ['Hi Lily,', 'Thank you for reaching out. A shadow box would be lovely for those blooms. I press and dry the flowers first, then share a few composition ideas before the final piece is framed.', 'For a March wedding, I can hold a place now and arrange the drop-off once your flowers are ready. Warmly,\nJoanna'] },
      { dir: 'received', when: 'Today', body: ['That sounds perfect. Could you send the shadow box options and the deposit details? I would love to lock in a spot.', 'Lily'] }
    ] },
    { id: 'thread-sarah-booking', from: 'Sarah Chen', email: 'sarah.chen@outlook.com', subject: 'Booking confirmation and bouquet drop-off', date: '10 Aug', unread: false, pipelineRef: { pipeline: 'inquiries', stage: 'Booked', cardId: 'inq-5' }, messages: [
      { dir: 'sent', when: '6 Aug', body: ['Hi Sarah,', 'Thank you for booking your pressed flower frame. Your deposit is received and your spot is confirmed.', 'After the wedding, please book a bouquet drop-off using the link in your confirmation email. Bringing the flowers in within a few days helps me preserve their colour and shape.', 'Warmly,\nJoanna'] },
      { dir: 'received', when: '10 Aug', body: ['Hi Joanna,', 'I have booked Monday morning and will bring the bouquet then. I am so excited to see what you create.', 'Sarah'] }
    ] },
    { id: 'thread-sarah-pickup', from: 'Sarah Chen', email: 'sarah.chen@outlook.com', subject: 'Your bouquet preservation is ready for pickup', date: 'Today', unread: true, pipelineRef: { pipeline: 'projects', stage: 'Ready for pickup', cardId: 'proj-1' }, messages: [
      { dir: 'sent', when: '12 Aug', body: ['Hi Sarah,', 'Your flowers have dried beautifully. I have attached three composition options for you to review. Let me know which one feels most like your day.', 'Warmly,\nJoanna'] },
      { dir: 'received', when: '13 Aug', body: ['Option two is my favourite. Could you include a little more of the white ranunculus? It was my grandmother\'s favourite flower.', 'Sarah'] },
      { dir: 'sent', when: '20 Aug', body: ['Hi Sarah,', 'Your bouquet preservation is complete and ready for pickup. The final Xero invoice has been paid, and I have reserved Saturday at 11am for you.', 'I look forward to seeing you then.\nJoanna'] },
      { dir: 'received', when: 'Today', body: ['Thank you Joanna. Saturday at 11am is perfect. I will bring my mum along too.', 'Sarah'] }
    ] }
  ] },
  contacts: [{ name: 'Lily McGregor', email: 'lily.mcgregor@gmail.com', source: 'Instagram' }, { name: 'Sarah Chen', email: 'sarah.chen@outlook.com', source: 'Website booking' }, { name: 'Aisha Rahman', email: 'aisha.rahman@gmail.com', source: 'Google search' }]
};
