/*
 * Persona: anon — the "before" state. A full mailbox, and a CRM with nothing in it yet.
 *
 * This file is INTENTIONALLY INERT: it defines no window.TITAN_PERSONAS.anon.
 *
 * That is what makes the mailbox work. index.html's applyPersona() only replaces the
 * mailbox when it finds a persona object — with none, its own static demo threads (the
 * default persona's mail) are left exactly as they are, which is precisely what this
 * persona wants: all of the default emails, none of its pipelines. Defining an object
 * here would be actively worse than leaving it undefined — renderPersonaMailbox() reads
 * p.mailbox.threads unconditionally, so an object without a hand-copied mailbox both
 * throws and wipes the inbox we're trying to keep.
 *
 * The CRM half is the part that differs, and it comes from the API, not from here:
 * data/personas/anon.json holds an empty `pipelines` map, so /crm opens on its
 * "no pipelines yet" state. Once someone creates a pipeline in the app it is saved
 * there like any other persona's.
 *
 * The file exists at all only so the loader's document.write('/personas/anon.js')
 * resolves instead of 404ing. Do not "finish" it by adding an account block.
 */
