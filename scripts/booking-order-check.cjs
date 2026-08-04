// What the booking-order setting actually does to the customer's path.
//
// The setting was reordering the menu rows and nothing else: stepOrder() keyed on where the
// customer tapped and never looked at the flow, so past the first tap every shop behaved like
// service_first. These assertions are about the ORDER a customer walks, per flow and per entry.

// This one IMPORTS the real functions rather than reading the source, because the thing being
// asserted is an order computed at runtime, not a string that appears in a file.
//
// Node strips the types out of a `.ts` file on its own now, so `tsx` is not needed — but its
// ESM resolver still demands a file extension, and `bookingUrl.ts` imports `./bookingFlow`
// the way TypeScript writes it, with none. That mismatch is what made this script the only one
// of the six that crashed instead of running. One resolve hook, rather than putting `.ts`
// extensions through the app's own imports to satisfy a checker.
const { registerHooks } = require('node:module');
const { existsSync } = require('node:fs');
const { dirname, resolve: resolvePath } = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier) && context.parentURL) {
      const candidate = resolvePath(dirname(fileURLToPath(context.parentURL)), `${specifier}.ts`);
      if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

let pass = 0;
let fail = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass += 1; return; }
  fail += 1;
  console.log(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
}

(async () => {
  const { stepOrder, nextMissingStep } = await import('../src/shared/bookingUrl.ts');
  const { BOOKING_FLOWS, flowEntryOrder } = await import('../src/shared/bookingFlow.ts');

  /* ------------------------------------------------- the setting is obeyed */

  // Entering on the row the owner put first: the path is exactly the owner's order.
  for (const flow of BOOKING_FLOWS) {
    const order = flowEntryOrder(flow);
    check(`${flow}: entering on its own first row follows the setting`, stepOrder(order[0], flow), order);
  }

  // Entering somewhere else: that row leads, the REST still follows the owner's order.
  check('time_first, tapped Services -> service, then time, then staff',
    stepOrder('service', 'time_first'), ['service', 'datetime', 'staff']);
  check('time_first, tapped Specialist -> staff, then time, then service',
    stepOrder('staff', 'time_first'), ['staff', 'datetime', 'service']);
  check('staff_first, tapped Date -> date, then staff, then service',
    stepOrder('datetime', 'staff_first'), ['datetime', 'staff', 'service']);
  check('service_first, tapped Specialist -> staff, then service, then date',
    stepOrder('staff', 'service_first'), ['staff', 'service', 'datetime']);

  // THE REGRESSION: before the fix these two were identical, because the flow was ignored.
  const tappedServiceUnderTimeFirst = stepOrder('service', 'time_first');
  const tappedServiceUnderServiceFirst = stepOrder('service', 'service_first');
  check('the same entry under different flows now differs',
    tappedServiceUnderTimeFirst !== tappedServiceUnderServiceFirst &&
      JSON.stringify(tappedServiceUnderTimeFirst) !== JSON.stringify(tappedServiceUnderServiceFirst),
    true);

  /* ------------------------------------------------------------ invariants */

  for (const flow of BOOKING_FLOWS) {
    for (const entry of ['staff', 'service', 'datetime']) {
      const order = stepOrder(entry, flow);
      check(`${flow}/${entry}: three steps, no repeats`, new Set(order).size, 3);
      check(`${flow}/${entry}: starts where the customer tapped`, order[0], entry);
    }
  }

  // Unknown flow degrades to today's behaviour rather than an empty path.
  check('a junk flow falls back to service_first', stepOrder('service', 'nonsense'), ['service', 'staff', 'datetime']);
  check('no flow given still works', stepOrder('service'), ['service', 'staff', 'datetime']);

  /* --------------------------------------------- what the CTA asks for next */

  const empty = { staffId: null, serviceIds: [], date: null, time: null };

  check('time_first asks for the date first',
    nextMissingStep(empty, { needsStaff: true, entry: 'datetime', flow: 'time_first' }), 'datetime');
  check('staff_first asks for the specialist first',
    nextMissingStep(empty, { needsStaff: true, entry: 'staff', flow: 'staff_first' }), 'staff');
  check('service_first asks for the service first',
    nextMissingStep(empty, { needsStaff: true, entry: 'service', flow: 'service_first' }), 'service');

  // service_only never asks for a specialist, whatever else is missing.
  check('service_only never asks for a specialist',
    nextMissingStep({ ...empty, serviceIds: [3] }, { needsStaff: false, entry: 'service', flow: 'service_only' }),
    'datetime');
  check('service_only completes without a specialist',
    nextMissingStep({ staffId: null, serviceIds: [3], date: '2026-08-10', time: '10:00' },
      { needsStaff: false, entry: 'service', flow: 'service_only' }), null);

  // A complete selection is complete under every flow.
  const full = { staffId: 4, serviceIds: [3], date: '2026-08-10', time: '10:00' };
  for (const flow of BOOKING_FLOWS) {
    check(`${flow}: a full selection is done`, nextMissingStep(full, { needsStaff: true, entry: 'service', flow }), null);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
