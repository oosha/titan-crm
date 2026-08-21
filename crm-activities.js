// Shared upcoming-activity normalization for the record, full-list and dashboard
// surfaces. New activities persist an ISO `dueAt`; legacy display-string dates are
// parsed conservatively and remain a read-only compatibility fallback.
(function () {
  var WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAY_MS = 24 * 60 * 60 * 1000;
  var TYPE_ICON = { meeting: 'calendar-blank', call: 'phone', email: 'envelope', task: 'clipboard-text', followup: 'clock' };
  var TYPE_LABEL = { meeting: 'Meeting', call: 'Phone', email: 'Email', task: 'Task', followup: 'Follow-up' };

  function clockParts(value) {
    var text = String(value || '').trim();
    var match = text.match(/(?:,|\bat\b)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i);
    if (!match) match = text.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\s*$/i);
    if (!match) return null;
    var rawHour = parseInt(match[1], 10);
    var minute = match[2] ? parseInt(match[2], 10) : 0;
    var period = match[3] ? match[3].toUpperCase() : '';
    if (!period) period = rawHour === 0 || (rawHour >= 7 && rawHour < 12) ? 'AM' : 'PM';
    var displayHour = rawHour % 12 || 12;
    var hour = rawHour % 12;
    if (period === 'PM') hour += 12;
    return {
      h: hour,
      m: minute,
      label: displayHour + ':' + String(minute).padStart(2, '0') + ' ' + period,
    };
  }

  function timeFrom(value) {
    var match = clockParts(value);
    if (!match) return { h: 0, m: 0 };
    return { h: match.h, m: match.m };
  }

  function normalizeLegacyDue(value) {
    var text = String(value || '').trim();
    var normalized = '';
    if (text && !/^overdue$/i.test(text)) {
      var monthDay = text.match(/^([A-Za-z]{3})[a-z]*\s+(\d{1,2})\b/i);
      var dayMonth = text.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\b/i);
      var monthName = '';
      var day = '';
      if (monthDay && MONTHS.indexOf(monthDay[1].toLowerCase()) !== -1) {
        monthName = monthDay[1].slice(0, 1).toUpperCase() + monthDay[1].slice(1, 3).toLowerCase();
        day = monthDay[2];
      } else if (dayMonth && MONTHS.indexOf(dayMonth[2].toLowerCase()) !== -1) {
        monthName = dayMonth[2].slice(0, 1).toUpperCase() + dayMonth[2].slice(1, 3).toLowerCase();
        day = dayMonth[1];
      }
      if (monthName) {
        var dateClock = clockParts(text);
        normalized = day + ' ' + monthName + (dateClock ? ', ' + dateClock.label : '');
      } else {
        var weekday = text.match(/^(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)/i);
        if (weekday) {
          var weekdayClock = clockParts(text);
          normalized = weekday[1].slice(0, 3).toLowerCase().replace(/^./, function (letter) { return letter.toUpperCase(); }) +
            (weekdayClock ? ', ' + weekdayClock.label : '');
        } else if (/^tomorrow$/i.test(text)) {
          normalized = 'Tomorrow';
        } else if (/^this week$/i.test(text)) {
          normalized = 'This week';
        } else {
          normalized = text;
        }
      }
    }
    return normalized || 'No due date';
  }

  function validDueAt(value) {
    if (!value) return null;
    var date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  function sameDay(first, second) {
    return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
  }

  function clockLabel(date) {
    var hour = date.getHours();
    var period = hour >= 12 ? 'PM' : 'AM';
    return (hour % 12 || 12) + ':' + String(date.getMinutes()).padStart(2, '0') + ' ' + period;
  }

  function scheduledLabel(date, now) {
    var tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    if (sameDay(date, now)) return 'Today, ' + clockLabel(date);
    if (sameDay(date, tomorrow)) return 'Tomorrow, ' + clockLabel(date);
    return date.getDate() + ' ' + MONTH_LABELS[date.getMonth()] + ', ' + clockLabel(date);
  }

  function calendarDaysAgo(date, now) {
    var dueDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    var today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.max(0, Math.round((today - dueDay) / DAY_MS));
  }

  function overdueAgeLabel(daysAgo) {
    if (daysAgo === 1) return 'Yesterday';
    if (daysAgo < 7) return daysAgo + ' days ago';
    if (daysAgo < 30) {
      var weeks = Math.floor(daysAgo / 7);
      return weeks + ' week' + (weeks === 1 ? '' : 's') + ' ago';
    }
    if (daysAgo < 365) {
      var months = Math.floor(daysAgo / 30);
      return months + ' month' + (months === 1 ? '' : 's') + ' ago';
    }
    var years = Math.floor(daysAgo / 365);
    return years + ' year' + (years === 1 ? '' : 's') + ' ago';
  }

  function dueInfo(activityOrValue, overdueOverride, now) {
    var activity = activityOrValue && typeof activityOrValue === 'object' && !(activityOrValue instanceof Date)
      ? activityOrValue
      : { date: activityOrValue };
    now = now || new Date();
    var legacy = String(activity.date || '').trim();
    var canonical = validDueAt(activity.dueAt);
    var when = canonical || whenReads(legacy, now);
    var overdue = typeof overdueOverride === 'boolean'
      ? overdueOverride
      : Boolean(activity.overdue) || /^overdue$/i.test(legacy) || Boolean(when && when < now);
    var label;
    if (overdue) {
      var daysAgo = when ? calendarDaysAgo(when, now) : null;
      if (when && sameDay(when, now)) label = 'Overdue · Today, ' + clockLabel(when);
      else if (daysAgo > 0) label = 'Overdue · ' + overdueAgeLabel(daysAgo);
      else label = 'Overdue';
    } else if (canonical) {
      label = scheduledLabel(canonical, now);
    } else {
      label = normalizeLegacyDue(legacy);
    }
    return { label: label, when: when, overdue: overdue, undated: !canonical && !legacy };
  }

  function formatDue(activityOrValue, overdue, now) {
    return dueInfo(activityOrValue, overdue, now).label;
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
          var due = dueInfo(activity, undefined, now);
          rows.push({
            act: activity,
            index: index,
            card: card,
            pipeline: pipeline,
            pipelineId: pipelineId,
            when: due.when ? due.when.getTime() : null,
            overdue: due.overdue,
            due: due,
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
    dueInfo: dueInfo,
    formatDue: formatDue,
    iconOf: function (type) { return TYPE_ICON[type] || TYPE_ICON.task; },
    labelOf: function (type) { return TYPE_LABEL[type] || TYPE_LABEL.task; },
  };
})();
