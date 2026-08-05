/*
 * Persona data — Joanna Hiu (bouquet preservation, solo operator, Sydney)
 * Loaded only when the page is opened with ?u=joanna.
 *
 * This is the SHAPE proposal: one object feeds both surfaces —
 *   • crm.html  → account + pipelines[].cards[]
 *   • index.html → account + mailbox.threads[]  (+ pipelineRef ties a thread to a card)
 *
 * Nothing is wired yet. Identity fields marked PLACEHOLDER need your confirmation.
 */
window.TITAN_PERSONAS = window.TITAN_PERSONAS || {};
window.TITAN_PERSONAS.joanna = {
  id: 'joanna',

  // ── Account identity (drives the switcher pill, mailbox header, "Powered by") ──
  account: {
    name: 'Joanna Hiu',
    email: 'hello@joannahiu.com',
    brand: 'Joanna Hiu',
    title: 'Botanical artist & slow maker',
    website: 'joannahiuartist.com',
    avatar: 'J',
    region: 'Perth',
    currency: { code: 'AUD', symbol: 'AU$' },
  },

  // ── Two pipelines, shown in the CRM sidebar the way "Neo partnerships" is ──
  pipelines: [
    {
      id: 'inquiries',
      name: 'Inquiries',
      entity: 'Opportunity',
      color: '#4f6d9e',
      stages: ['New Inquiry', 'Replied', 'Nurturing', 'Quoted', 'Booked', 'Lost'],
      cards: [
        { id: 'i1', deal: 'Mia Thompson — Nov wedding', company: 'Mia Thompson', contact: 'Mia Thompson',
          value: 0, stage: 'New Inquiry', leadSource: 'Website', weddingDate: '2026-11-14',
          lastActivity: '3h ago', activityType: 'Email received', overdue: false,
          nextActivity: { type: 'followup', label: 'Reply to inquiry', date: 'Today' } },

        { id: 'i2', deal: 'Priya Nair — resin keepsake', company: 'Priya Nair', contact: 'Priya Nair',
          value: 0, stage: 'Replied', leadSource: 'Instagram', weddingDate: '2026-09-05',
          lastActivity: '2d ago', activityType: 'Email sent', overdue: false },

        { id: 'i3', deal: 'Lily McGregor — shadow box', company: 'Lily McGregor', contact: 'Lily McGregor',
          value: 0, stage: 'Nurturing', leadSource: 'Instagram', weddingDate: '2026-03-14',
          exchanges: 3, nextStep: 'Waiting on her to confirm flower types',
          lastActivity: '1d ago', activityType: 'Email received', overdue: false,
          threadRef: 'thread-lily' },

        { id: 'i4', deal: 'Chloe Watson — 2027 wedding', company: 'Chloe Watson', contact: 'Chloe Watson',
          value: 450, deposit: 150, stage: 'Quoted', leadSource: 'Referral', weddingDate: '2027-05-22',
          note: 'Long-horizon booking — keep neutral, not stalling', quotedDaysAgo: 4,
          lastActivity: '4d ago', activityType: 'Email sent', overdue: false },

        { id: 'i5', deal: 'Sarah Chen — pressed frame', company: 'Sarah Chen', contact: 'Sarah Chen',
          value: 420, deposit: 150, stage: 'Booked', leadSource: 'Website', weddingDate: '2026-06-07',
          note: 'Deposit paid — auto-moves to Preservation Projects', won: true,
          lastActivity: '1d ago', activityType: 'Email received', overdue: false,
          threadRef: 'thread-sarah-booking' },

        { id: 'i6', deal: 'Hannah Lee — price too high', company: 'Hannah Lee', contact: 'Hannah Lee',
          value: 0, stage: 'Lost', leadSource: 'Website', lostReason: 'Price after quote',
          lastActivity: '3w ago', activityType: 'Email sent', overdue: false },
      ],
    },
    {
      id: 'projects',
      name: 'Preservation Projects',
      entity: 'Project',
      color: '#3f8a7d',
      stages: ['Drop-off Scheduled', 'Drying', 'Design Proposals', 'Design Confirmed',
               'With Framer', 'Ready for Pickup', 'Completed'],
      cards: [
        { id: 'p1', deal: 'Sarah Chen — pressed frame', company: 'Sarah Chen', contact: 'Sarah Chen',
          value: 420, balance: 0, stage: 'Ready for Pickup', weddingDate: '2026-06-07',
          dropOffDate: '2026-06-14', driedOn: '2026-07-12', invoicePaid: true,
          nextActivity: { type: 'meeting', label: 'Pickup', date: 'Sat 11am' },
          lastActivity: '1d ago', activityType: 'Email received', overdue: false,
          threadRef: 'thread-sarah-pickup' },

        { id: 'p2', deal: 'Emma Sinclair — dome', company: 'Emma Sinclair', contact: 'Emma Sinclair',
          value: 380, balance: 230, stage: 'Drying', weddingDate: '2026-05-30', dropOffDate: '2026-07-15',
          dryingDoneEst: '2026-08-12', daysRemaining: 14,
          nextActivity: { type: 'task', label: 'Send day-14 drying update', date: 'in 2d' },
          lastActivity: '1w ago', activityType: 'Email sent', overdue: false },

        { id: 'p3', deal: 'Olivia Brooks — shadow box', company: 'Olivia Brooks', contact: 'Olivia Brooks',
          value: 540, balance: 390, stage: 'With Framer', framer: 'Framing Room Co',
          framerDue: '2026-07-31', overdue: true,
          nextActivity: { type: 'task', label: 'Chase framer — piece overdue', date: 'Overdue' },
          lastActivity: '2d ago', activityType: 'Phone call' },

        { id: 'p4', deal: 'Grace Miller — resin block', company: 'Grace Miller', contact: 'Grace Miller',
          value: 300, balance: 300, stage: 'Ready for Pickup', invoiceSent: true, invoicePaid: false,
          nextActivity: { type: 'meeting', label: 'Pickup', date: 'Sat 11am' },
          lastActivity: '5d ago', activityType: 'Email sent', overdue: false },

        { id: 'p5', deal: 'Amelia Reid — frame', company: 'Amelia Reid', contact: 'Amelia Reid',
          value: 460, balance: 0, stage: 'Completed', won: true,
          instagramTagged: true, reviewLeft: false,
          lastActivity: '2w ago', activityType: 'Email sent', overdue: false },

        // Advanced booking — wedding far out, parked as "Future" at the bottom of the board
        { id: 'p6', deal: 'Chloe Watson — 2027 (future)', company: 'Chloe Watson', contact: 'Chloe Watson',
          value: 450, balance: 300, stage: 'Drop-off Scheduled', weddingDate: '2027-05-22',
          future: true, note: 'Reminder fires 6 weeks before wedding to schedule drop-off',
          lastActivity: '4d ago', activityType: 'Email sent', overdue: false },
      ],
    },
  ],

  // ── Mailbox: the real sample threads from the interview doc ──
  // pipelineRef ties a thread to the card it created, so both surfaces stay consistent.
  // Each body[] entry is a paragraph; "\n" inside one renders as a line break (greeting / sign-off).
  mailbox: {
    threads: [
      { id: 'thread-lily', from: 'Lily McGregor', email: 'lily.mcgregor92@gmail.com',
        subject: 'Re: Bouquet preservation enquiry — wedding March 2026', date: '6 May', unread: true,
        pipelineRef: { pipeline: 'inquiries', stage: 'Nurturing', cardId: 'i3' },
        messages: [
          { dir: 'received', when: '2 May',
            body: [
              "Hi!",
              "I came across your Instagram and fell absolutely in love with your work. I'm getting married in Sydney in March next year and I'd really love to have my bouquet preserved.",
              "I have a few questions before I commit — do you work with dried or pressed flowers? My bouquet will have a mix of garden roses, pampas grass and eucalyptus. Also what's the turnaround time and rough price range?",
              "Thanks so much,\nLily",
            ] },
          { dir: 'sent', when: '3 May',
            body: [
              "Hi Lily,",
              "Thank you so much for reaching out — your wedding sounds beautiful! I work with both dried and pressed flowers, and for a mix of garden roses, pampas and eucalyptus a shadow box or framed piece works wonderfully.",
              "The process is drop-off → 4–6 weeks drying → design proposals → framing, and pieces start from around $380. Once I have your wedding date and the stems you'd most like to highlight, I can check availability for you.",
              "Warmly,\nJoanna",
            ] },
          { dir: 'received', when: '6 May',
            body: [
              "Thanks Joanna, this all makes so much sense! The shadow box option sounds perfect.",
              "One more thing — I noticed on your website it says “limited spots.” Do you think you'd have availability for a drop-off around late March / early April? My wedding is March 14th, so I'd be dropping off within a week or two after.",
              "Happy to put down a deposit now to lock it in if that helps.",
              "Lily",
            ] },
        ] },

      { id: 'thread-sarah-booking', from: 'Sarah Chen', email: 'sarah.chen.bride@outlook.com',
        subject: 'Re: Availability for bouquet preservation', date: '24 May', unread: false,
        pipelineRef: { pipeline: 'inquiries', stage: 'Booked', cardId: 'i5' },
        messages: [
          { dir: 'sent', when: '22 May',
            body: [
              "Hi Sarah,",
              "Lovely to hear from you! For a June wedding I'd suggest dropping your bouquet within a week of the day, while the blooms are at their freshest.",
              "The pressed flower framed piece is $420, with a $150 deposit to secure your spot — turnaround is around 6–8 weeks and I'll keep you updated at each stage. Would the week after your wedding work for drop-off?",
              "Warmly,\nJoanna",
            ] },
          { dir: 'received', when: '24 May',
            body: [
              "Hi Joanna,",
              "So sorry for the slow reply — been in full wedding planning mode! Yes I would love to go ahead with the pressed flower framed piece. The $420 package sounds perfect.",
              "I'll pay the deposit today — can you send me the invoice? And which days work for drop-off? We're getting married June 7th so I'm thinking I could bring the flowers in the week after?",
              "Can't wait!\nSarah",
            ] },
        ] },

      { id: 'thread-sarah-proposals', from: 'Sarah Chen', email: 'sarah.chen.bride@outlook.com',
        subject: 'Re: Your bouquet preservation design proposals! 🌸', date: '16 Jul', unread: false,
        pipelineRef: { pipeline: 'projects', stage: 'Ready for Pickup', cardId: 'p1' },
        messages: [
          { dir: 'sent', when: '14 Jul',
            body: [
              "Hi Sarah,",
              "Your flowers have dried beautifully and I've put together three design proposals for you! I've attached the layouts below.",
              "Please take a look and let me know which direction you love most — I'm also happy to mix elements across them.",
              "Can't wait to hear your thoughts,\nJoanna",
            ] },
          { dir: 'received', when: '16 Jul',
            body: [
              "Oh my gosh Joanna these are all SO beautiful, I can't decide 😭",
              "I think I love option 2 the most — the circular arrangement feels really elegant. But I was wondering if it's possible to include a bit more of the white ranunculus from option 3? They were my gran's favourite flower and I'd love them to be more prominent.",
              "Also completely fine if that's not possible — option 2 as-is is genuinely stunning.",
              "Thank you so much for putting these together 💛\nSarah",
            ] },
        ] },

      { id: 'thread-sarah-pickup', from: 'Sarah Chen', email: 'sarah.chen.bride@outlook.com',
        subject: 'Re: Your bouquet preservation is ready for pickup! 🎉', date: '29 Jul', unread: true,
        pipelineRef: { pipeline: 'projects', stage: 'Ready for Pickup', cardId: 'p1' },
        messages: [
          { dir: 'sent', when: '27 Jul',
            body: [
              "Hi Sarah,",
              "Exciting news — your bouquet preservation is complete and ready for pickup! 🎉",
              "Your final invoice is here — the remaining balance is AU$270. Once that's paid, please book a pickup slot via the link below.",
              "Looking forward to seeing your reaction!\nJoanna",
            ] },
          { dir: 'received', when: '29 Jul',
            body: [
              "Hi Joanna!!",
              "Ahhhh I am SO excited, I've been counting down the days! I've just paid the final balance — you should see it come through shortly.",
              "I'll book the pickup via the link but just wanted to check — would Saturday the 9th around 11am work? I want to bring my mum so she can see it too 😊",
              "Thank you so much for everything, you've been absolutely wonderful throughout the whole process.",
              "Sarah x",
            ] },
        ] },
    ],
  },

  // ── Contacts (auto-resolved from email domain in the panel) ──
  contacts: [
    { name: 'Lily McGregor', email: 'lily.mcgregor92@gmail.com', source: 'Instagram' },
    { name: 'Sarah Chen',   email: 'sarah.chen.bride@outlook.com', source: 'Website' },
  ],
};
