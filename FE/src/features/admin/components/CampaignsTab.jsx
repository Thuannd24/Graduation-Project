// The campaign builder used to live in a single ~1700-line file. It's now
// split into focused modules under `./campaigns/`. This file re-exports the
// entry component so existing imports (`AdminDashboardPage`, etc.) keep working
// without any changes.
export { default } from "./campaigns/CampaignsTab.jsx";
