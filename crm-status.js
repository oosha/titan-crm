// Record status — the outcome axis, running alongside stage.
//
// Stage is where a record has reached in the process; status is how it turned
// out. They stay separate on purpose: a record can sit in the last stage and
// still be open, and a record can be Lost from any stage at all.
//
// Status used to exist only on sales boards — opportunity-view.html's
// renderStatus() bailed out on `pipeline.entity !== 'Opportunity'`, so Projects,
// Orders, Candidates and plain Records had no way to record an outcome. Won/Lost
// was never the general idea, only the sales vocabulary for it. Every record type
// finishes somehow; this module gives each one its own words for it.
//
// Standalone module, one window.titanStatus global and no imports, because
// crm.html and opportunity-view.html share no other script — same reason
// crm-owner.js is shaped this way.
(function () {
  // Every vocabulary opens with the same word. Nothing has happened yet is the
  // same idea whatever the record is, and keeping it identical means a card that
  // moves between pipeline types stays legible.
  var OPEN = 'In progress';

  // Before anyone has touched it. Sits ahead of OPEN in every vocabulary because
  // "arrived" and "being worked" are different things worth telling apart — a board
  // full of untouched leads looks identical to a busy one otherwise. New records get
  // it at creation, and it clears itself the moment work visibly starts (syncToStage).
  var NEW = 'New';

  // tone drives colour only; the word carries the meaning.
  //   new       arrived, nobody has started on it
  //   open      being worked
  //   positive  finished the way you wanted
  //   negative  finished the way you didn't
  //   paused    stopped without finishing — not an outcome, an absence of one
  var VOCAB = {
    Opportunity: [
      { value: NEW,         tone: 'new' },
      { value: OPEN,        tone: 'open' },
      { value: 'Won',       tone: 'positive' },
      { value: 'Lost',      tone: 'negative' },
    ],
    Project: [
      { value: NEW,         tone: 'new' },
      { value: OPEN,        tone: 'open' },
      { value: 'Delivered', tone: 'positive' },
      { value: 'Cancelled', tone: 'negative' },
      // A stalled project reads as merely quiet otherwise — the board can't tell
      // "waiting on the client" from "nobody has touched this in three weeks".
      { value: 'On hold',   tone: 'paused' },
    ],
    Order: [
      { value: NEW,         tone: 'new' },
      { value: OPEN,        tone: 'open' },
      { value: 'Fulfilled', tone: 'positive' },
      { value: 'Cancelled', tone: 'negative' },
      // Fulfilled and then reversed. Distinct from cancelled-before-fulfilment,
      // because the revenue was booked and then taken back.
      { value: 'Returned',  tone: 'negative' },
    ],
    Candidate: [
      { value: NEW,         tone: 'new' },
      { value: OPEN,        tone: 'open' },
      { value: 'Hired',     tone: 'positive' },
      { value: 'Rejected',  tone: 'negative' },
      // Rejected-by-us and withdrew-themselves are different events, and hiring
      // teams count them separately — collapsing the two makes a reject rate lie.
      { value: 'Withdrawn', tone: 'negative' },
    ],
    Record: [
      { value: NEW,         tone: 'new' },
      { value: OPEN,        tone: 'open' },
      { value: 'Done',      tone: 'positive' },
      { value: 'Cancelled', tone: 'negative' },
    ],
  };

  function values(entity) { return VOCAB[entity] || VOCAB.Record; }

  function positiveOf(entity) {
    var hit = values(entity).find(function (v) { return v.tone === 'positive'; });
    return hit ? hit.value : 'Done';
  }

  // The tone for a stored status. An unrecognised value is looked up across every
  // vocabulary before giving up, so a card keeps its colour when its pipeline's
  // entity is changed underneath it — "Won" on a board since retyped to Orders
  // still reads as a win rather than silently going grey.
  function toneOf(entity, status) {
    if (!status) return 'open';
    var hit = values(entity).find(function (v) { return v.value === status; });
    if (hit) return hit.tone;
    for (var key in VOCAB) {
      hit = VOCAB[key].find(function (v) { return v.value === status; });
      if (hit) return hit.tone;
    }
    return 'open';
  }

  // What this card's status actually is. Cards written before the Status field
  // existed carry a `won` boolean instead; read it as that entity's positive
  // outcome so old sample data keeps its pill.
  function current(card, entity) {
    if (!card) return OPEN;
    if (card.status) return card.status;
    if (card.won) return positiveOf(entity);
    return OPEN;
  }

  // "Not finished yet" is two tones, not one — New and In progress differ in how far
  // along a record is, not in whether it has an outcome. Anything counting settled
  // records must ask this rather than testing for 'open', or every untouched record
  // silently drops out of the totals.
  function isOpenTone(tone) { return tone === 'open' || tone === 'new'; }
  function isOpen(card, entity) { return isOpenTone(toneOf(entity, current(card, entity))); }

  // Moving a record off the first stage means work has started, so a record still
  // marked New is really In progress — nobody should have to update two things to say
  // the same thing. Only ever promotes: it won't touch a record you've set by hand,
  // and it won't put a record back to New when you drag it home again.
  // Returns whether it changed anything, so callers know if they need to persist.
  function syncToStage(card, pipeline) {
    if (!card || !pipeline) return false;
    var first = (pipeline.stages || [])[0];
    if (!first || card.stage === first.key) return false;
    if (current(card, pipeline.entity) !== NEW) return false;
    card.status = OPEN;
    return true;
  }

  // ds-badge modifier for a tone, for surfaces that show the outcome as a pill.
  // Open records get no badge at all — the board shows their last activity there.
  var BADGE = { positive: 'ds-badge--success', negative: 'ds-badge--danger', paused: 'ds-badge--warning' };
  function badgeClass(tone) { return BADGE[tone] || ''; }

  window.titanStatus = {
    OPEN: OPEN, NEW: NEW, values: values, toneOf: toneOf, current: current,
    isOpen: isOpen, isOpenTone: isOpenTone, syncToStage: syncToStage,
    positiveOf: positiveOf, badgeClass: badgeClass,
  };
})();
