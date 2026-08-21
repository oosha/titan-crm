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

  // Shared prototype performance source. Both the sequence screens and dashboard
  // aggregate this same shape so their sent/open/reply figures cannot drift.
  var performance = {
    'new-lead-follow-up': {
      totalEnrollments: 128,
      replies: 18,
      trend: [
        { label: 'Jul 13', value: 18 }, { label: 'Jul 20', value: 21 }, { label: 'Jul 27', value: 24 },
        { label: 'Aug 3', value: 19 }, { label: 'Aug 10', value: 23 }, { label: 'Aug 17', value: 23 },
      ],
      activities: [
        { name: 'Call the new lead', type: 'Call reminder', triggered: 128 },
        { name: 'Initial outreach', type: 'Email', triggered: 116, opened: 72, replied: 12 },
        { name: 'Follow-up', type: 'Email', triggered: 92, opened: 50, replied: 6 },
      ],
    },
    'discovery-follow-up': {
      totalEnrollments: 74,
      replies: 9,
      trend: [
        { label: 'Jul 13', value: 10 }, { label: 'Jul 20', value: 12 }, { label: 'Jul 27', value: 11 },
        { label: 'Aug 3', value: 14 }, { label: 'Aug 10', value: 13 }, { label: 'Aug 17', value: 14 },
      ],
      activities: [
        { name: 'Post-call recap', type: 'Email', triggered: 74, opened: 51, replied: 9 },
        { name: 'Prepare the proposal', type: 'Task', triggered: 61 },
        { name: 'Call to confirm next steps', type: 'Call reminder', triggered: 53 },
      ],
    },
    'proposal-follow-up': {
      totalEnrollments: 52,
      replies: 6,
      trend: [
        { label: 'Jul 13', value: 7 }, { label: 'Jul 20', value: 9 }, { label: 'Jul 27', value: 8 },
        { label: 'Aug 3', value: 10 }, { label: 'Aug 10', value: 9 }, { label: 'Aug 17', value: 9 },
      ],
      activities: [
        { name: 'Proposal', type: 'Email', triggered: 52, opened: 31, replied: 4 },
        { name: 'Call about the proposal', type: 'Call reminder', triggered: 45 },
        { name: 'Final check-in', type: 'Email', triggered: 39, opened: 21, replied: 2 },
      ],
    },
  };

  var performanceRanges = [
    { value: '7d', label: 'Last 7 days', factor: 0.18, trendLabels: ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'] },
    { value: '30d', label: 'Last 30 days', factor: 0.65, trendLabels: ['Jul 21', 'Jul 28', 'Aug 4', 'Aug 11'] },
    { value: '90d', label: 'Last 90 days', factor: 1, trendLabels: ['May 25', 'Jun 8', 'Jun 22', 'Jul 6', 'Jul 20', 'Aug 3'] },
    { value: 'all', label: 'All time', factor: 2.4, trendLabels: ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'] },
  ];

  function performanceForRange(basePerformance, rangeValue) {
    if (!basePerformance) return null;
    var range = performanceRanges.find(function (item) { return item.value === rangeValue; }) || performanceRanges[1];
    var totalEnrollments = Math.max(1, Math.round(basePerformance.totalEnrollments * range.factor));
    var activities = basePerformance.activities.map(function (item) {
      var scaled = {
        name: item.name,
        type: item.type,
        triggered: Math.max(0, Math.round(item.triggered * range.factor)),
      };
      if (typeof item.opened === 'number') scaled.opened = Math.max(0, Math.round(item.opened * range.factor));
      if (typeof item.replied === 'number') scaled.replied = Math.max(0, Math.round(item.replied * range.factor));
      return scaled;
    });
    var replies = activities.reduce(function (sum, item) { return sum + (item.replied || 0); }, 0);
    var weights = range.trendLabels.map(function (_, index) {
      return basePerformance.trend[index % basePerformance.trend.length].value;
    });
    var weightTotal = weights.reduce(function (sum, value) { return sum + value; }, 0) || 1;
    var allocated = 0;
    var trend = range.trendLabels.map(function (label, index) {
      var value = index === range.trendLabels.length - 1
        ? totalEnrollments - allocated
        : Math.floor((totalEnrollments * weights[index]) / weightTotal);
      allocated += value;
      return { label: label, value: value };
    });
    return { totalEnrollments: totalEnrollments, replies: replies, activities: activities, trend: trend, range: range };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  window.titanSequenceLibrary = {
    templates: templates,
    sequences: sequences,
    performance: performance,
    performanceRanges: performanceRanges,
    performanceForRange: performanceForRange,
    clone: clone,
    getTemplate: function (id) {
      return templates.find(function (item) { return item.id === id; }) || null;
    },
    getSequence: function (id) {
      return sequences.find(function (item) { return item.id === id; }) || null;
    },
  };
})();
