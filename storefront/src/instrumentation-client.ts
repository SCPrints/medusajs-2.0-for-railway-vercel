import { initBotId } from "botid/client/core"

// Vercel BotID: attaches an invisible challenge token to these requests so the
// relay's checkBotId() can tell browsers from scripts. Every path whose route
// calls leadRelayHeaders() with the bot check on MUST be listed here.
initBotId({
  protect: [
    { path: "/api/contact", method: "POST" },
    { path: "/api/quote", method: "POST" },
    { path: "/api/quote-bridge/poa", method: "POST" },
  ],
})
