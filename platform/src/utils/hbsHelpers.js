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
 * Logical OR
 * Usage: {{#if (or a b)}} ... {{/if}}
 */
Handlebars.registerHelper("or", function (...args) {
  return args.slice(0, -1).some(Boolean);
});

/**
 * Optional: you can export to reuse if needed
 */
export default Handlebars.helpers;

Handlebars.registerHelper("json", function (value) {
  try {
    return new Handlebars.SafeString(JSON.stringify(value ?? {}));
  } catch {
    return new Handlebars.SafeString("{}");
  }
});
