// Shared upcoming-activity normalization for the full list and dashboard preview.
// Activity dates are still display strings in persisted records, so parsing is
// intentionally conservative: understood dates sort chronologically and unknown
// values remain at the end instead of being guessed into the wrong position.
(function () {
  var WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var TYPE_ICON = { meeting: 'calendar-blank', call: 'phone', email: 'envelope', task: 'clipboard-text', followup: 'clock' };
  var TYPE_LABEL = { meeting: 'Meeting', call: 'Phone', email: 'Email', task: 'Task', followup: 'Follow-up' };

  function timeFrom(value) {
    var match = String(value || '').match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (!match) return { h: 0, m: 0 };
    var hour = parseInt(match[1], 10) % 12;
    if (/pm/i.test(match[3])) hour += 12;
    return { h: hour, m: match[2] ? parseInt(match[2], 10) : 0 };
  }

  function whenReads(value, now) {
    var text = String(value || '').trim();
    if (!text) return null;
    now = now || new Date();
    var time = timeFrom(text);
    var monthDay = text.match(/^([A-Za-z]{3})[a-z]*\s+(\d{1,2})\b/);
    if (!monthDay) {
      var dayMonth = text.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\b/);
      if (dayMonth) monthDay = [dayMonth[0], dayMonth[2], dayMonth[1]];
    }
    if (monthDay) {
      var monthIndex = MONTHS.indexOf(monthDay[1].toLowerCase());
      if (monthIndex !== -1) {
        var dated = new Date(now.getFullYear(), monthIndex, parseInt(monthDay[2], 10), time.h, time.m);
        if (monthIndex - now.getMonth() > 6) dated.setFullYear(now.getFullYear() - 1);
        return dated;
      }
    }
    var weekday = text.match(/^([A-Za-z]{3})/);
    if (weekday) {
      var weekdayIndex = WEEKDAYS.indexOf(weekday[1].toLowerCase());
      if (weekdayIndex !== -1) {
        var next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), time.h, time.m);
        next.setDate(next.getDate() + ((weekdayIndex - now.getDay() + 7) % 7));
        return next;
      }
    }
    return null;
  }

  function build(pipelines, now) {
    var rows = [];
    now = now || new Date();
    Object.keys(pipelines || {}).forEach(function (pipelineId) {
      var pipeline = pipelines[pipelineId] || {};
      (pipeline.cards || []).forEach(function (card) {
        (card.upcomingActivities || []).forEach(function (activity, index) {
          var when = whenReads(activity.date, now);
          rows.push({
            act: activity,
            index: index,
            card: card,
            pipeline: pipeline,
            pipelineId: pipelineId,
            when: when ? when.getTime() : null,
            overdue: Boolean(activity.overdue) || Boolean(when && when < now),
          });
        });
      });
    });
    function rank(row) {
      if (row.when !== null) return row.when;
      return row.overdue ? -Infinity : Infinity;
    }
    return rows.sort(function (a, b) { return rank(a) - rank(b); });
  }

  window.titanActivities = {
    build: build,
    whenReads: whenReads,
    iconOf: function (type) { return TYPE_ICON[type] || TYPE_ICON.task; },
    labelOf: function (type) { return TYPE_LABEL[type] || TYPE_LABEL.task; },
  };
})();
