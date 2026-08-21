window.TITAN_PERSONAS = window.TITAN_PERSONAS || {};
window.TITAN_PERSONAS.jen = {
  id: 'jen',
  account: {
    name: 'Jen Morales',
    email: 'jen@brightpathstudio.com',
    brand: 'Bright Path Studio',
    title: 'Owner',
    website: 'brightpathstudio.com',
    avatar: 'J',
    region: 'Austin, TX',
    currency: { code: 'USD', symbol: '$' }
  },
  pipelines: [],
  mailbox: {
    threads: [
      {
        id: 'thread-contact-submission',
        from: 'Daniel Harper',
        email: 'daniel.harper@gmail.com',
        subject: 'Contact submission: Preserving memorial flowers',
        date: 'Today, 10:24am',
        unread: true,
        source: 'Contact submission',
        crmSuggestion: {
          kind: 'create-lead',
          label: 'New lead',
          title: 'Track Daniel Harper in Titan CRM',
          description: 'Create a lead from this contact submission and add stages when you are ready.',
          suggestedRecord: {
            name: 'Daniel Harper memorial flowers',
            company: 'Daniel Harper',
            contact: 'Daniel Harper',
            email: 'daniel.harper@gmail.com',
            source: 'Contact submission'
          }
        },
        messages: [
          {
            dir: 'received',
            when: 'Today, 10:24am',
            body: [
              'Name: Daniel Harper',
              'Email: daniel.harper@gmail.com',
              'Message: Hi Jen, my family has flowers from my mother\'s memorial service and we would love to preserve a few in a small frame. They were collected yesterday and are still in water. Could you let me know what is possible and how soon we should bring them in?',
              'Submitted from your website contact form.'
            ]
          }
        ]
      },
      {
        id: 'thread-wedding-inquiry',
        from: 'Sophie Ellis',
        email: 'sophie.ellis@gmail.com',
        subject: 'Preserving my wedding bouquet',
        date: 'Today, 8:42am',
        unread: true,
        source: 'Instagram',
        crmSuggestion: {
          kind: 'create-lead', label: 'New lead', title: 'Track Sophie Ellis in Titan CRM',
          description: 'Create a lead from this bouquet preservation enquiry and add stages when you are ready.',
          suggestedRecord: { name: 'Sophie Ellis wedding bouquet', company: 'Sophie Ellis', contact: 'Sophie Ellis', email: 'sophie.ellis@gmail.com', source: 'Instagram' }
        },
        messages: [
          { dir: 'received', when: 'Today, 8:42am', body: ['Hi Jen,', 'I found your work through Instagram and would love to preserve my bouquet after my October wedding. It will include roses, sweet pea and eucalyptus. Could you let me know what the process looks like and whether you have availability?', 'Thank you,\nSophie'] }
        ]
      },
      {
        id: 'thread-memorial-inquiry',
        from: 'Apple',
        email: 'no_reply@email.apple.com',
        subject: 'Your receipt from Apple',
        date: 'Yesterday',
        unread: false,
        source: 'Service notification',
        messages: [
          { dir: 'received', when: 'Yesterday, 9:18am', body: ['Thank you for your purchase.', 'Your receipt for iCloud+ storage is attached to this email.', 'Total: $2.99'] }
        ]
      },
      {
        id: 'thread-drying-update',
        from: 'Xero',
        email: 'notifications@xero.com',
        subject: 'Your Xero subscription invoice is ready',
        date: '12 Aug',
        unread: false,
        source: 'Service notification',
        messages: [
          { dir: 'received', when: '12 Aug', body: ['Your Xero subscription invoice is ready.', 'Your payment method will be charged automatically on 20 August.', 'Total: $35.00'] }
        ]
      },
      {
        id: 'thread-pickup',
        from: 'Nora Bennett',
        email: 'nora.bennett@gmail.com',
        subject: 'Re: Your flower preservation is ready for pickup',
        date: '5 Aug',
        unread: false,
        source: 'Client update',
        messages: [
          { dir: 'sent', when: '4 Aug', body: ['Hi Nora,', 'Your flower preservation is complete and ready for pickup. I have attached the final invoice and pickup details. Let me know which day works best for you.', 'Warmly,\nJen'] },
          { dir: 'received', when: '5 Aug', body: ['It looks beautiful. I have paid the invoice and can come by Saturday morning if that works for you.', 'Nora'] }
        ]
      }
    ]
  },
  contacts: [
    { name: 'Daniel Harper', email: 'daniel.harper@gmail.com', source: 'Contact submission' },
    { name: 'Sophie Ellis', email: 'sophie.ellis@gmail.com', source: 'Instagram' },
    { name: 'Nora Bennett', email: 'nora.bennett@gmail.com', source: 'Website booking' }
  ]
};
