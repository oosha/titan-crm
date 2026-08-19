// Global prototype sequence library.
//
// Templates and sequence definitions below are migration fallbacks for persona documents
// that do not have persisted `sequenceTemplates` and `sequences` fields yet.
// The sequence editor seeds and then reads/writes both live definitions through
// /api/sequences. There is still no scheduler or mail sender behind them.
(function () {
  var templates = [
    {
      id: 'initial-outreach',
      name: 'Initial outreach',
      to: '{{email}}',
      subject: 'A quick idea for you',
      preview: 'Introduce the reason for reaching out and connect it to the record.',
      body: 'Hi {{name}},\n\nI wanted to share a quick idea that may be useful to you.\n\nWould you be open to a short conversation this week?\n\nBest,\nThe sales team',
      fields: ['Name', 'Email'],
    },
    {
      id: 'follow-up',
      name: 'Follow-up',
      to: '{{email}}',
      subject: 'Following up',
      preview: 'A short, direct follow-up when the previous email has no reply.',
      body: 'Hi {{name}},\n\nI wanted to follow up on my previous note.\n\nWould it be useful to discuss this, or is there someone else I should speak with?\n\nBest,\nThe sales team',
      fields: ['Name', 'Email'],
    },
    {
      id: 'meeting-invitation',
      name: 'Meeting invitation',
      to: '{{email}}',
      subject: 'A time to connect',
      preview: 'Invite the contact to a conversation with a clear reason to meet.',
      body: 'Hi {{name}},\n\nI would like to set up a short conversation with you.\n\nWould you have time to connect this week?\n\nBest,\nThe sales team',
      fields: ['Name', 'Email'],
    },
    {
      id: 'post-call-recap',
      name: 'Post-call recap',
      to: '{{email}}',
      subject: 'Recap and next steps',
      preview: 'Summarise the conversation and make the next step explicit.',
      body: 'Hi {{name}},\n\nThanks for your time today. Here is a quick recap of our conversation.\n\nNext step: I will follow up with the information we discussed.\n\nBest,\nThe sales team',
      fields: ['Name', 'Email'],
    },
    {
      id: 'proposal',
      name: 'Proposal',
      to: '{{email}}',
      subject: 'Your proposal',
      preview: 'Share the proposal and explain what the contact should do next.',
      body: 'Hi {{name}},\n\nI am sharing the proposal we discussed.\n\nPlease take a look and let me know if you would like to review it together.\n\nBest,\nThe sales team',
      fields: ['Name', 'Email'],
    },
    {
      id: 'final-check-in',
      name: 'Final check-in',
      to: '{{email}}',
      subject: 'Should I close the loop?',
      preview: 'A respectful final note that gives the contact an easy way to respond.',
      body: 'Hi {{name}},\n\nI have not heard back, so I wanted to check in one last time.\n\nShould I close the loop for now, or would you still like to continue the conversation?\n\nBest,\nThe sales team',
      fields: ['Name', 'Email'],
    },
  ];

  var sequences = [
    {
      id: 'new-lead-follow-up',
      name: 'New lead follow-up',
      description: 'Call and follow up with new leads.',
      weekdaysOnly: true,
      schedule: { activeDays: ['mon', 'tue', 'wed', 'thu', 'fri'], startTime: '09:00', endTime: '17:00', timezone: 'contact' },
      activeInstances: 12,
      usedBy: ['Sales pipeline · Lead'],
      steps: [
        {
          id: 'lead-call-group', timing: 'immediate', days: 0,
          actions: [{ id: 'lead-call', action: 'call', title: 'Call the new lead', reminderOffset: 'same-day', reminderTime: '09:00' }],
        },
        {
          id: 'lead-email-group', timing: 'after', days: 1,
          actions: [{ id: 'lead-email', action: 'email', templateId: 'initial-outreach', sendTime: '09:00' }],
        },
        {
          id: 'lead-follow-up-group', timing: 'no-reply', days: 3,
          actions: [{ id: 'lead-follow-up', action: 'email', templateId: 'follow-up', sendTime: '09:00' }],
        },
      ],
    },
    {
      id: 'discovery-follow-up',
      name: 'Discovery follow-up',
      description: 'Recap discovery and set the next task.',
      weekdaysOnly: true,
      schedule: { activeDays: ['mon', 'tue', 'wed', 'thu', 'fri'], startTime: '09:00', endTime: '17:00', timezone: 'contact' },
      activeInstances: 6,
      usedBy: ['Sales pipeline · Discovery'],
      steps: [
        {
          id: 'discovery-recap-group', timing: 'immediate', days: 0,
          actions: [{ id: 'discovery-recap', action: 'email', templateId: 'post-call-recap', sendTime: '09:00' }],
        },
        {
          id: 'discovery-task-group', timing: 'after', days: 1,
          actions: [{ id: 'discovery-task', action: 'task', title: 'Prepare the proposal', reminderOffset: 'next-day', reminderTime: '09:00' }],
        },
        {
          id: 'discovery-call-group', timing: 'no-reply', days: 3,
          actions: [{ id: 'discovery-call', action: 'call', title: 'Call to confirm next steps', reminderOffset: 'next-day', reminderTime: '09:00' }],
        },
      ],
    },
    {
      id: 'proposal-follow-up',
      name: 'Proposal follow-up',
      description: 'Follow up on open proposals.',
      weekdaysOnly: true,
      schedule: { activeDays: ['mon', 'tue', 'wed', 'thu', 'fri'], startTime: '09:00', endTime: '17:00', timezone: 'contact' },
      activeInstances: 4,
      usedBy: ['Sales pipeline · Proposal'],
      steps: [
        {
          id: 'proposal-email-group', timing: 'immediate', days: 0,
          actions: [{ id: 'proposal-email', action: 'email', templateId: 'proposal', sendTime: '09:00' }],
        },
        {
          id: 'proposal-call-group', timing: 'no-reply', days: 3,
          actions: [{ id: 'proposal-call', action: 'call', title: 'Call about the proposal', reminderOffset: 'next-day', reminderTime: '09:00' }],
        },
        {
          id: 'proposal-final-group', timing: 'no-reply', days: 5,
          actions: [{ id: 'proposal-final', action: 'email', templateId: 'final-check-in', sendTime: '09:00' }],
        },
      ],
    },
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  window.titanSequenceLibrary = {
    templates: templates,
    sequences: sequences,
    clone: clone,
    getTemplate: function (id) {
      return templates.find(function (item) { return item.id === id; }) || null;
    },
    getSequence: function (id) {
      return sequences.find(function (item) { return item.id === id; }) || null;
    },
  };
})();
