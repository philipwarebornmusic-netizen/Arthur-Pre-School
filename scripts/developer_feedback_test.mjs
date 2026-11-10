import { readFileSync } from "node:fs";
import vm from "node:vm";

const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const mealsSource = readFileSync(new URL("../meals.js", import.meta.url), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function functionSource(name) {
  let start = appSource.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} saknas`);
  if (appSource.slice(start - 6, start) === "async ") start -= 6;
  const brace = appSource.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = brace; index < appSource.length; index += 1) {
    const char = appSource[index];
    if (escaped) { escaped = false; continue; }
    if (quote) {
      if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) return appSource.slice(start, index + 1);
  }
  throw new Error(`${name} kunde inte läsas`);
}

const requests = [];
const context = {
  Date,
  URLSearchParams,
  state: {
    profile: { role: "parent", name: "Exempel Förälder", email: "exempel@example.test" },
    view: "feedback",
    feedbackSourceView: "pickup",
  },
  assistantResult: (text, source, action = {}) => ({ text, source, ...action }),
  fetch: async (url, options) => {
    requests.push({ url, options });
    return { ok: true };
  },
};
vm.createContext(context);
vm.runInContext([
  functionSource("roleLabel"),
  functionSource("feedbackContextLabel"),
  functionSource("developerFeedbackFields"),
  functionSource("sendDeveloperFeedback"),
  functionSource("assistantDeveloperFeedbackRequest"),
  functionSource("executeAssistantMutation"),
].join("\n"), context);

const anonymous = vm.runInContext(`developerFeedbackFields({ category: "problem", message: "Knappen svarar inte", includeContact: false, sourceView: "pickup" })`, context);
assert(anonymous.contact === "", "namn och e-post får inte följa med utan ett aktivt val");
assert(!Object.values(anonymous).some((value) => String(value).includes("barn")), "feedbackpayloaden får inte lägga till barnuppgifter");

const identified = vm.runInContext(`developerFeedbackFields({ category: "idea", message: "Jag vill bli kontaktad", includeContact: true, sourceView: "home" })`, context);
assert(identified.contact.includes("Exempel Förälder") && identified.contact.includes("exempel@example.test"), "frivillig kontakt ska lägga till profilens namn och e-post");
assert(anonymous.role === "Förälder" && anonymous.context === "Schema", "rollen och den aktuella vyn ska följa med");
const proposal = vm.runInContext(`assistantDeveloperFeedbackRequest("Ge feedback till developer: Schemaknappen borde vara tydligare")`, context);
assert(proposal?.mutation?.kind === "developer-feedback", "en tydlig feedbackfråga ska skapa en bekräftningsbar åtgärd");
assert(proposal.mutation.message === "Schemaknappen borde vara tydligare", "assistenten ska skicka själva meddelandet utan kommandoprefix");
assert(proposal.confirmationLabel === "Skicka feedback" && proposal.text.includes("inte ditt namn eller din e-post"), "assistenten ska kräva bekräftelse och förklara avsändardatan");

const incomplete = vm.runInContext(`assistantDeveloperFeedbackRequest("Jag vill ge feedback")`, context);
for (const [role, expected] of [["staff", "Personal"], ["admin", "Organisation"]]) {
  context.state.profile.role = role;
  const fields = vm.runInContext(`developerFeedbackFields({ category: "idea", message: "Ett rolltest för feedback", includeContact: false, sourceView: "feedback" })`, context);
  assert(fields.role === expected, `${role} ska skickas med sin synliga rolletikett`);
}
context.state.profile.role = "parent";
assert(!incomplete.mutation && incomplete.view === "feedback", "feedback utan ett meddelande ska öppna formuläret i stället för att skicka");

const result = await vm.runInContext(`executeAssistantMutation(${JSON.stringify(proposal.mutation)})`, context);
assert(requests.length === 1 && requests[0].url === "/" && requests[0].options.method === "POST", "bekräftad assistentfeedback ska skickas en gång till Netlify Forms");
const submitted = new URLSearchParams(requests[0].options.body);
assert(submitted.get("form-name") === "developer-feedback" && submitted.get("message") === proposal.mutation.message, "Netlify-posten ska använda feedbackformulärets namn och exakta text");
assert(submitted.get("contact") === "", "assistenten får inte lägga till kontaktuppgifter utan formulärets aktiva val");
assert(result.text.includes("skickad till utvecklaren"), "en lyckad skickning ska ge en konkret kvittens");

context.fetch = async () => ({ ok: false });
let failed = false;
try {
  await vm.runInContext(`sendDeveloperFeedback({ category: "problem", message: "Det här går inte att skicka", includeContact: false })`, context);
} catch (error) {
  failed = error.message.includes("kunde inte skickas");
}
assert(failed, "ett misslyckat Netlify-svar ska visas som ett fel, inte som en lyckad skickning");

const mealContext = {};
vm.createContext(mealContext);
vm.runInContext(mealsSource, mealContext);
for (const role of ["parent", "staff", "admin"]) {
  assert(mealContext.ArtanMeals.allowedViews(role).includes("feedback"), `${role} ska ha tillgång till feedbackvyn`);
  assert(mealContext.ArtanMeals.buriedViews(role).includes("feedback"), `${role} ska hitta feedback under Mer`);
}

console.log("developer feedback checks passed");
