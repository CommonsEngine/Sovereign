import Handlebars from "handlebars";

/**
 * Logical AND
 * Usage: {{#if (and a b)}} ... {{/if}}
 */
Handlebars.registerHelper("and", function (...args) {
  // last arg is Handlebars' options object
  return args.slice(0, -1).every(Boolean);
});

/**
 * Not Equal
 * Usage: {{#if (neq a b)}} ... {{/if}}
 */
Handlebars.registerHelper("neq", function (a, b) {
  return a !== b;
});

/**
 * Equal
 * Usage: {{#if (eq a b)}} ... {{/if}}
 */
Handlebars.registerHelper("eq", function (a, b) {
  return a === b;
});

/**
 * Optional: you can export to reuse if needed
 */
export default Handlebars.helpers;
